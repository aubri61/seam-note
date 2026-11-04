package com.seamnote.backend;
import com.seamnote.backend.auth.password.*;
import com.seamnote.backend.auth.web.AuthRequests.*;
import com.seamnote.backend.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import java.time.*;
import static org.junit.jupiter.api.Assertions.*;
class AuthPolicyTests {
    @Test void passwordBoundariesAndDtoRedaction() {
        var policy = new PasswordPolicy();
        assertFalse(policy.isValid(null,null)); assertFalse(policy.isValid(" ".repeat(15),null));
        assertFalse(policy.isValid("a".repeat(14),null)); assertTrue(policy.isValid("a".repeat(15),null));
        assertTrue(policy.isValid("a".repeat(72),null)); assertFalse(policy.isValid("a".repeat(73),null));
        assertTrue(policy.isValid("가".repeat(24),null)); assertFalse(policy.isValid("가".repeat(25),null));
        String password = "phase1-secret-password";
        assertFalse(new Signup("example@example.test",password,"닉네임").toString().contains(password));
        assertFalse(new Login("example@example.test",password).toString().contains(password));
        assertEquals("first.last+tag@example.test", EmailAddress.normalize(" FIRST.Last+tag@EXAMPLE.TEST "));
    }
    static class MutableClock extends Clock {
        long millis;
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(millis); }
    }
    @Test void limitsExpireAndDoNotMixAccountsWithAddresses() {
        var clock = new MutableClock(); var limiter = new AuthRateLimiter(clock);
        for(int i=0;i<10;i++) limiter.account("one@example.test");
        assertThrows(BusinessException.class, () -> limiter.account("one@example.test"));
        assertDoesNotThrow(() -> limiter.account("two@example.test"));
        for(int i=0;i<60;i++) limiter.address("127.0.0.1");
        assertThrows(BusinessException.class, () -> limiter.address("127.0.0.1"));
        clock.millis=60_000;
        assertDoesNotThrow(() -> limiter.account("one@example.test"));
        assertDoesNotThrow(() -> limiter.address("127.0.0.1"));
    }
}
