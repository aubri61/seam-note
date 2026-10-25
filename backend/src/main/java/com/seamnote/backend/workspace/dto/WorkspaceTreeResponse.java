package com.seamnote.backend.workspace.dto;

import com.seamnote.backend.folder.dto.FolderResponse;
import com.seamnote.backend.note.dto.NoteSummaryResponse;
import java.util.List;

public class WorkspaceTreeResponse {
    private final List<FolderResponse> folders;
    private final List<NoteSummaryResponse> notes;

    public WorkspaceTreeResponse(List<FolderResponse> folders, List<NoteSummaryResponse> notes) {
        this.folders = folders;
        this.notes = notes;
    }
    public List<FolderResponse> getFolders() { return folders; }
    public List<NoteSummaryResponse> getNotes() { return notes; }
}
