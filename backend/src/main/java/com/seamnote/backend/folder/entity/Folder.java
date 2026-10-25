package com.seamnote.backend.folder.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;


@Entity
@Table(name = "folders")
public class Folder {
    @Id
    private UUID id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Folder parent;
    @Column(nullable = false, length = 200)
    private String name;
    @Column(nullable = false)
    private long sortOrder;
    @Version
    private Long version;
    @Column(nullable = false)
    private Instant createdAt;
    @Column(nullable = false)
    private Instant updatedAt;
    protected Folder() {}
    public Folder(UUID id, Folder parent, String name, long sortOrder) {
        this.id = id;
        this.parent = parent;
        this.name = name;
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
    public Folder getParent() { return parent; }
    public String getName() { return name; }
    public void rename(String name) { this.name = name; touch(); }
    public void move(Folder parent, long sortOrder) { this.parent = parent;
        this.sortOrder = sortOrder; touch(); }
}
