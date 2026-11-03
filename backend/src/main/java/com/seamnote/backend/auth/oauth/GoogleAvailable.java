package com.seamnote.backend.auth.oauth;
import org.springframework.context.annotation.*;
import org.springframework.core.type.AnnotatedTypeMetadata;
public class GoogleAvailable implements Condition {
    @Override public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        var env=context.getEnvironment();
        return !env.getProperty("seam.auth.google.client-id", "").isBlank()
            && !env.getProperty("seam.auth.google.client-secret", "").isBlank();
    }
}
