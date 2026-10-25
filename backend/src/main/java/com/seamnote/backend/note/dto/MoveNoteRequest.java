package com.seamnote.backend.note.dto;

import java.util.UUID;
import jakarta.validation.constraints.*;

public class MoveNoteRequest {
    @NotNull
    private UUID targetFolderId;
    public UUID getTargetFolderId() { return targetFolderId; }
    public void setTargetFolderId(UUID targetFolderId) { this.targetFolderId = targetFolderId; }
}
