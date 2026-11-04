package com.seamnote.backend.auth.token;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jwt.Jwt;
import java.time.*;
import java.util.UUID;

/** App claims complement (not replace) standard signature/timestamp/issuer validation. */
public final class AccessTokenValidator implements OAuth2TokenValidator<Jwt> {
    private final JwtSettings settings;
    private final Clock clock;
    public AccessTokenValidator(JwtSettings settings, Clock clock) { this.settings = settings; this.clock = clock; }
    @Override public OAuth2TokenValidatorResult validate(Jwt jwt) {
        var issued = jwt.getIssuedAt(); var expiry = jwt.getExpiresAt(); var audience = jwt.getAudience();
        boolean valid = canonicalUuid(jwt.getClaim("sub")) && canonicalUuid(jwt.getClaim("jti"))
            && "access".equals(jwt.getClaim("token_use")) && "JWT".equals(jwt.getHeaders().get("typ"))
            && audience != null && audience.contains(settings.audience())
            && issued != null && expiry != null && expiry.isAfter(issued)
            && !issued.isAfter(clock.instant().plusSeconds(30))
            && !Duration.between(issued, expiry).minus(settings.lifetime()).isPositive();
        return valid ? OAuth2TokenValidatorResult.success() : OAuth2TokenValidatorResult.failure(
            new OAuth2Error("invalid_token", "Access token claims are invalid", null));
    }
    private static boolean canonicalUuid(Object value) {
        if (!(value instanceof String text)) return false;
        try { return UUID.fromString(text).toString().equals(text); }
        catch (IllegalArgumentException invalid) { return false; }
    }
}
