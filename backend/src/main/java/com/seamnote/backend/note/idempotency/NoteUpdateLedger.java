package com.seamnote.backend.note.idempotency;

import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import com.seamnote.backend.auth.password.CurrentActor;
import java.util.Optional;
import java.util.UUID;

@Repository
public class NoteUpdateLedger {
    private final JdbcTemplate jdbc;
    private final CurrentActor actor;
    public NoteUpdateLedger(JdbcTemplate jdbc, CurrentActor actor) { this.jdbc = jdbc; this.actor=actor; }
    public record Success(UUID noteId, String requestHash, String responseJson) {}

    // Serializes only matching keys (hash collisions cause harmless extra waiting).
    // The transaction-scoped lock is released on commit/rollback, never by an application finally block.
    public void lock(UUID operationId) {
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            try (var statement = connection.prepareStatement(
                    "select pg_advisory_xact_lock(hashtextextended(cast(? as text), 0))")) {
                statement.setString(1, "USER_OPERATION:" + actor.id() + ":" + operationId);
                statement.execute();
            }
            return null;
        });
    }
    public Optional<Success> find(UUID operationId) {
        return jdbc.query("select note_id, request_hash, response_json from note_update_operations where owner_id=? and operation_id=?",
            (rs, row) -> new Success(rs.getObject("note_id", UUID.class), rs.getString("request_hash"), rs.getString("response_json")), actor.id(), operationId)
            .stream().findFirst();
    }
    public void record(UUID operationId, UUID noteId, String requestHash, String responseJson) {
        jdbc.update("insert into note_update_operations(owner_id,operation_id,note_id,request_hash,response_json) values (?,?,?,?,?)",
            actor.id(), operationId, noteId, requestHash, responseJson);
    }
}
