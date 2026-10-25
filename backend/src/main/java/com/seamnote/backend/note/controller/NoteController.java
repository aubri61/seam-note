package com.seamnote.backend.note.controller;

import com.seamnote.backend.note.dto.*;
import com.seamnote.backend.note.service.NoteService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.*;
@RestController
@RequestMapping("/api/notes")
public class NoteController {
    private final NoteService notes;
    public NoteController(NoteService notes) { this.notes = notes; }
    @PostMapping
    public ResponseEntity<NoteResponse> createNote(@Valid @RequestBody CreateNoteRequest request) {
        NoteResponse response = notes.createNote(request);
        return ResponseEntity.created(URI.create("/api/notes/" + response.getId())).body(response);
    }
    @GetMapping("/{id}")
    public NoteResponse getNote(@PathVariable UUID id) { return notes.getNote(id); }
    @GetMapping
    public List<NoteResponse> getAllNotes() { return notes.getAllNotes(); }
    // Both endpoints replace title and content together; missing/null is invalid.
    @RequestMapping(value = "/{id}", method = {RequestMethod.PUT, RequestMethod.PATCH})
    public NoteResponse updateNote(@PathVariable UUID id, @Valid @RequestBody UpdateNoteRequest request) { return notes.updateNote(id, request); }
    @PatchMapping("/{id}/move")
    public NoteResponse move(@PathVariable UUID id, @Valid @RequestBody MoveNoteRequest request) { return notes.move(id, request); }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteNote(@PathVariable UUID id) { notes.deleteNote(id); return ResponseEntity.noContent().build(); }
}
