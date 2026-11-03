package com.seamnote.backend.auth.user;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_users")
public class AppUser {
    @Id private UUID id;
    @Column(name = "email_normalized", nullable = false, length = 254) private String email;
    @Column(nullable = false, length = 30) private String nickname;
    @Column(nullable = false) private boolean enabled;
    private Instant emailVerifiedAt;
    @Column(nullable = false) private Instant createdAt;
    protected AppUser() {}
    public AppUser(String email, String nickname) {
        this.id = UUID.randomUUID(); this.email = email; this.nickname = nickname;
        this.enabled = true; this.createdAt = Instant.now();
    }
    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public String getNickname() { return nickname; }
    public boolean isEnabled() { return enabled; }
    public boolean isEmailVerified() { return emailVerifiedAt != null; }
}
