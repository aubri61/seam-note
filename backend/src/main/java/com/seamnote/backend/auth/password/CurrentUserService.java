package com.seamnote.backend.auth.password;
import com.seamnote.backend.auth.user.AppUserRepository;
import com.seamnote.backend.auth.web.AuthRequests.VerifiedUser;
import com.seamnote.backend.common.exception.*;
import org.springframework.stereotype.Service;
import java.util.UUID;
@Service
public class CurrentUserService {
    private final AppUserRepository users;
    public CurrentUserService(AppUserRepository users) { this.users = users; }
    public VerifiedUser get(UUID authenticatedUserId) {
        var user = users.findById(authenticatedUserId)
            .filter(u -> u.isEnabled()).orElseThrow(() -> new BusinessException(ErrorCode.AUTHENTICATION_REQUIRED));
        return new VerifiedUser(user.getId(), user.getEmail(), user.getNickname(), user.isEmailVerified());
    }
}
