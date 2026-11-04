package com.seamnote.backend;
import com.seamnote.backend.auth.token.AccessTokenIssuer;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.UUID;
final class TestAccounts {
    record Account(UUID id, String token) {}
    static Account create(JdbcTemplate jdbc, AccessTokenIssuer tokens) {
        var id=UUID.randomUUID();
        jdbc.update("insert into app_users(id,email_normalized,nickname,created_at) values (?,?,?,current_timestamp)",id,id+"@example.test","인증 테스트");
        return new Account(id,tokens.issue(id));
    }
}
