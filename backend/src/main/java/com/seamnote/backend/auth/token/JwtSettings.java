package com.seamnote.backend.auth.token;
import org.springframework.core.env.Environment;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.time.Duration;
import java.util.Base64;

/** Never bind the raw secret into a record/toString or include it in validation errors. */
public final class JwtSettings {
    private final SecretKey key;
    private final String issuer;
    private final String audience;
    private final Duration lifetime;
    private JwtSettings(SecretKey key, String issuer, String audience, Duration lifetime) {
        this.key = key; this.issuer = issuer; this.audience = audience; this.lifetime = lifetime;
    }
    public static JwtSettings from(Environment env) {
        String secret = env.getProperty("seam.auth.jwt.secret-base64");
        byte[] decoded;
        try { decoded = Base64.getDecoder().decode(secret == null ? "" : secret); }
        catch (IllegalArgumentException invalid) { throw new IllegalStateException("AUTH_JWT_SECRET_BASE64 must be valid Base64 (value redacted)"); }
        if (decoded.length < 32) throw new IllegalStateException("AUTH_JWT_SECRET_BASE64 must decode to at least 32 random bytes (value redacted)");
        String issuer = env.getProperty("seam.auth.jwt.issuer", "");
        String audience = env.getProperty("seam.auth.jwt.audience", "");
        try {
            if (issuer.isBlank() || !URI.create(issuer).isAbsolute() || audience.isBlank() || audience.length() > 200)
                throw new IllegalArgumentException();
        } catch (IllegalArgumentException invalid) { throw new IllegalStateException("JWT issuer must be an absolute URI; audience must be nonblank"); }
        long seconds;
        try { seconds = Long.parseLong(env.getProperty("seam.auth.jwt.access-ttl-seconds", "300")); }
        catch (NumberFormatException invalid) { throw new IllegalStateException("JWT access lifetime must be 1..900 seconds"); }
        if (seconds < 1 || seconds > 900) throw new IllegalStateException("JWT access lifetime must be 1..900 seconds");
        return new JwtSettings(new SecretKeySpec(decoded, "HmacSHA256"), issuer, audience, Duration.ofSeconds(seconds));
    }
    public SecretKey key() { return key; }
    public String issuer() { return issuer; }
    public String audience() { return audience; }
    public Duration lifetime() { return lifetime; }
}
