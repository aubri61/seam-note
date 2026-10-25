package com.seamnote.backend.note.dto;

import java.util.UUID;
import java.time.Instant;
public class NoteSummaryResponse {
    private final UUID id, folderId;
    private final String title;
    private final Instant updatedAt;
    private final long sortOrder;
    private final Long version;
    public NoteSummaryResponse(UUID id, UUID folderId, String title, Instant updatedAt, long sortOrder, Long version) {
        this.id=id;
        this.folderId=folderId;
        this.title=title;
        this.updatedAt=updatedAt;
        this.sortOrder=sortOrder;
        this.version=version;
    }
    public UUID getId() { return id; }
    public UUID getFolderId() { return folderId; }
    public String getTitle() { return title; }
    public Instant getUpdatedAt() { return updatedAt; }
    public long getSortOrder() { return sortOrder; }
    public Long getVersion() { return version; }
}
