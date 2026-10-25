package com.seamnote.backend.folder.dto;

import java.util.UUID;
import java.time.Instant;
import com.seamnote.backend.folder.entity.Folder;
public class FolderResponse {
    private final UUID id;
    private final UUID parentId;
    private final String name;
    private final long sortOrder;
    private final Long version;
    private final Instant createdAt;
    private final Instant updatedAt;
    public FolderResponse(Folder entity) {
        this.parentId = entity.getParent() == null ? null : entity.getParent().getId();
        this.id = entity.getId();
        this.name = entity.getName();
        this.sortOrder = entity.getSortOrder();
        this.version = entity.getVersion();
        this.createdAt = entity.getCreatedAt();
        this.updatedAt = entity.getUpdatedAt();
    }
    public FolderResponse(UUID id, UUID parentId, String name, long sortOrder, Long version, Instant createdAt, Instant updatedAt) {
        this.id = id;
        this.parentId = parentId;
        this.name = name;
        this.sortOrder = sortOrder;
        this.version = version;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
    public UUID getId() { return id; }
    public UUID getParentId() { return parentId; }
    public String getName() { return name; }
    public long getSortOrder() { return sortOrder; }
    public Long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
