package com.seamnote.backend.note.repository;

import com.seamnote.backend.note.entity.Note;
import com.seamnote.backend.note.dto.NoteSummaryResponse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.*;
public interface NoteRepository extends JpaRepository<Note, UUID> {
    @Query("select new com.seamnote.backend.note.dto.NoteSummaryResponse(n.id, n.folder.id, n.title, n.updatedAt, n.sortOrder, n.version) from Note n order by n.folder.id, n.sortOrder, n.id")
    List<NoteSummaryResponse> workspaceSummaries();
    boolean existsByFolderId(UUID folderId);
    @Query("select coalesce(max(n.sortOrder), -1) from Note n where n.folder.id = :folderId")
    long maxOrder(UUID folderId);
    @Query("select new com.seamnote.backend.note.dto.NoteSummaryResponse(n.id, n.folder.id, n.title, n.updatedAt, n.sortOrder, n.version) from Note n where n.folder.id = :folderId order by n.sortOrder, n.id")
    List<NoteSummaryResponse> summaries(UUID folderId);
}
