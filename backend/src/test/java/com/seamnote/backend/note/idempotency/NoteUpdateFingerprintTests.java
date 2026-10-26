package com.seamnote.backend.note.idempotency;

import com.seamnote.backend.note.dto.UpdateNoteRequest;
import org.junit.jupiter.api.Test;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class NoteUpdateFingerprintTests {
    UpdateNoteRequest request(String title, String content, long version) {
        var request=new UpdateNoteRequest();request.setTitle(title);request.setContent(content);request.setExpectedVersion(version);return request;
    }
    @Test void stableForEquivalentRequestsAndSensitiveToFieldBoundaries() {
        var id=UUID.randomUUID();
        assertEquals(IdempotentNoteUpdates.fingerprint(id,request("ab","c",0)),IdempotentNoteUpdates.fingerprint(id,request("ab","c",0)));
        assertNotEquals(IdempotentNoteUpdates.fingerprint(id,request("ab","c",0)),IdempotentNoteUpdates.fingerprint(id,request("a","bc",0)));
    }
    @Test void unicodeCodeUnitsAreNotCollapsedByLossyEncoding() {
        var id=UUID.randomUUID();
        assertNotEquals(IdempotentNoteUpdates.fingerprint(id,request("","\uD800",0)),IdempotentNoteUpdates.fingerprint(id,request("","\uD801",0)));
        assertNotEquals(IdempotentNoteUpdates.fingerprint(id,request("","é",0)),IdempotentNoteUpdates.fingerprint(id,request("","e\u0301",0)));
    }
    @Test void noteIdentityAndExpectedVersionArePartOfTheFingerprint() {
        var id=UUID.randomUUID();var request=request("","",0);
        assertNotEquals(IdempotentNoteUpdates.fingerprint(id,request),IdempotentNoteUpdates.fingerprint(UUID.randomUUID(),request));
        assertNotEquals(IdempotentNoteUpdates.fingerprint(id,request),IdempotentNoteUpdates.fingerprint(id,request("","",1)));
    }
}
