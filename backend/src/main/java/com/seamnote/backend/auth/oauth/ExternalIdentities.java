package com.seamnote.backend.auth.oauth;

import com.seamnote.backend.auth.password.EmailAddress;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

@Service
public class ExternalIdentities {
    private static final String ISSUER="https://accounts.google.com";
    private final JdbcTemplate jdbc;
    public ExternalIdentities(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    private OAuth2AuthenticationException rejected() { return new OAuth2AuthenticationException(new OAuth2Error("account_link_required")); }
    @Transactional
    public UUID resolve(OidcUser verified) {
        String issuer=verified.getIssuer().toString(), subject=verified.getSubject();
        String email=verified.getEmail();
        if (!ISSUER.equals(issuer) || subject==null || subject.isBlank() || subject.length()>255
            || !Boolean.TRUE.equals(verified.getEmailVerified()) || email==null || email.length()>254 || !email.contains("@")) throw rejected();
        email=EmailAddress.normalize(email);
        // Serialize first login for this verified identity, independently of email/password signup.
        jdbc.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))", "OIDC:"+issuer+":"+subject);
        var existing=jdbc.query("select i.user_id,u.enabled from external_identities i join app_users u on u.id=i.user_id where issuer=? and subject=?",
            (rs,row)->new Object[]{rs.getObject(1,UUID.class),rs.getBoolean(2)},issuer,subject);
        if (!existing.isEmpty()) {
            if (!Boolean.TRUE.equals(existing.getFirst()[1])) throw rejected();
            return (UUID)existing.getFirst()[0];
        }
        String name=verified.getFullName();
        if (name==null || name.strip().codePointCount(0,name.strip().length())<2) name="Google 사용자";
        name=name.strip(); if (name.codePointCount(0,name.length())>30) name=name.substring(0,name.offsetByCodePoints(0,30));
        UUID id=UUID.randomUUID();
        int inserted=jdbc.update("""
            insert into app_users(id,email_normalized,nickname,enabled,email_verified_at,created_at)
            values (?,?,?,true,current_timestamp,current_timestamp)
            on conflict on constraint uk_app_users_email do nothing
            """,id,email,name);
        // Email equality is not proof of ownership of an existing internal account.
        if (inserted!=1) throw rejected();
        jdbc.update("insert into external_identities(issuer,subject,user_id) values (?,?,?)",issuer,subject,id);
        return id;
    }
}
