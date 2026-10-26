package com.seamnote.backend.note.idempotency;

import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.UUID;

@Repository
public class NoteUpdateLedger {
    private final JdbcTemplate jdbc;
    public NoteUpdateLedger(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public record Success(UUID noteId, String requestHash, String responseJson) {}

    // Serializes only matching keys (hash collisions cause harmless extra waiting).
    // The transaction-scoped lock is released on commit/rollback, never by an application finally block.
    public void lock(UUID operationId) {
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            try (var statement = connection.prepareStatement(
                    "select pg_advisory_xact_lock(hashtextextended(cast(? as text), 0))")) {
                statement.setString(1, "NOTE_UPDATE:" + operationId);
                statement.execute();
            }
            return null;
        });
    }
    public Optional<Success> find(UUID operationId) {
        return jdbc.query("select note_id, request_hash, response_json from note_update_operations where operation_id=?",
            (rs, row) -> new Success(rs.getObject("note_id", UUID.class), rs.getString("request_hash"), rs.getString("response_json")), operationId)
            .stream().findFirst();
    }
    public void record(UUID operationId, UUID noteId, String requestHash, String responseJson) {
        jdbc.update("insert into note_update_operations(operation_id,note_id,request_hash,response_json) values (?,?,?,?)",
            operationId, noteId, requestHash, responseJson);
    }
}
