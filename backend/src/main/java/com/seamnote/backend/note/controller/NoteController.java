package com.seamnote.backend.note.controller;

import com.seamnote.backend.note.dto.*;
import com.seamnote.backend.note.service.NoteService;
import com.seamnote.backend.note.idempotency.IdempotentNoteUpdates;
import org.springframework.http.MediaType;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.*;
@RestController
@RequestMapping("/api/notes")
public class NoteController {
    private final com.seamnote.backend.creation.IdempotentCreations creates;
    private final NoteService notes;
    private final IdempotentNoteUpdates updates;
    public NoteController(NoteService notes, IdempotentNoteUpdates updates, com.seamnote.backend.creation.IdempotentCreations creates) { this.creates=creates; this.notes = notes; this.updates = updates; }
    @PostMapping
    public ResponseEntity<String> createNote(@Valid @RequestBody CreateNoteRequest request,
            @RequestHeader(name="Idempotency-Key", required=false) String key) {
        String response=creates.note(request,key);
        var result=ResponseEntity.created(creates.location("/api/notes/",response)).contentType(MediaType.APPLICATION_JSON);
        if(key!=null)result.header("Idempotency-Key",UUID.fromString(key).toString());
        return result.body(response);
    }
    @GetMapping("/{id}")
    public NoteResponse getNote(@PathVariable UUID id) { return notes.getNote(id); }
    @GetMapping
    public List<NoteResponse> getAllNotes() { return notes.getAllNotes(); }
    // Both endpoints replace title and content together; missing/null is invalid.
    @RequestMapping(value = "/{id}", method = {RequestMethod.PUT, RequestMethod.PATCH})
    public ResponseEntity<String> updateNote(@PathVariable UUID id, @Valid @RequestBody UpdateNoteRequest request,
            @RequestHeader(name = "Idempotency-Key", required = false) String key) {
        String response = updates.update(id, request, key);
        var result = ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON);
        if (key != null) result.header("Idempotency-Key", UUID.fromString(key).toString());
        return result.body(response);
    }
    @PatchMapping("/{id}/move")
    public NoteResponse move(@PathVariable UUID id, @Valid @RequestBody MoveNoteRequest request) { return notes.move(id, request); }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteNote(@PathVariable UUID id) { notes.deleteNote(id); return ResponseEntity.noContent().build(); }
}
