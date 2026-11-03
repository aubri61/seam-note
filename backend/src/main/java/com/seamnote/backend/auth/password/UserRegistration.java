package com.seamnote.backend.auth.password;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
@Service
public class UserRegistration {
    private final JdbcTemplate jdbc;
    public UserRegistration(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    @Transactional
    public void register(String email, String nickname, String hash) {
        UUID id = UUID.randomUUID();
        var now = Timestamp.from(Instant.now());
        // DB unique serializes concurrent signups; no rollback-only exception or email-in-error log.
        int inserted = jdbc.update("""
            insert into app_users(id,email_normalized,nickname,enabled,created_at)
            values (?,?,?,true,?) on conflict on constraint uk_app_users_email do nothing
            """, id, email, nickname, now);
        if (inserted == 1) {
            jdbc.update("insert into password_credentials(user_id,password_hash,updated_at) values (?,?,?)", id, hash, now);
        }
    }
}
