package com.seamnote.backend.note.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import com.seamnote.backend.folder.entity.Folder;

@Entity
@Table(name = "notes")
public class Note {
    @Id
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = true)
    @JoinColumn(name = "folder_id")
    private Folder folder;
    @Column(nullable = false, length = 200)
    private String title;
    @Column(nullable = false, columnDefinition = "text")
    private String content;
    @Column(nullable = false)
    private long sortOrder;
    @Version
    private Long version;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant updatedAt;
    protected Note() {}
    public Note(UUID id, Folder folder, String title, String content, long sortOrder) {
        this.id = id;
        this.folder = folder;
        this.title = title;
        this.content = content;
        this.sortOrder = sortOrder;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }
    public UUID getId() { return id; }
    public long getSortOrder() { return sortOrder; }
    public Long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    private void touch() { updatedAt = Instant.now(); }
    public Folder getFolder() { return folder; }
    public String getTitle() { return title; }
    public String getContent() { return content; }
    public void update(String title, String content) { this.title = title;
        this.content = content; touch(); }
    public void move(Folder folder, long sortOrder) { this.folder = folder;
        this.sortOrder = sortOrder; touch(); }
}
