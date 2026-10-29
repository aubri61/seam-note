package com.seamnote.backend.note.dto;

import java.util.UUID;
import java.time.Instant;
import com.seamnote.backend.note.entity.Note;
public class NoteResponse {
    private final UUID id;
    private final UUID folderId;
    private final String title;
    private final String content;
    private final long sortOrder;
    private final Long version;
    private final Instant createdAt;
    private final Instant updatedAt;
    public NoteResponse(Note entity) {
        this.folderId = entity.getFolder() == null ? null : entity.getFolder().getId();
        this.id = entity.getId();
        this.title = entity.getTitle();
        this.content = entity.getContent();
        this.sortOrder = entity.getSortOrder();
        this.version = entity.getVersion();
        this.createdAt = entity.getCreatedAt();
        this.updatedAt = entity.getUpdatedAt();
    }
    public UUID getId() { return id; }
    public UUID getFolderId() { return folderId; }
    public String getTitle() { return title; }
    public String getContent() { return content; }
    public long getSortOrder() { return sortOrder; }
    public Long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
