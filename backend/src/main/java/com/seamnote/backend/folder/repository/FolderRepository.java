package com.seamnote.backend.folder.repository;

import com.seamnote.backend.folder.entity.Folder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.*;
public interface FolderRepository extends JpaRepository<Folder, UUID> {
    List<Folder> findByParentIdOrderBySortOrderAscIdAsc(UUID parentId);
    List<Folder> findByParentIsNullOrderBySortOrderAscIdAsc();
    @Query("select new com.seamnote.backend.folder.dto.FolderResponse(f.id, f.parent.id, f.name, f.sortOrder, f.version, f.createdAt, f.updatedAt) from Folder f order by f.sortOrder, f.id")
    List<com.seamnote.backend.folder.dto.FolderResponse> workspaceFolders();
    boolean existsByParentId(UUID parentId);
    @Query("select coalesce(max(f.sortOrder), -1) from Folder f where (:parentId is null and f.parent is null) or f.parent.id = :parentId")
    long maxOrder(UUID parentId);
}
