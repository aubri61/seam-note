package com.seamnote.backend.auth.password;
import com.seamnote.backend.auth.user.AppUserRepository;
import com.seamnote.backend.auth.web.AuthRequests.VerifiedUser;
import com.seamnote.backend.common.exception.*;
import org.springframework.stereotype.Service;
import com.seamnote.backend.auth.token.JwtSettings;
import java.util.UUID;
@Service
public class CurrentUserService {
    private final JwtSettings settings;
    private final AppUserRepository users;
    public CurrentUserService(AppUserRepository users, JwtSettings settings) { this.users = users; this.settings=settings; }
    @org.springframework.transaction.annotation.Transactional
    public VerifiedUser rename(UUID authenticatedUserId, String nickname) {
        if (users.updateNickname(authenticatedUserId, nickname) == 0) {
            throw new BusinessException(ErrorCode.AUTHENTICATION_REQUIRED);
        }
        return get(authenticatedUserId);
    }
    public VerifiedUser get(UUID authenticatedUserId) {
        var user = users.findById(authenticatedUserId)
            .filter(u -> u.isEnabled()).orElseThrow(() -> new BusinessException(ErrorCode.AUTHENTICATION_REQUIRED));
        return new VerifiedUser(user.getId(), user.getEmail(), user.getNickname(), user.isEmailVerified(), settings.issuer(), settings.audience());
    }
}
