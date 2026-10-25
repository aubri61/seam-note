package com.seamnote.backend.folder.controller;

import com.seamnote.backend.folder.dto.*;
import com.seamnote.backend.folder.service.FolderService;
import com.seamnote.backend.note.dto.NoteSummaryResponse;
import com.seamnote.backend.note.service.NoteService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.net.URI;
import java.util.*;

@RestController
@RequestMapping("/api/folders")
public class FolderController {

    private final FolderService folders;

    private final NoteService notes;

    public FolderController(FolderService folders, NoteService notes) {
        this.folders = folders;
        this.notes = notes;
    }

    // Omitted parentId or literal root selects roots. No recursive tree loading.
    @GetMapping
    public List<FolderResponse> list(@RequestParam(defaultValue = "root") String parentId) {
        return folders.list("root".equals(parentId) ? null : UUID.fromString(parentId));
    }

    @GetMapping("/{id}")
    public FolderResponse get(@PathVariable UUID id) {
        return folders.get(id);
    }

    @GetMapping("/{id}/children")
    public List<FolderResponse> children(@PathVariable UUID id) {
        return folders.list(id);
    }

    @GetMapping("/{id}/notes")
    public List<NoteSummaryResponse> notes(@PathVariable UUID id) {
        return notes.listByFolder(id);
    }

    @PostMapping
    public ResponseEntity<FolderResponse> create(@Valid @RequestBody CreateFolderRequest request) {
        FolderResponse response = folders.create(request);
        return ResponseEntity.created(URI.create("/api/folders/" + response.getId())).body(response);
    }

    @PatchMapping("/{id}")
    public FolderResponse rename(@PathVariable UUID id, @Valid @RequestBody UpdateFolderRequest request) {
        return folders.rename(id, request);
    }

    @PatchMapping("/{id}/move")
    public FolderResponse move(@PathVariable UUID id, @Valid @RequestBody MoveFolderRequest request) {
        return folders.move(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        folders.delete(id);
        return ResponseEntity.noContent().build();
    }
}
