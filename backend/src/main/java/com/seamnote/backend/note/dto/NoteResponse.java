package com.seamnote.backend.note.dto;

import com.seamnote.backend.note.entity.Note;

import java.time.Instant;
import java.util.UUID;
public class NoteResponse {

    private final UUID id;
    private final String title;
    private final String content;
    private final Instant createdAt;
    private final Instant updatedAt;

    public NoteResponse(Note note) {
        this.id = note.getId();
        this.title = note.getTitle();
        this.content = note.getContent();
        this.createdAt = note.getCreatedAt();
        this.updatedAt = note.getUpdatedAt();
    }

    public UUID getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getContent() {
        return content;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }


}
