package com.seamnote.backend.auth.web;
import com.seamnote.backend.common.dto.ErrorResponse;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;
import java.io.IOException;
import java.util.List;
@Component
public class SecurityResponses {
    private final JsonMapper json;
    public SecurityResponses(JsonMapper json) { this.json = json; }
    public void error(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status); response.setContentType("application/json"); response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-store");
        if (status == 401) response.setHeader("WWW-Authenticate", "Bearer");
        if (status == 429) response.setHeader("Retry-After", "60");
        response.getWriter().write(json.writeValueAsString(new ErrorResponse(code, message, List.of())));
    }
}
