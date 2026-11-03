package com.seamnote.backend.auth.password;
import jakarta.validation.*;
import java.nio.charset.StandardCharsets;
public class PasswordPolicy implements ConstraintValidator<ValidPassword, String> {
    @Override public boolean isValid(String value, ConstraintValidatorContext context) {
        return value != null && !value.isBlank()
            && value.codePointCount(0, value.length()) >= 15
            && value.getBytes(StandardCharsets.UTF_8).length <= 72;
    }
}
