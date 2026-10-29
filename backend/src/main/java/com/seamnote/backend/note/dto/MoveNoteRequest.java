package com.seamnote.backend.note.dto;
import java.util.UUID;
import jakarta.validation.constraints.AssertTrue;
public class MoveNoteRequest {
    private UUID targetFolderId;
    private boolean targetFolderSpecified;
    public UUID getTargetFolderId() { return targetFolderId; }
    public void setTargetFolderId(UUID id) { targetFolderId=id;targetFolderSpecified=true; }
    @AssertTrue(message="targetFolderId를 지정해주세요. 폴더 없는 원고는 null입니다.")
    public boolean isTargetFolderSpecified(){return targetFolderSpecified;}
}
