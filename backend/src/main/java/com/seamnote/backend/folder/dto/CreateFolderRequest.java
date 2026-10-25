package com.seamnote.backend.folder.dto;

import java.util.UUID;
import jakarta.validation.constraints.*;

public class CreateFolderRequest {

    private UUID id;

    private UUID parentId;
    @NotBlank @Size(max = 200)
    private String name;
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getParentId() { return parentId; }
    public void setParentId(UUID parentId) { this.parentId = parentId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
}
