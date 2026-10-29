package com.seamnote.backend.note.repository;

import com.seamnote.backend.note.entity.Note;
import com.seamnote.backend.note.dto.NoteSummaryResponse;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.*;
public interface NoteRepository extends JpaRepository<Note, UUID> {
    @Query("select new com.seamnote.backend.note.dto.NoteSummaryResponse(n.id, f.id, n.title, n.updatedAt, n.sortOrder, n.version) from Note n left join n.folder f order by f.id, n.sortOrder, n.id")
    List<NoteSummaryResponse> workspaceSummaries();
    boolean existsByFolderId(UUID folderId);
    @Query("select coalesce(max(n.sortOrder), -1) from Note n where (:folderId is null and n.folder is null) or n.folder.id = :folderId")
    long maxOrder(UUID folderId);
    @Query("select new com.seamnote.backend.note.dto.NoteSummaryResponse(n.id, n.folder.id, n.title, n.updatedAt, n.sortOrder, n.version) from Note n where n.folder.id = :folderId order by n.sortOrder, n.id")
    List<NoteSummaryResponse> summaries(UUID folderId);
}
