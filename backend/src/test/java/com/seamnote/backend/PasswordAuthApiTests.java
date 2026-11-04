package com.seamnote.backend;

import com.seamnote.backend.auth.password.*;
import com.seamnote.backend.auth.user.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.net.*;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PasswordAuthApiTests {
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;
    final JsonMapper json = JsonMapper.builder().build();
    static final String PASSWORD = "phase1-test-passphrase";
    record Reply(int status, JsonNode body, HttpHeaders headers) {}
    class Browser {
        final HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
        final String header;
        final String token;
        Browser() throws Exception {
            var response = call("GET", "/api/auth/csrf", null, false);
            assertEquals(200, response.status());
            header = response.body().get("headerName").asString(); token = response.body().get("token").asString();
        }
        Reply call(String method, String path, Object body, boolean csrf) throws Exception {
            String raw = body == null ? null : json.writeValueAsString(body);
            return raw(method, path, raw, csrf);
        }
        Reply raw(String method, String path, String raw, boolean csrf) throws Exception {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .header("Content-Type", "application/json");
            if (csrf) request.header(header, token);
            var result = client.send(request.method(method, raw == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(raw)).build(), HttpResponse.BodyHandlers.ofString());
            return new Reply(result.statusCode(), result.body().isEmpty() ? null : json.readTree(result.body()), result.headers());
        }
        Reply signup(String email, String nickname) throws Exception {
            return call("POST", "/api/auth/signup", Map.of("email", email, "password", PASSWORD, "nickname", nickname), true);
        }
        Reply login(String email, String password) throws Exception {
            return call("POST", "/api/auth/login", Map.of("email", email, "password", password), true);
        }
    }
    String email() { return UUID.randomUUID()+"@example.test"; }
    @Test void signupAndLoginIssueJwtWithoutPersistingAuthenticationSession() throws Exception {
        var b = new Browser(); String email = email();
        assertEquals(202, b.signup("  "+email.toUpperCase(Locale.ROOT)+"  ", "  글쓴이  ").status());
        String hash = jdbc.queryForObject("select password_hash from password_credentials c join app_users u on c.user_id=u.id where email_normalized=?", String.class, email);
        assertNotEquals(PASSWORD, hash); assertTrue(encoder.matches(PASSWORD, hash)); assertTrue(hash.startsWith("$2"));
        var login = b.login(email, PASSWORD);
        assertEquals(200, login.status()); assertEquals(email, login.body().get("user").get("email").asString());
        assertEquals("글쓴이", login.body().get("user").get("nickname").asString()); assertFalse(login.body().get("user").get("emailVerified").asBoolean());
        assertTrue(login.body().get("user").has("id")); assertFalse(login.body().has("password")); assertFalse(login.body().has("passwordHash"));
        assertTrue(login.body().has("accessToken")); assertTrue(login.headers().firstValue("cache-control").orElse("").contains("no-store"));
        assertTrue(login.headers().allValues("set-cookie").stream().anyMatch(c -> c.startsWith("seam_refresh=") && c.contains("HttpOnly")));
        assertEquals(401, b.call("GET", "/api/auth/private", null, false).status(), "CSRF session is not authenticated");
    }
    @Test void concurrentDuplicatesCreateOneCredentialAndDoNotResetIt() throws Exception {
        var b = new Browser(); String email = email();
        var executor = Executors.newFixedThreadPool(2);
        try {
            var start = new CountDownLatch(1);
            var a = executor.submit(() -> { start.await(); return b.signup(email, "첫 닉네임"); });
            var c = executor.submit(() -> { start.await(); return b.signup(email.toUpperCase(Locale.ROOT), "둘 닉네임"); });
            start.countDown(); var first = a.get(); var second = c.get();
            assertEquals(202, first.status()); assertEquals(202, second.status()); assertEquals(first.body(), second.body());
        } finally { executor.shutdownNow(); }
        assertEquals(1, jdbc.queryForObject("select count(*) from app_users where email_normalized=?", Integer.class, email));
        String hash = jdbc.queryForObject("select password_hash from password_credentials c join app_users u on c.user_id=u.id where email_normalized=?", String.class, email);
        assertTrue(encoder.matches(PASSWORD, hash));
        assertEquals(202, b.call("POST", "/api/auth/signup", Map.of("email",email,"nickname","바꾸지 않음","password","different-test-password"), true).status());
        assertEquals(200, b.login(email, PASSWORD).status());
        assertEquals(401, b.login(email, "different-test-password").status());
    }
    @Test void wrongUnknownDisabledAndPasswordlessAccountsHaveSameFailure() throws Exception {
        var b = new Browser(); String email = email(); b.signup(email, "검증 사용자");
        var wrong = b.login(email, "incorrect-test-password"); var absent = b.login(email(), PASSWORD);
        assertEquals(401, wrong.status()); assertEquals(wrong.body(), absent.body());
        jdbc.update("update app_users set enabled=false where email_normalized=?", email);
        assertEquals(wrong.body(), b.login(email, PASSWORD).body());
        String external = email();
        jdbc.update("insert into app_users(id,email_normalized,nickname,created_at) values (?,?,?,current_timestamp)", UUID.randomUUID(), external, "외부 사용자");
        assertEquals(wrong.body(), b.login(external, PASSWORD).body());
    }
    @Test void validationAndBodyLimitDoNotEchoPassword() throws Exception {
        var b = new Browser(); String secret = "REJECTED-SECRET-".repeat(1000);
        var tooLarge = b.call("POST", "/api/auth/signup", Map.of("email",email(),"nickname","표시이름","password",secret), true);
        assertEquals(413, tooLarge.status()); assertFalse(tooLarge.body().toString().contains("REJECTED-SECRET"));
        var invalid = b.call("POST", "/api/auth/signup", Map.of("email","bad","nickname"," ","password","short-secret"), true);
        assertEquals(400, invalid.status()); assertFalse(invalid.body().toString().contains("short-secret"));
        assertEquals(400, b.raw("POST", "/api/auth/login", "{broken", true).status());
    }
    @Test void csrfIsRequiredEvenForPublicSignupAndLogin() throws Exception {
        var b = new Browser(); String email = email();
        assertEquals(403, b.call("POST", "/api/auth/signup", Map.of("email",email,"nickname","표시이름","password",PASSWORD), false).status());
        assertEquals(403, b.call("POST", "/api/auth/login", Map.of("email",email,"password",PASSWORD), false).status());
        assertEquals(0, jdbc.queryForObject("select count(*) from app_users where email_normalized=?", Integer.class, email));
    }
    @Test void duplicateNicknamesAreAllowedAndPasswordLengthUsesUtf8Bytes() throws Exception {
        var b = new Browser(); String a = email(), c = email();
        assertEquals(202, b.signup(a, "같은 이름").status()); assertEquals(202, b.signup(c, "같은 이름").status());
        String unicode = "가".repeat(24);
        String email = email();
        assertEquals(202, b.call("POST", "/api/auth/signup", Map.of("email",email,"nickname","한글 암호","password",unicode), true).status());
        assertEquals(200, b.login(email, unicode).status());
        assertEquals(400, b.login(email, unicode+"가").status());
    }
    @Test void accountLimitAppliesToCaseVariantsAndReturnsRetryAfter() throws Exception {
        var b = new Browser(); String email = email();
        for (int i=0;i<10;i++) assertEquals(401, b.login(i%2==0?email:email.toUpperCase(Locale.ROOT), PASSWORD).status());
        var limited = b.login(email, PASSWORD);
        assertEquals(429, limited.status()); assertEquals("60", limited.headers().firstValue("retry-after").orElseThrow());
    }
    @Test void userAndCredentialInsertRollbackTogether() {
        String email = email();
        // Invalid credential value forces the second insert to fail after the first insert succeeded.
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
            () -> registration.register(email, "롤백 검증", null));
        assertEquals(0, jdbc.queryForObject("select count(*) from app_users where email_normalized=?", Integer.class, email));
    }
    @Autowired UserRegistration registration;
    @Test void cookieRefreshAndLogoutRequireCsrfAndRotate() throws Exception {
        var b=new Browser();var email=email();b.signup(email,"쿠키 테스트");var login=b.login(email,PASSWORD);
        var cookie=login.headers().allValues("set-cookie").stream().filter(c->c.startsWith("seam_refresh=")).findFirst().orElseThrow();
        assertTrue(cookie.contains("Path=/api/auth"));assertTrue(cookie.contains("HttpOnly"));assertTrue(cookie.contains("SameSite=Lax"));assertFalse(cookie.contains("Domain="));
        assertEquals(403,b.call("POST","/api/auth/refresh",Map.of(),false).status());
        var bearer=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/auth/refresh"))
            .header("Authorization","Bearer "+login.body().get("accessToken").asString())
            .POST(HttpRequest.BodyPublishers.noBody()).build();
        assertEquals(403,b.client.send(bearer,HttpResponse.BodyHandlers.discarding()).statusCode());
        var refreshed=b.call("POST","/api/auth/refresh",Map.of(),true);assertEquals(200,refreshed.status());
        assertNotEquals(cookie,refreshed.headers().firstValue("set-cookie").orElseThrow());
        assertEquals(403,b.call("POST","/api/auth/logout",Map.of(),false).status());
        var logout=b.call("POST","/api/auth/logout",Map.of(),true);assertEquals(204,logout.status());
        assertTrue(logout.headers().allValues("set-cookie").stream().anyMatch(c->c.contains("Max-Age=0")));
        assertEquals(401,b.call("POST","/api/auth/refresh",Map.of(),true).status());
        assertEquals(204,b.call("POST","/api/auth/logout",Map.of(),true).status());
    }

}
