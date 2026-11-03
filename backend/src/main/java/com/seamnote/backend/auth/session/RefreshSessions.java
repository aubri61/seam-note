package com.seamnote.backend.auth.session;

import com.seamnote.backend.auth.password.CurrentUserService;
import com.seamnote.backend.auth.token.AccessTokenIssuer;
import com.seamnote.backend.auth.web.AuthRequests.LoginResponse;
import com.seamnote.backend.common.exception.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;

/** The session row serializes rotation and revocation across all tokens in one family. */
@Service
public class RefreshSessions {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Clock clock;
    private final CurrentUserService users;
    private final AccessTokenIssuer access;
    public RefreshSessions(JdbcTemplate jdbc, TransactionTemplate tx, Clock clock,
                           CurrentUserService users, AccessTokenIssuer access) {
        this.jdbc = jdbc; this.tx = tx; this.clock = clock; this.users = users; this.access = access;
    }
    public record Issued(LoginResponse response, String refreshToken) {
        @Override public String toString() { return "Issued[REDACTED]"; }
    }
    private record Credential(UUID session, UUID user, Instant expires, boolean revoked, boolean used, boolean enabled) {}
    private String randomToken() {
        byte[] bytes = new byte[32]; RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    public static String hash(String raw) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.US_ASCII))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
    private Credential lock(String raw) {
        if (raw == null || !raw.matches("[A-Za-z0-9_-]{43}")) return null;
        var locked = jdbc.query("""
            select s.id from refresh_credentials c join auth_sessions s on s.id=c.session_id
            where c.token_hash=? for update of s
            """, (rs, row) -> rs.getObject(1, UUID.class), hash(raw));
        if (locked.isEmpty()) return null;
        // A waiting SELECT's joined credential can have an older READ COMMITTED snapshot.
        // Re-read after obtaining the family lock, using a fresh statement snapshot.
        return jdbc.query("""
            select s.id, s.user_id, s.expires_at, s.revoked_at, c.used_at, u.enabled
            from refresh_credentials c join auth_sessions s on s.id=c.session_id
            join app_users u on u.id=s.user_id where c.token_hash=?
            """, (rs, row) -> new Credential(rs.getObject(1, UUID.class), rs.getObject(2, UUID.class),
            rs.getTimestamp(3).toInstant(), rs.getTimestamp(4) != null, rs.getTimestamp(5) != null, rs.getBoolean(6)), hash(raw))
            .stream().findFirst().orElse(null);
    }
    private void revoke(UUID session) {
        jdbc.update("update auth_sessions set revoked_at=coalesce(revoked_at,?) where id=?", Timestamp.from(clock.instant()), session);
    }
    private Issued issue(UUID user, String refresh) {
        var profile = users.get(user);
        return new Issued(new LoginResponse(profile, access.issue(user), "Bearer", access.expiresIn()), refresh);
    }
    public Issued create(UUID user) {
        return tx.execute(status -> {
            // Also check enabled state before creating a credential.
            users.get(user);
            var session = UUID.randomUUID(); var now = clock.instant(); var raw = randomToken();
            jdbc.update("insert into auth_sessions(id,user_id,created_at,expires_at) values (?,?,?,?)",
                session, user, Timestamp.from(now), Timestamp.from(now.plus(Duration.ofDays(14))));
            jdbc.update("insert into refresh_credentials(token_hash,session_id) values (?,?)", hash(raw), session);
            return issue(user, raw);
        });
    }
    public Issued rotate(String raw) {
        var issued = tx.execute(status -> {
            var credential = lock(raw);
            if (credential == null) return null;
            if (credential.revoked() || credential.used() || !credential.enabled() || !credential.expires().isAfter(clock.instant())) {
                revoke(credential.session()); return null;
            }
            jdbc.update("update refresh_credentials set used_at=? where token_hash=?", Timestamp.from(clock.instant()), hash(raw));
            String next = randomToken();
            jdbc.update("insert into refresh_credentials(token_hash,session_id,parent_hash) values (?,?,?)",
                hash(next), credential.session(), hash(raw));
            return issue(credential.user(), next);
        });
        // Throw AFTER commit so replay revocation cannot be rolled back by the 401.
        if (issued == null) throw new BusinessException(ErrorCode.AUTHENTICATION_REQUIRED);
        return issued;
    }
    public void logout(String raw) {
        tx.executeWithoutResult(status -> { var credential = lock(raw); if (credential != null) revoke(credential.session()); });
    }
}
