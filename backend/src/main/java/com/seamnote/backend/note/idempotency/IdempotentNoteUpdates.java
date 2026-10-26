package com.seamnote.backend.note.idempotency;

import com.seamnote.backend.common.exception.BusinessException;
import com.seamnote.backend.common.exception.ErrorCode;
import com.seamnote.backend.note.dto.UpdateNoteRequest;
import com.seamnote.backend.note.service.NoteService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import tools.jackson.databind.json.JsonMapper;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;

@Service
public class IdempotentNoteUpdates {
    private final NoteService notes;
    private final NoteUpdateLedger ledger;
    private final JsonMapper json;
    public IdempotentNoteUpdates(NoteService notes, NoteUpdateLedger ledger, JsonMapper json) {
        this.notes = notes; this.ledger = ledger; this.json = json;
    }
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public String update(UUID noteId, UpdateNoteRequest request, String key) {
        // Compatibility for existing clients. Future Outbox senders MUST supply their operationId.
        if (key == null) return json.writeValueAsString(notes.updateNote(noteId, request));
        UUID operationId = UUID.fromString(key);
        if (!operationId.toString().equalsIgnoreCase(key)) throw new IllegalArgumentException("Non-canonical idempotency key");
        String fingerprint = fingerprint(noteId, request);
        ledger.lock(operationId);
        var existing = ledger.find(operationId);
        if (existing.isPresent()) {
            var success = existing.get();
            if (!success.noteId().equals(noteId) || !success.requestHash().equals(fingerprint)) {
                throw new BusinessException(ErrorCode.IDEMPOTENCY_KEY_REUSED);
            }
            return success.responseJson();
        }
        // Same Spring transaction: @Version/expectedVersion check, Note flush, and result ledger insert.
        String response = json.writeValueAsString(notes.updateNote(noteId, request));
        ledger.record(operationId, noteId, fingerprint, response);
        return response;
    }
    static String fingerprint(UUID noteId, UpdateNoteRequest request) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            // Length-prefixed UTF-16 code units preserve every Java String without lossy encoding.
            for (String value : new String[] { "NOTE_UPDATE:v1", noteId.toString(), request.getTitle(), request.getContent(), request.getExpectedVersion().toString() }) {
                digest.update(ByteBuffer.allocate(Integer.BYTES).putInt(value.length()).array());
                for (int i = 0; i < value.length(); i++) {
                    digest.update((byte) (value.charAt(i) >>> 8));
                    digest.update((byte) value.charAt(i));
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException(exception); }
    }
}
