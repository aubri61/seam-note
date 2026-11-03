package com.seamnote.backend.auth.password;
import com.seamnote.backend.auth.user.AppUser;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;
import java.util.List;
import java.util.UUID;
public class SeamPrincipal extends User {
    private final UUID id;
    private final String nickname;
    private final boolean emailVerified;
    public SeamPrincipal(AppUser user, String hash) {
        super(user.getEmail(), hash, user.isEnabled(), true, true, true,
            List.of(new SimpleGrantedAuthority("ROLE_USER")));
        id = user.getId(); nickname = user.getNickname(); emailVerified = user.isEmailVerified();
    }
    public UUID id() { return id; }
    public String nickname() { return nickname; }
    public boolean emailVerified() { return emailVerified; }
}
