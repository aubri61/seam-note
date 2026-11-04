package com.seamnote.backend.auth.password;
import com.seamnote.backend.common.exception.*;
import org.springframework.stereotype.Component;
import java.time.*;
import java.util.*;
@Component
public class AuthRateLimiter {
    private record Window(long expiresAt, int attempts) {}
    private final Map<String, Window> windows = new HashMap<>();
    private final Clock clock;
    public AuthRateLimiter() { this(Clock.systemUTC()); }
    public AuthRateLimiter(Clock clock) { this.clock = clock; }
    public void address(String address) { check("ip:" + address, 60); }
    public void account(String email) { check("account:" + email, 10); }
    private synchronized void check(String key, int limit) {
        long now = clock.millis();
        windows.entrySet().removeIf(e -> e.getValue().expiresAt() <= now);
        var window = windows.get(key);
        if (window == null) {
            if (windows.size() >= 10_000) throw new BusinessException(ErrorCode.AUTH_RATE_LIMITED);
            window = new Window(now + 60_000, 0);
        }
        if (window.attempts() >= limit) throw new BusinessException(ErrorCode.AUTH_RATE_LIMITED);
        windows.put(key, new Window(window.expiresAt(), window.attempts() + 1));
    }
}
