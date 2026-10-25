package com.seamnote.backend.folder.dto;

import java.util.UUID;
import jakarta.validation.constraints.AssertTrue;
public class MoveFolderRequest {
    private UUID targetParentId;
    private boolean targetParentSpecified;
    public UUID getTargetParentId() { return targetParentId; }
    public void setTargetParentId(UUID id) { targetParentId = id; targetParentSpecified = true; }
    @AssertTrue(message = "targetParentId를 지정해주세요. 최상위 이동은 null입니다.")
    public boolean isTargetParentSpecified() { return targetParentSpecified; }
}
