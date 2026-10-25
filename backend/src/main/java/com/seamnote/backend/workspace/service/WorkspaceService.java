package com.seamnote.backend.workspace.service;

import com.seamnote.backend.folder.repository.FolderRepository;
import com.seamnote.backend.note.repository.NoteRepository;
import com.seamnote.backend.workspace.dto.WorkspaceTreeResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkspaceService {
    private final FolderRepository folders;
    private final NoteRepository notes;
    public WorkspaceService(FolderRepository folders, NoteRepository notes) {
        this.folders = folders;
        this.notes = notes;
    }

    // Currently global. Add authenticated workspace filtering to both projections here.
    // One repeatable-read snapshot keeps both arrays consistent during concurrent moves/deletes.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public WorkspaceTreeResponse getTree() {
        return new WorkspaceTreeResponse(folders.workspaceFolders(), notes.workspaceSummaries());
    }
}
