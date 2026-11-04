package com.seamnote.backend.auth.token;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
@Service
public class AccessTokenIssuer {
    private final JwtEncoder encoder;
    private final JwtSettings settings;
    private final Clock clock;
    public AccessTokenIssuer(JwtEncoder encoder, JwtSettings settings, Clock clock) {
        this.encoder = encoder; this.settings = settings; this.clock = clock;
    }
    public String issue(UUID userId) {
        var now = clock.instant().truncatedTo(ChronoUnit.SECONDS);
        var claims = JwtClaimsSet.builder().issuer(settings.issuer()).audience(List.of(settings.audience()))
            .subject(userId.toString()).issuedAt(now).expiresAt(now.plus(settings.lifetime()))
            .id(UUID.randomUUID().toString()).claim("token_use", "access").build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).type("JWT").build(), claims)).getTokenValue();
    }
    public long expiresIn() { return settings.lifetime().toSeconds(); }
}
