package com.seamnote.backend.note.dto;

import jakarta.validation.constraints.*;

public class UpdateNoteRequest {
    @NotNull @Size(max = 200)
    private String title;
    @NotNull
    @com.seamnote.backend.note.validation.TiptapDocument
    private String content;
    @NotNull
    @PositiveOrZero
    private Long expectedVersion;
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public Long getExpectedVersion() { return expectedVersion; }
    public void setExpectedVersion(Long expectedVersion) { this.expectedVersion = expectedVersion; }
}
