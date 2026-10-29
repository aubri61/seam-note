package com.seamnote.backend.note.dto;

import java.util.UUID;
import jakarta.validation.constraints.*;

public class CreateNoteRequest {

    private UUID id;
    private UUID folderId;
    @NotNull @Size(max = 200)
    private String title;
    @NotNull
    @com.seamnote.backend.note.validation.TiptapDocument
    private String content;
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getFolderId() { return folderId; }
    public void setFolderId(UUID folderId) { this.folderId = folderId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
