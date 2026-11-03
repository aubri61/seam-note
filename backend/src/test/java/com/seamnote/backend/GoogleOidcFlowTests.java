package com.seamnote.backend;

import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.*;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.client.registration.*;
import org.springframework.security.oauth2.core.*;
import org.springframework.test.context.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

/** A local signed OIDC provider exercises Spring's actual code/PKCE/ID-token validation, not oidcLogin(). */
@ActiveProfiles("test")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.DEFINED_PORT)
@Import(GoogleOidcFlowTests.ProviderRegistration.class)
class GoogleOidcFlowTests {
    static final JsonMapper JSON=JsonMapper.builder().build();
    static final String ISSUER="https://accounts.google.com",CLIENT="synthetic-google-client";
    static final RSAKey KEY;
    static final HttpServer PROVIDER;
    static final int APP_PORT;
    static final Map<String,Grant> GRANTS=new ConcurrentHashMap<>();
    static final AtomicInteger EXCHANGES=new AtomicInteger();
    record Grant(String subject,String email,String nonce,String challenge,String fault){}
    static {
        try {
            try(var socket=new java.net.ServerSocket(0)){APP_PORT=socket.getLocalPort();}
            KEY=new RSAKeyGenerator(2048).keyID("test-provider-key").generate();
            PROVIDER=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
            PROVIDER.createContext("/jwks",exchange->{
                byte[] bytes=new JWKSet(KEY.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
            });
            PROVIDER.createContext("/token",exchange->{
                try {
                    var form=parse(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
                    var grant=GRANTS.remove(form.get("code"));
                    if(grant==null)throw new IllegalArgumentException();
                    String challenge=Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(form.getOrDefault("code_verifier","").getBytes(StandardCharsets.US_ASCII)));
                    if(!challenge.equals(grant.challenge()))throw new IllegalArgumentException();
                    EXCHANGES.incrementAndGet();var now=Instant.now();
                    var claims=new JWTClaimsSet.Builder().issuer(grant.fault().equals("issuer")?"https://untrusted.example":ISSUER).subject(grant.subject())
                        .audience(grant.fault().equals("aud")?"wrong-client":CLIENT)
                        .issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(grant.fault().equals("expired")?-120:300)))
                        .claim("nonce",grant.fault().equals("nonce")?"wrong-nonce":grant.nonce())
                        .claim("email",grant.email()).claim("email_verified",!grant.fault().equals("unverified")).claim("name","Google 테스트 사용자").build();
                    var token=new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(KEY.getKeyID()).build(),claims);
                    token.sign(new RSASSASigner(KEY));
                    byte[] bytes=JSON.writeValueAsBytes(Map.of("access_token","synthetic-transient-provider-token","token_type","Bearer","expires_in",300,"id_token",token.serialize(),"scope","openid"));
                    exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);
                }catch(Exception rejected){byte[] bytes="{\"error\":\"invalid_grant\"}".getBytes(StandardCharsets.UTF_8);exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(400,bytes.length);exchange.getResponseBody().write(bytes);}
                finally{exchange.close();}
            });
            PROVIDER.start();
        }catch(Exception failure){throw new ExceptionInInitializerError(failure);}
    }
    static String origin(){return "http://localhost:"+APP_PORT;}
    static Map<String,String> parse(String query){
        var values=new HashMap<String,String>();if(query==null)return values;
        for(String part:query.split("&")){var pair=part.split("=",2);values.put(URLDecoder.decode(pair[0],StandardCharsets.UTF_8),pair.length==1?"":URLDecoder.decode(pair[1],StandardCharsets.UTF_8));}return values;
    }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry p){
        p.add("server.port",()->APP_PORT);p.add("seam.auth.google.client-id",()->CLIENT);p.add("seam.auth.google.client-secret",()->"synthetic-secret");
        p.add("seam.auth.frontend-origin",GoogleOidcFlowTests::origin);p.add("seam.auth.google.redirect-uri",()->origin()+"/api/auth/oauth2/callback/google");
    }
    @TestConfiguration static class ProviderRegistration {
        @Bean @Primary ClientRegistrationRepository mockProvider(){
            String provider="http://127.0.0.1:"+PROVIDER.getAddress().getPort();
            return new InMemoryClientRegistrationRepository(ClientRegistration.withRegistrationId("google")
                .clientId(CLIENT).clientSecret("synthetic-secret").clientAuthenticationMethod(ClientAuthenticationMethod.CLIENT_SECRET_BASIC)
                .authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE).redirectUri(origin()+"/api/auth/oauth2/callback/google")
                .scope("openid","email","profile").authorizationUri(provider+"/authorize").tokenUri(provider+"/token")
                .jwkSetUri(provider+"/jwks").issuerUri(ISSUER).userNameAttributeName("sub").clientName("Test Google").build());
        }
    }
    @Autowired JdbcTemplate jdbc;
    static class Browser {
        final CookieManager cookies=new CookieManager(null,CookiePolicy.ACCEPT_ALL);
        final HttpClient http=HttpClient.newBuilder().cookieHandler(cookies).followRedirects(HttpClient.Redirect.NEVER).build();
        HttpResponse<String> get(String path)throws Exception{return http.send(HttpRequest.newBuilder(URI.create(origin()+path)).GET().build(),HttpResponse.BodyHandlers.ofString());}
        HttpResponse<String> post(String path,String csrf)throws Exception{
            return http.send(HttpRequest.newBuilder(URI.create(origin()+path)).header("X-CSRF-TOKEN",csrf).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString("{}")).build(),HttpResponse.BodyHandlers.ofString());
        }
    }
    record Start(Map<String,String> params,String state){}
    Start start(Browser browser)throws Exception{
        var r=browser.get("/api/auth/oauth2/authorization/google");assertEquals(302,r.statusCode());
        var params=parse(URI.create(r.headers().firstValue("location").orElseThrow()).getRawQuery());
        assertEquals("S256",params.get("code_challenge_method"));assertNotNull(params.get("nonce"));assertNotNull(params.get("state"));
        assertEquals(origin()+"/api/auth/oauth2/callback/google",params.get("redirect_uri"));return new Start(params,params.get("state"));
    }
    HttpResponse<String> callback(Browser browser,Start start,String subject,String email,String fault)throws Exception{
        String code=UUID.randomUUID().toString();GRANTS.put(code,new Grant(subject,email,start.params().get("nonce"),start.params().get("code_challenge"),fault));
        return browser.get("/api/auth/oauth2/callback/google?code="+code+"&state="+URLEncoder.encode(start.state(),StandardCharsets.UTF_8));
    }
    @Test void signedOidcCodePkceCreatesPasswordlessAccountAndSharedSession()throws Exception{
        var b=new Browser();String subject=UUID.randomUUID().toString(),email=subject+"@example.test";
        var success=callback(b,start(b),subject,email,"");assertEquals(302,success.statusCode());assertEquals(origin()+"/auth/complete",success.headers().firstValue("location").orElseThrow());
        assertTrue(success.headers().allValues("set-cookie").stream().anyMatch(c->c.startsWith("seam_refresh=")&&c.contains("HttpOnly")));
        var csrf=JSON.readTree(b.get("/api/auth/csrf").body()).get("token").asString();var refresh=b.post("/api/auth/refresh",csrf);assertEquals(200,refresh.statusCode());
        var profile=JSON.readTree(refresh.body());assertTrue(profile.get("user").get("emailVerified").asBoolean());assertTrue(profile.has("accessToken"));
        var id=UUID.fromString(profile.get("user").get("id").asString());
        assertEquals(0,jdbc.queryForObject("select count(*) from password_credentials where user_id=?",Integer.class,id));
        var again=callback(b,start(b),subject,email,"");assertEquals(origin()+"/auth/complete",again.headers().firstValue("location").orElseThrow());
        assertEquals(1,jdbc.queryForObject("select count(*) from external_identities where issuer=? and subject=?",Integer.class,ISSUER,subject));
        assertFalse(success.headers().firstValue("location").orElseThrow().contains("token"));
    }
    @Test void wrongStateNonceAudienceAndReusedCodeAreRejected()throws Exception{
        var b=new Browser();var begin=start(b);int before=EXCHANGES.get();
        var invalid=b.get("/api/auth/oauth2/callback/google?code=unused&state=wrong");assertEquals(origin()+"/login?oauth=failed",invalid.headers().firstValue("location").orElseThrow());assertEquals(before,EXCHANGES.get());
        for(String fault:List.of("nonce","aud","issuer","expired","unverified")){
            var browser=new Browser();String subject=UUID.randomUUID().toString();
            var failed=callback(browser,start(browser),subject,subject+"@example.test",fault);
            assertEquals(origin()+"/login?oauth=failed",failed.headers().firstValue("location").orElseThrow(),fault);
            assertEquals(0,jdbc.queryForObject("select count(*) from external_identities where subject=?",Integer.class,subject));
        }
        var browser=new Browser();var flow=start(browser);var done=callback(browser,flow,UUID.randomUUID().toString(),UUID.randomUUID()+"@example.test","");assertEquals(origin()+"/auth/complete",done.headers().firstValue("location").orElseThrow());
        var replay=browser.get("/api/auth/oauth2/callback/google?code=used&state="+URLEncoder.encode(flow.state(),StandardCharsets.UTF_8));
        assertEquals(origin()+"/login?oauth=failed",replay.headers().firstValue("location").orElseThrow());
    }
    @Test void emailCollisionDoesNotMergeAndProviderCancelHasFixedRedirect()throws Exception{
        String email=UUID.randomUUID()+"@example.test";var id=UUID.randomUUID();jdbc.update("insert into app_users(id,email_normalized,nickname,created_at) values (?,?,?,current_timestamp)",id,email,"이메일 계정");
        var b=new Browser();var failed=callback(b,start(b),UUID.randomUUID().toString(),email,"");assertEquals(origin()+"/login?oauth=failed",failed.headers().firstValue("location").orElseThrow());
        assertEquals(0,jdbc.queryForObject("select count(*) from external_identities where user_id=?",Integer.class,id));
        var flow=start(b);var cancelled=b.get("/api/auth/oauth2/callback/google?error=access_denied&state="+URLEncoder.encode(flow.state(),StandardCharsets.UTF_8)+"&redirect_uri=https://attacker.example");
        assertEquals(origin()+"/login?oauth=failed",cancelled.headers().firstValue("location").orElseThrow());
    }
    @Test void concurrentFirstLoginMapsToOneIdentityAndDisabledAccountIsRejected()throws Exception{
        var first=new Browser();var second=new Browser();var a=start(first);var b=start(second);
        String subject=UUID.randomUUID().toString(),email=subject+"@example.test";
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)){
            var start=new java.util.concurrent.CountDownLatch(1);
            var x=executor.submit(()->{start.await();return callback(first,a,subject,email,"");});
            var y=executor.submit(()->{start.await();return callback(second,b,subject,email,"");});start.countDown();
            assertEquals(origin()+"/auth/complete",x.get().headers().firstValue("location").orElseThrow());
            assertEquals(origin()+"/auth/complete",y.get().headers().firstValue("location").orElseThrow());
        }
        assertEquals(1,jdbc.queryForObject("select count(*) from external_identities where issuer=? and subject=?",Integer.class,ISSUER,subject));
        jdbc.update("update app_users set enabled=false where email_normalized=?",email);
        var rejected=callback(first,start(first),subject,email,"");assertEquals(origin()+"/login?oauth=failed",rejected.headers().firstValue("location").orElseThrow());
    }

}
