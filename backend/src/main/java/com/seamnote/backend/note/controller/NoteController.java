package com.seamnote.backend.note.controller;

import com.seamnote.backend.note.dto.CreateNoteRequest;
import com.seamnote.backend.note.dto.NoteResponse;
import com.seamnote.backend.note.entity.Note;
import com.seamnote.backend.note.service.NoteService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

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


}
