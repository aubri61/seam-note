package com.seamnote.backend.auth.session;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;

@Component
public class RefreshCookie {
    public static final String NAME = "seam_refresh";
    private final boolean secure;
    public RefreshCookie(@Value("${seam.auth.cookie-secure:false}") boolean secure) { this.secure = secure; }
    public void set(HttpServletResponse response, String value) { write(response, value, Duration.ofDays(14)); }
    public void clear(HttpServletResponse response) { write(response, "", Duration.ZERO); }
    private void write(HttpServletResponse response, String value, Duration age) {
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(NAME, value)
            .httpOnly(true).secure(secure).sameSite("Lax").path("/api/auth").maxAge(age).build().toString());
    }
}
