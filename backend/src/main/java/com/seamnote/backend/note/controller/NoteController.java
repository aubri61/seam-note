package com.seamnote.backend.note.controller;

import com.seamnote.backend.note.dto.CreateNoteRequest;
import com.seamnote.backend.note.dto.NoteResponse;
import com.seamnote.backend.note.dto.UpdateNoteRequest;
import com.seamnote.backend.note.entity.Note;
import com.seamnote.backend.note.service.NoteService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/notes")
public class NoteController {

    private final NoteService noteService;

    public NoteController(NoteService noteService) {
        this.noteService = noteService;
    }

    @PostMapping
    public ResponseEntity<NoteResponse> createNote(
            @Valid @RequestBody CreateNoteRequest createNoteRequest
    ) {
        Note note = noteService.createNote(createNoteRequest);
        NoteResponse noteResponse = new NoteResponse(note);
        return ResponseEntity.created(URI.create("/api/notes/" + note.getId())).body(noteResponse);
    }

    @GetMapping("/{id}")
    public ResponseEntity<NoteResponse> getNote(
            @PathVariable("id") UUID id
    ) {
        Note note = noteService.getNote(id);
        return ResponseEntity.ok(new NoteResponse(note));
    }

    @GetMapping
    public ResponseEntity<List<NoteResponse>> getAllNotes() {
        List<NoteResponse> notes = noteService.getAllNotes().stream().map(NoteResponse::new).toList();
        return ResponseEntity.ok(notes);
    }

    @PutMapping("/{id}")
    public ResponseEntity<NoteResponse> updateNote(
            @PathVariable("id") UUID id,
            @Valid @RequestBody UpdateNoteRequest updateNoteRequest) {
        Note note = noteService.updateNote(id, updateNoteRequest);

        return ResponseEntity.ok(new NoteResponse(note));
    }


    @DeleteMapping("/{id}")
    public ResponseEntity<NoteResponse> deleteNote(
            @PathVariable("id") UUID id
    ) {
        noteService.deleteNote(id);

        return ResponseEntity.noContent().build();
    }
}
