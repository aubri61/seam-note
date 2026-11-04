package com.seamnote.backend;

import com.seamnote.backend.auth.session.*;
import com.seamnote.backend.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@ActiveProfiles("test")
@SpringBootTest
class RefreshSessionTests {
    @Autowired RefreshSessions sessions;
    @Autowired JdbcTemplate jdbc;
    UUID user() {
        var id=UUID.randomUUID();
        jdbc.update("insert into app_users(id,email_normalized,nickname,created_at) values (?,?,?,current_timestamp)", id, id+"@example.test", "회전 테스트");
        return id;
    }
    @Test void storesHashOnlyAndReplayRevocationCommits() {
        var first=sessions.create(user());
        assertEquals(43,first.refreshToken().length());
        assertEquals(1,jdbc.queryForObject("select count(*) from refresh_credentials where token_hash=?",Integer.class,RefreshSessions.hash(first.refreshToken())));
        assertEquals(0,jdbc.queryForObject("select count(*) from refresh_credentials where token_hash=?",Integer.class,first.refreshToken()));
        var next=sessions.rotate(first.refreshToken());
        assertNotEquals(first.refreshToken(),next.refreshToken());
        assertThrows(BusinessException.class,()->sessions.rotate(first.refreshToken()));
        assertThrows(BusinessException.class,()->sessions.rotate(next.refreshToken()));
        assertFalse(first.toString().contains(first.refreshToken()));
    }
    @Test void concurrentConsumptionCreatesOnlyOneSuccessorAndRevokesFamily() throws Exception {
        var first=sessions.create(user()); var start=new CountDownLatch(1); var executor=Executors.newFixedThreadPool(2);
        Callable<RefreshSessions.Issued> rotation=()->{start.await(); try{return sessions.rotate(first.refreshToken());}catch(BusinessException failure){return null;}};
        try {
            var a=executor.submit(rotation);var b=executor.submit(rotation);start.countDown();
            var results=Arrays.asList(a.get(),b.get()); assertEquals(1,results.stream().filter(Objects::nonNull).count());
            var winner=results.stream().filter(Objects::nonNull).findFirst().orElseThrow();
            assertThrows(BusinessException.class,()->sessions.rotate(winner.refreshToken()));
            assertEquals(1,jdbc.queryForObject("select count(*) from refresh_credentials where parent_hash=?",Integer.class,RefreshSessions.hash(first.refreshToken())));
        } finally {executor.shutdownNow();}
    }
    @Test void invalidInputCannotRevokeAnotherSessionAndLogoutIsIdempotent() {
        var first=sessions.create(user());sessions.logout("attacker-input");
        var next=sessions.rotate(first.refreshToken());sessions.logout(first.refreshToken());sessions.logout(next.refreshToken());
        assertThrows(BusinessException.class,()->sessions.rotate(next.refreshToken()));
        assertThrows(BusinessException.class,()->sessions.rotate(null));
    }
    @Test void expiredAndDisabledSessionsCannotRotate() {
        var id=user();var first=sessions.create(id);
        jdbc.update("update auth_sessions set created_at=current_timestamp-interval '20 days',expires_at=current_timestamp-interval '1 day' where user_id=?",id);
        assertThrows(BusinessException.class,()->sessions.rotate(first.refreshToken()));
        var second=sessions.create(id); jdbc.update("update app_users set enabled=false where id=?",id);
        assertThrows(BusinessException.class,()->sessions.rotate(second.refreshToken()));
    }
}
