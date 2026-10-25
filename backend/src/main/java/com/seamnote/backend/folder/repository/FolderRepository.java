package com.seamnote.backend.folder.repository;

import com.seamnote.backend.folder.entity.Folder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.*;
public interface FolderRepository extends JpaRepository<Folder, UUID> {
    List<Folder> findByParentIdOrderBySortOrderAscIdAsc(UUID parentId);
    List<Folder> findByParentIsNullOrderBySortOrderAscIdAsc();
    boolean existsByParentId(UUID parentId);
    @Query("select coalesce(max(f.sortOrder), -1) from Folder f where (:parentId is null and f.parent is null) or f.parent.id = :parentId")
    long maxOrder(UUID parentId);
}
