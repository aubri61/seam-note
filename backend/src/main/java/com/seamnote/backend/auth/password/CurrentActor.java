package com.seamnote.backend.auth.password;

import com.seamnote.backend.common.exception.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import java.util.UUID;

/** Resolve ownership from the validated SecurityContext, never a request ownerId. */
@Component
public class CurrentActor {
    public UUID id() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken jwt) || !auth.isAuthenticated())
            throw new BusinessException(ErrorCode.AUTHENTICATION_REQUIRED);
        return UUID.fromString(jwt.getToken().getSubject());
    }
}
