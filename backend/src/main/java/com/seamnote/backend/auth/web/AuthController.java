package com.seamnote.backend.auth.web;
import com.seamnote.backend.auth.password.PasswordAuthService;
import com.seamnote.backend.auth.password.CurrentUserService;
import com.seamnote.backend.auth.session.*;
import jakarta.servlet.http.HttpServletResponse;
import com.seamnote.backend.auth.web.AuthRequests.*;
import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final PasswordAuthService auth;
    private final RefreshSessions sessions;
    private final RefreshCookie cookies;
    private final CurrentUserService users;
    public AuthController(PasswordAuthService auth, RefreshSessions sessions, RefreshCookie cookies, CurrentUserService users) {
        this.auth = auth; this.sessions = sessions; this.cookies = cookies; this.users = users;
    }
    @org.springframework.beans.factory.annotation.Autowired
    org.springframework.beans.factory.ObjectProvider<org.springframework.security.oauth2.client.registration.ClientRegistrationRepository> oauthClients;
    public record AuthConfig(boolean googleEnabled) {}
    @GetMapping("/config") public AuthConfig config() { return new AuthConfig(oauthClients.getIfAvailable()!=null); }
    public record CsrfResponse(String headerName, String token) {}
    public record Accepted(String message) {}
    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken token) { return new CsrfResponse(token.getHeaderName(), token.getToken()); }
    @PostMapping(value = "/signup", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Accepted> signup(@Valid @RequestBody Signup request) {
        auth.signup(request);
        return ResponseEntity.accepted().body(new Accepted("가입 요청을 처리했습니다."));
    }
    @PostMapping(value = "/login", consumes = MediaType.APPLICATION_JSON_VALUE)
    public LoginResponse login(@Valid @RequestBody Login request,
        @CookieValue(name = RefreshCookie.NAME, required = false) String previous, HttpServletResponse response) {
        var user = auth.login(request);
        sessions.logout(previous);
        var issued = sessions.create(user.id());
        cookies.set(response, issued.refreshToken());
        return issued.response();
    }
    @PostMapping("/refresh")
    public LoginResponse refresh(@CookieValue(name = RefreshCookie.NAME, required = false) String raw,
                                 HttpServletResponse response) {
        try {
            var issued = sessions.rotate(raw);
            cookies.set(response, issued.refreshToken());
            return issued.response();
        } catch (com.seamnote.backend.common.exception.BusinessException failure) {
            cookies.clear(response); throw failure;
        }
    }
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@CookieValue(name = RefreshCookie.NAME, required = false) String raw, HttpServletResponse response) {
        sessions.logout(raw); cookies.clear(response);
    }
    @GetMapping("/me")
    public VerifiedUser me(@AuthenticationPrincipal Jwt jwt) { return users.get(UUID.fromString(jwt.getSubject())); }
}
