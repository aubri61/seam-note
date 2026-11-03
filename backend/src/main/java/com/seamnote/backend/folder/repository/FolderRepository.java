package com.seamnote.backend.folder.repository;

import com.seamnote.backend.folder.entity.Folder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.*;
public interface FolderRepository extends JpaRepository<Folder, UUID> {
    Optional<Folder> findByIdAndOwnerId(UUID id, UUID ownerId);
    List<Folder> findByOwnerIdAndParentIdOrderBySortOrderAscIdAsc(UUID ownerId, UUID parentId);
    List<Folder> findByOwnerIdAndParentIsNullOrderBySortOrderAscIdAsc(UUID ownerId);
    @Query("select new com.seamnote.backend.folder.dto.FolderResponse(f.id, f.parent.id, f.name, f.sortOrder, f.version, f.createdAt, f.updatedAt) from Folder f where f.ownerId = :ownerId order by f.sortOrder, f.id")
    List<com.seamnote.backend.folder.dto.FolderResponse> workspaceFolders(UUID ownerId);
    boolean existsByParentId(UUID parentId);
    @Query("select coalesce(max(f.sortOrder), -1) from Folder f where f.ownerId = :ownerId and ((:parentId is null and f.parent is null) or f.parent.id = :parentId)")
    long maxOrder(UUID ownerId, UUID parentId);
}
