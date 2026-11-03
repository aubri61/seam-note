package com.seamnote.backend.auth.user;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "password_credentials")
public class PasswordCredential {
    @Id private UUID userId;
    @MapsId @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id") private AppUser user;
    @Column(nullable = false, length = 100) private String passwordHash;
    @Column(nullable = false) private Instant updatedAt;
    protected PasswordCredential() {}
    public PasswordCredential(AppUser user, String hash) {
        this.user = user; this.userId = user.getId(); this.passwordHash = hash; this.updatedAt = Instant.now();
    }
    public String getPasswordHash() { return passwordHash; }
}
