package com.seamnote.backend.note.repository;

import com.seamnote.backend.note.entity.Note;
import com.seamnote.backend.note.dto.NoteSummaryResponse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.*;
public interface NoteRepository extends JpaRepository<Note, UUID> {
    Optional<Note> findByIdAndOwnerId(UUID id, UUID ownerId);
    List<Note> findAllByOwnerId(UUID ownerId);
    @Query("select new com.seamnote.backend.note.dto.NoteSummaryResponse(n.id, f.id, n.title, n.updatedAt, n.sortOrder, n.version) from Note n left join n.folder f where n.ownerId = :ownerId order by f.id, n.sortOrder, n.id")
    List<NoteSummaryResponse> workspaceSummaries(UUID ownerId);
    boolean existsByFolderId(UUID folderId);
    @Query("select coalesce(max(n.sortOrder), -1) from Note n where n.ownerId = :ownerId and ((:folderId is null and n.folder is null) or n.folder.id = :folderId)")
    long maxOrder(UUID ownerId, UUID folderId);
    @Query("select new com.seamnote.backend.note.dto.NoteSummaryResponse(n.id, n.folder.id, n.title, n.updatedAt, n.sortOrder, n.version) from Note n where n.ownerId = :ownerId and n.folder.id = :folderId order by n.sortOrder, n.id")
    List<NoteSummaryResponse> summaries(UUID ownerId, UUID folderId);
}
