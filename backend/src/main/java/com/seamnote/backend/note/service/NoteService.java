package com.seamnote.backend.note.service;

import com.seamnote.backend.note.dto.CreateNoteRequest;
import com.seamnote.backend.note.entity.Note;
import com.seamnote.backend.note.repository.NoteRepository;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

@Service
public class NoteService {

    private final NoteRepository noteRepository;

    public NoteService(NoteRepository noteRepository) {
        this.noteRepository = noteRepository;
    }

    @Transactional
    public Note createNote(CreateNoteRequest createNoteRequest) {
        Note note = new Note(
                createNoteRequest.getTitle(),
                createNoteRequest.getContent()
        );

        return noteRepository.save(note);
    }



}
