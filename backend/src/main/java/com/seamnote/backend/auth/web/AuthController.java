package com.seamnote.backend.auth.web;
import com.seamnote.backend.auth.password.PasswordAuthService;
import com.seamnote.backend.auth.password.CurrentUserService;
import com.seamnote.backend.auth.token.AccessTokenIssuer;
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
    private final AccessTokenIssuer tokens;
    private final CurrentUserService users;
    public AuthController(PasswordAuthService auth, AccessTokenIssuer tokens, CurrentUserService users) {
        this.auth = auth; this.tokens = tokens; this.users = users;
    }
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
    public LoginResponse login(@Valid @RequestBody Login request) {
        var user = auth.login(request);
        return new LoginResponse(user, tokens.issue(user.id()), "Bearer", tokens.expiresIn());
    }
    @GetMapping("/me")
    public VerifiedUser me(@AuthenticationPrincipal Jwt jwt) { return users.get(UUID.fromString(jwt.getSubject())); }
}
