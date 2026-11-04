package com.seamnote.backend;
import com.seamnote.backend.auth.config.JwtConfig;
import com.seamnote.backend.auth.token.JwtSettings;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.mock.env.MockEnvironment;
import java.security.SecureRandom;
import java.util.Base64;
import static org.junit.jupiter.api.Assertions.*;
class JwtSettingsTests {
    MockEnvironment environment() {
        byte[] secret=new byte[64];new SecureRandom().nextBytes(secret);
        return new MockEnvironment().withProperty("seam.auth.jwt.secret-base64",Base64.getEncoder().encodeToString(secret))
            .withProperty("seam.auth.jwt.issuer","urn:seam-note:test").withProperty("seam.auth.jwt.audience","test-api");
    }
    @Test void rejectsMissingInvalidShortKeyAndUnsafeSettingsWithoutEchoingKey() {
        for(String invalid:new String[]{"","not-base64-SECRET-INPUT",Base64.getEncoder().encodeToString(new byte[16])}) {
            var env=environment().withProperty("seam.auth.jwt.secret-base64",invalid);
            var error=assertThrows(IllegalStateException.class,()->JwtSettings.from(env));
            if(!invalid.isEmpty()) assertFalse(error.getMessage().contains(invalid));
        }
        assertThrows(IllegalStateException.class,()->JwtSettings.from(environment().withProperty("seam.auth.jwt.issuer","")));
        assertThrows(IllegalStateException.class,()->JwtSettings.from(environment().withProperty("seam.auth.jwt.audience","")));
        for(String ttl:new String[]{"0","901","invalid"})
            assertThrows(IllegalStateException.class,()->JwtSettings.from(environment().withProperty("seam.auth.jwt.access-ttl-seconds",ttl)));
        assertEquals(300,JwtSettings.from(environment()).lifetime().toSeconds());
    }
    @Test void missingSecretPreventsContextStartup() {
        new ApplicationContextRunner().withUserConfiguration(JwtConfig.class)
            .withPropertyValues("seam.auth.jwt.issuer=urn:test","seam.auth.jwt.audience=test-api")
            .run(context->assertNotNull(context.getStartupFailure()));
    }
}
