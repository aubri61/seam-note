package com.seamnote.backend.auth.password;
import com.seamnote.backend.auth.user.*;
import org.springframework.security.core.userdetails.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class SeamUserDetailsService implements UserDetailsService {
    private final AppUserRepository users;
    private final PasswordCredentialRepository credentials;
    public SeamUserDetailsService(AppUserRepository users, PasswordCredentialRepository credentials) {
        this.users = users; this.credentials = credentials;
    }
    @Override @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String email) {
        var user = users.findByEmail(EmailAddress.normalize(email)).orElseThrow(SeamUserDetailsService::missing);
        var credential = credentials.findById(user.getId()).orElseThrow(SeamUserDetailsService::missing);
        return new SeamPrincipal(user, credential.getPasswordHash());
    }
    private static UsernameNotFoundException missing() { return new UsernameNotFoundException("Invalid credentials"); }
}
