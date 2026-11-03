package com.seamnote.backend.auth.web;
import com.seamnote.backend.auth.password.AuthRateLimiter;
import com.seamnote.backend.common.exception.BusinessException;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.*;

/** Bounds JSON parsing and request rate before expensive password hashing. Not a servlet Bean. */
public class AuthRequestFilter extends OncePerRequestFilter {
    private final AuthRateLimiter limiter;
    private final SecurityResponses responses;
    public AuthRequestFilter(AuthRateLimiter limiter, SecurityResponses responses) { this.limiter = limiter; this.responses = responses; }
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        String path = request.getServletPath();
        if (!"POST".equals(request.getMethod()) || !(path.equals("/api/auth/signup") || path.equals("/api/auth/login"))) {
            chain.doFilter(request, response); return;
        }
        try { limiter.address(request.getRemoteAddr()); }
        catch (BusinessException limited) { responses.error(response, 429, "AUTH_RATE_LIMITED", "잠시 후 다시 시도해주세요."); return; }
        byte[] bytes = request.getInputStream().readNBytes(8193);
        if (bytes.length > 8192) { responses.error(response, 413, "REQUEST_TOO_LARGE", "요청 크기가 너무 큽니다."); return; }
        var input = new ByteArrayInputStream(bytes);
        chain.doFilter(new HttpServletRequestWrapper(request) {
            @Override public ServletInputStream getInputStream() {
                return new ServletInputStream() {
                    @Override public int read() { return input.read(); }
                    @Override public int read(byte[] b, int off, int len) { return input.read(b, off, len); }
                    @Override public boolean isFinished() { return input.available() == 0; }
                    @Override public boolean isReady() { return true; }
                    @Override public void setReadListener(ReadListener listener) { throw new UnsupportedOperationException("Blocking JSON only"); }
                };
            }
        }, response);
    }
}
