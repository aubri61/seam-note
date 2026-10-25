package com.seamnote.backend.note.service;

import com.seamnote.backend.common.exception.*;
import com.seamnote.backend.folder.entity.Folder;
import com.seamnote.backend.folder.service.*;
import com.seamnote.backend.note.dto.*;
import com.seamnote.backend.note.entity.Note;
import com.seamnote.backend.note.repository.NoteRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class NoteService {
    private final NoteRepository notes;
    private final FolderService folders;
    private final FolderStructureLock lock;
    private final EntityManager em;
    public NoteService(NoteRepository notes, FolderService folders, FolderStructureLock lock, EntityManager em) {
        this.notes=notes;
        this.folders=folders;
        this.lock=lock;
        this.em=em;
    }
    private Note requireNote(UUID id) { return notes.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.NOTE_NOT_FOUND)); }
    @Transactional
    public NoteResponse createNote(CreateNoteRequest request) {
        lock.acquire();
        UUID id = request.getId() == null ? UUID.randomUUID() : request.getId();
        if (notes.existsById(id)) throw new BusinessException(ErrorCode.DUPLICATE_ENTITY_ID);
        Folder folder = folders.requireFolder(request.getFolderId());
        Note note = new Note(id, folder, request.getTitle(), request.getContent(), Math.addExact(notes.maxOrder(folder.getId()), 1));
        em.persist(note);
        em.flush();
        return new NoteResponse(note);
    }
    public NoteResponse getNote(UUID id) { return new NoteResponse(requireNote(id)); }
    public List<NoteResponse> getAllNotes() { return notes.findAll().stream().map(NoteResponse::new).toList(); }
    public List<NoteSummaryResponse> listByFolder(UUID folderId) { folders.requireFolder(folderId); return notes.summaries(folderId); }
    @Transactional
    public NoteResponse updateNote(UUID id, UpdateNoteRequest request) {
        Note note = requireNote(id);
        if (!Objects.equals(note.getVersion(), request.getExpectedVersion())) {
            throw new BusinessException(ErrorCode.VERSION_CONFLICT);
        }
        note.update(request.getTitle(), request.getContent());
        em.flush();
        return new NoteResponse(note);
    }
    @Transactional
    public NoteResponse move(UUID id, MoveNoteRequest request) {
        lock.acquire();
        Note note = requireNote(id);
        Folder target = folders.requireFolder(request.getTargetFolderId());
        if (!note.getFolder().getId().equals(target.getId())) {
            note.move(target, Math.addExact(notes.maxOrder(target.getId()), 1));
        em.flush();
        }
        return new NoteResponse(note);
    }
    @Transactional
    public void deleteNote(UUID id) { lock.acquire(); notes.delete(requireNote(id));
        em.flush(); }
}
