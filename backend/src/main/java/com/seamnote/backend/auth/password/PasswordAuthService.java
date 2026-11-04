package com.seamnote.backend.auth.password;
import com.seamnote.backend.auth.web.AuthRequests.*;
import com.seamnote.backend.common.exception.*;
import org.springframework.security.authentication.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import com.seamnote.backend.auth.token.JwtSettings;
import java.util.concurrent.Semaphore;

@Service
public class PasswordAuthService {
    private final JwtSettings settings;
    private final UserRegistration registration;
    private final PasswordEncoder encoder;
    private final AuthenticationManager manager;
    private final AuthRateLimiter limiter;
    private final Semaphore hashing = new Semaphore(4);
    public PasswordAuthService(UserRegistration registration, PasswordEncoder encoder,
            AuthenticationManager manager, AuthRateLimiter limiter, JwtSettings settings) {
        this.settings=settings;
        this.registration = registration; this.encoder = encoder; this.manager = manager; this.limiter = limiter;
    }
    public void signup(Signup request) {
        String email = EmailAddress.normalize(request.email());
        limiter.account(email);
        acquire();
        try {
            // Always hash, including duplicates. Do not make an enumeration-friendly exists API.
            String hash = encoder.encode(request.password());
            // Same accepted response for duplicates; never change the existing credential.
            registration.register(email, request.nickname().strip(), hash);
        } finally { hashing.release(); }
    }
    public VerifiedUser login(Login request) {
        String email = EmailAddress.normalize(request.email());
        limiter.account(email);
        acquire();
        try {
            var verified = manager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(email, request.password()));
            var principal = (SeamPrincipal) verified.getPrincipal();
            return new VerifiedUser(principal.id(), principal.getUsername(), principal.nickname(), principal.emailVerified(), settings.issuer(), settings.audience());
        } finally { hashing.release(); }
    }
    private void acquire() {
        if (!hashing.tryAcquire()) throw new BusinessException(ErrorCode.AUTH_RATE_LIMITED);
    }
}
