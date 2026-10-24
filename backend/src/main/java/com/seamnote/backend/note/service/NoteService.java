package com.seamnote.backend.note.service;

import com.seamnote.backend.common.exception.BusinessException;
import com.seamnote.backend.common.exception.ErrorCode;
import com.seamnote.backend.note.dto.CreateNoteRequest;
import com.seamnote.backend.note.dto.UpdateNoteRequest;
import com.seamnote.backend.note.entity.Note;
import com.seamnote.backend.note.repository.NoteRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

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

    @Transactional(readOnly = true)
    public Note getNote(UUID id) {
        return noteRepository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.NOTE_NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public List<Note> getAllNotes() {
        return noteRepository.findAll();
    }

    @Transactional
    public Note updateNote(UUID id, UpdateNoteRequest updateNoteRequest) {
        Note note = noteRepository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.NOTE_NOT_FOUND));

        note.update(updateNoteRequest.getTitle(), updateNoteRequest.getContent());

        return note;
    }

    @Transactional
    public void deleteNote(UUID id) {
        Note note = noteRepository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.NOTE_NOT_FOUND));

        noteRepository.delete(note);
    }

}
