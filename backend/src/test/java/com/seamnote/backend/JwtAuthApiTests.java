package com.seamnote.backend;
import com.seamnote.backend.auth.token.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.json.JsonMapper;
import javax.crypto.spec.SecretKeySpec;
import java.net.*;
import java.net.http.*;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import java.util.function.Consumer;
import static org.junit.jupiter.api.Assertions.*;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class JwtAuthApiTests {
    @LocalServerPort int port;
    @Autowired JwtSettings settings;
    @Autowired JwtEncoder encoder;
    @Autowired JwtDecoder decoder;
    @Autowired AccessTokenIssuer issuer;
    @Autowired JdbcTemplate jdbc;
    final JsonMapper json = JsonMapper.builder().build();
    final HttpClient client = HttpClient.newHttpClient();
    UUID user() {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into app_users(id,email_normalized,nickname,created_at) values (?,?,?,current_timestamp)",id,id+"@example.test","JWT 사용자");
        return id;
    }
    HttpResponse<String> get(String path, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path));
        if (token != null) request.header("Authorization","Bearer "+token);
        return client.send(request.GET().build(), HttpResponse.BodyHandlers.ofString());
    }
    String token(UUID id, Consumer<Map<String,Object>> change) {
        var now = Instant.now();
        var claims = JwtClaimsSet.builder().issuer(settings.issuer()).audience(List.of(settings.audience()))
            .subject(id.toString()).issuedAt(now).expiresAt(now.plusSeconds(300))
            .id(UUID.randomUUID().toString()).claim("token_use","access").claims(change).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).type("JWT").build(),claims)).getTokenValue();
    }
    @Test void bearerIdentifiesOnlyItsSubjectAndDoesNotCreateLoginCookie() throws Exception {
        UUID a=user(), b=user(); String token=issuer.issue(a);
        var decoded=decoder.decode(token);
        assertEquals(a.toString(),decoded.getSubject()); assertEquals("HS256",decoded.getHeaders().get("alg"));
        assertFalse(decoded.hasClaim("email")); assertFalse(decoded.hasClaim("nickname")); assertFalse(decoded.hasClaim("password"));
        assertEquals(300,java.time.Duration.between(decoded.getIssuedAt(),decoded.getExpiresAt()).toSeconds());
        var me=get("/api/auth/me?userId="+b,token);
        assertEquals(200,me.statusCode()); assertEquals(a.toString(),json.readTree(me.body()).get("id").asString());
        assertTrue(me.headers().firstValue("cache-control").orElse("").contains("no-store"));
        assertTrue(me.headers().firstValue("set-cookie").isEmpty());
        assertEquals(401,get("/api/auth/me",null).statusCode());
        assertEquals(403,get("/api/auth/private",token).statusCode());
    }
    @Test void renameRequiresBearerAndUpdatesOnlyTheAuthenticatedAccount() throws Exception {
        UUID a = user(), b = user();
        String bearer = issuer.issue(a);
        var path = URI.create("http://127.0.0.1:" + port + "/api/auth/me?userId=" + b);
        var valid = HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("nickname", "  새 이름  ")));
        var request = HttpRequest.newBuilder(path).header("Content-Type", "application/json").method("PATCH", valid);
        assertEquals(401, client.send(request.copy().header("Cookie", "seam_refresh=untrusted").build(),
            HttpResponse.BodyHandlers.ofString()).statusCode());
        request.header("Authorization", "Bearer " + bearer);
        assertEquals(400, client.send(request.copy().method("PATCH", HttpRequest.BodyPublishers.ofString("{\"nickname\":\"x\"}")).build(),
            HttpResponse.BodyHandlers.ofString()).statusCode());
        var result = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, result.statusCode());
        assertEquals("새 이름", json.readTree(result.body()).get("nickname").asString());
        assertEquals("새 이름", json.readTree(get("/api/auth/me", bearer).body()).get("nickname").asString());
        assertEquals("JWT 사용자", json.readTree(get("/api/auth/me", issuer.issue(b)).body()).get("nickname").asString());
    }
    @Test void rejectsWrongClaimsAndNeverEchoesBearer() throws Exception {
        UUID id=user(); var now=Instant.now();
        Map<String,String> cases=new LinkedHashMap<>();
        cases.put("issuer",token(id,c->c.put("iss","urn:other")));
        cases.put("audience",token(id,c->c.put("aud",List.of("other"))));
        cases.put("expiry missing",token(id,c->c.remove("exp")));
        cases.put("issued missing",token(id,c->c.remove("iat")));
        cases.put("subject missing",token(id,c->c.remove("sub")));
        cases.put("subject invalid",token(id,c->c.put("sub","not-a-user-id")));
        cases.put("jti missing",token(id,c->c.remove("jti")));
        cases.put("purpose",token(id,c->c.put("token_use","refresh")));
        cases.put("future issued",token(id,c->{c.put("iat",now.plusSeconds(100));c.put("exp",now.plusSeconds(200));}));
        cases.put("future nbf",token(id,c->c.put("nbf",now.plusSeconds(100))));
        cases.put("expired",token(id,c->{c.put("iat",now.minusSeconds(300));c.put("exp",now.minusSeconds(120));}));
        cases.put("long lifetime",token(id,c->c.put("exp",now.plusSeconds(2000))));
        // The production encoder refuses this invalid time pair before signing. Build the
        // adversarial fixture with Nimbus JOSE so the decoder is exercised over real HTTP.
        var invalidTimes = new com.nimbusds.jwt.SignedJWT(new com.nimbusds.jose.JWSHeader.Builder(com.nimbusds.jose.JWSAlgorithm.HS256)
                .type(com.nimbusds.jose.JOSEObjectType.JWT).build(),
            new com.nimbusds.jwt.JWTClaimsSet.Builder().issuer(settings.issuer()).audience(settings.audience())
                .subject(id.toString()).issueTime(Date.from(now)).expirationTime(Date.from(now.minusSeconds(1)))
                .jwtID(UUID.randomUUID().toString()).claim("token_use", "access").build());
        invalidTimes.sign(new com.nimbusds.jose.crypto.MACSigner(settings.key()));
        cases.put("expiry before issued", invalidTimes.serialize());
        cases.put("malformed","not-a-jwt");
        for(var entry:cases.entrySet()) {
            var result=get("/api/auth/me",entry.getValue());
            assertEquals(401,result.statusCode(),entry.getKey());
            assertEquals("Bearer",result.headers().firstValue("www-authenticate").orElseThrow());
            assertFalse(result.body().contains(entry.getValue()),"Token must not appear in errors");
        }
    }
    @Test void rejectsForgedSignatureOtherKeyAndOtherAlgorithm() throws Exception {
        UUID id=user(); String legitimate=issuer.issue(id);
        String[] segments=legitimate.split("\\.");
        @SuppressWarnings("unchecked") var payload=json.readValue(Base64.getUrlDecoder().decode(segments[1]),Map.class);
        payload.put("sub",UUID.randomUUID().toString());
        String forged=segments[0]+"."+Base64.getUrlEncoder().withoutPadding().encodeToString(json.writeValueAsBytes(payload))+"."+segments[2];
        assertEquals(401,get("/api/auth/me",forged).statusCode());
        var claims=JwtClaimsSet.builder().issuer(settings.issuer()).subject(id.toString()).audience(List.of(settings.audience()))
            .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(100)).id(UUID.randomUUID().toString()).claim("token_use","access").build();
        byte[] other=new byte[64];new SecureRandom().nextBytes(other);
        var wrongKey=NimbusJwtEncoder.withSecretKey(new SecretKeySpec(other,"HmacSHA256")).build();
        String otherToken=wrongKey.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).type("JWT").build(),claims)).getTokenValue();
        assertEquals(401,get("/api/auth/me",otherToken).statusCode());
        var hs384=NimbusJwtEncoder.withSecretKey(new SecretKeySpec(settings.key().getEncoded(),"HmacSHA384")).algorithm(MacAlgorithm.HS384).build();
        String otherAlgorithm=hs384.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS384).type("JWT").build(),claims)).getTokenValue();
        assertEquals(401,get("/api/auth/me",otherAlgorithm).statusCode());
        String unsigned=Base64.getUrlEncoder().withoutPadding().encodeToString("{\"alg\":\"none\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8))+"."+segments[1]+".";
        assertEquals(401,get("/api/auth/me",unsigned).statusCode());
    }
    @Test void doesNotTrustRoleClaimsOrAcceptDisabledDeletedAndUnknownAccounts() throws Exception {
        UUID id=user(); String token=token(id,c->c.put("roles",List.of("ROLE_ADMIN")));
        assertEquals(403,get("/api/auth/private",token).statusCode());
        jdbc.update("update app_users set enabled=false where id=?",id);
        assertEquals(401,get("/api/auth/me",token).statusCode());
        jdbc.update("delete from app_users where id=?",id);
        assertEquals(401,get("/api/auth/me",token).statusCode());
        assertEquals(401,get("/api/auth/me",issuer.issue(UUID.randomUUID())).statusCode());
    }
    @Test void publicCsrfDoesNotTryToValidateStaleBearer() throws Exception {
        assertEquals(200,get("/api/auth/csrf","expired-or-invalid").statusCode());
    }
    @Test void bearerDoesNotBypassCsrfOnPublicPasswordEndpoints() throws Exception {
        String token=issuer.issue(user());
        for(String path:List.of("/api/auth/signup","/api/auth/login")) {
            var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path))
                .header("Authorization","Bearer "+token).header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{}")).build();
            assertEquals(403,client.send(request,HttpResponse.BodyHandlers.ofString()).statusCode());
        }
    }
}
