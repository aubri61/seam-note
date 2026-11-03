package com.seamnote.backend.auth.config;
import com.seamnote.backend.auth.token.*;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import java.time.*;
@Configuration
public class JwtConfig {
    @Bean JwtSettings jwtSettings(Environment env) { return JwtSettings.from(env); }
    @Bean Clock authClock() { return Clock.systemUTC(); }
    @Bean JwtEncoder jwtEncoder(JwtSettings settings) {
        return NimbusJwtEncoder.withSecretKey(settings.key()).algorithm(MacAlgorithm.HS256).build();
    }
    @Bean JwtDecoder jwtDecoder(JwtSettings settings, Clock clock) {
        var decoder = NimbusJwtDecoder.withSecretKey(settings.key()).macAlgorithm(MacAlgorithm.HS256).validateType(true).build();
        var timestamps = new JwtTimestampValidator(Duration.ofSeconds(30));
        timestamps.setClock(clock);
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(timestamps,
            new JwtIssuerValidator(settings.issuer()), new AccessTokenValidator(settings, clock)));
        return decoder;
    }
}
