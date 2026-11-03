package com.seamnote.backend.auth.web;
import com.seamnote.backend.auth.password.ValidPassword;
import jakarta.validation.constraints.*;
import java.util.UUID;
public final class AuthRequests {
    private AuthRequests() {}
    public record Signup(@NotBlank @Email @Size(max = 254) String email,
                         @ValidPassword String password,
                         @NotBlank @Size(min = 2, max = 30) String nickname) {
        public Signup { if (email != null) email = email.strip(); if (nickname != null) nickname = nickname.strip(); }
        @Override public String toString() { return "Signup[REDACTED]"; }
    }
    public record Login(@NotBlank @Email @Size(max = 254) String email,
                        @ValidPassword String password) {
        public Login { if (email != null) email = email.strip(); }
        @Override public String toString() { return "Login[REDACTED]"; }
    }
    public record VerifiedUser(UUID id, String email, String nickname, boolean emailVerified, String issuer, String audience) {}
    public record LoginResponse(VerifiedUser user, String accessToken, String tokenType, long expiresIn) {
        @Override public String toString() { return "LoginResponse[REDACTED]"; }
    }
}
