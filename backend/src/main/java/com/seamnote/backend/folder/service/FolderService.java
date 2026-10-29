package com.seamnote.backend.folder.service;

import com.seamnote.backend.common.exception.*;
import com.seamnote.backend.folder.dto.*;
import com.seamnote.backend.folder.entity.Folder;
import com.seamnote.backend.folder.repository.FolderRepository;
import com.seamnote.backend.note.repository.NoteRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class FolderService {
    private final FolderRepository folders;
    private final NoteRepository notes;
    private final FolderStructureLock lock;
    private final EntityManager em;
    public FolderService(FolderRepository folders, NoteRepository notes, FolderStructureLock lock, EntityManager em) {
        this.folders=folders;
        this.notes=notes;
        this.lock=lock;
        this.em=em;
    }
    // Future workspace/owner authorization belongs at this resource lookup boundary.
    public Folder requireFolder(UUID id) {
        return folders.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.FOLDER_NOT_FOUND));
    }
    public FolderResponse get(UUID id) { return new FolderResponse(requireFolder(id)); }
    public List<FolderResponse> list(UUID parentId) {
        if (parentId != null) requireFolder(parentId);
        return (parentId == null ? folders.findByParentIsNullOrderBySortOrderAscIdAsc() : folders.findByParentIdOrderBySortOrderAscIdAsc(parentId))
            .stream().map(FolderResponse::new).toList();
    }
    @Transactional
    public FolderResponse create(CreateFolderRequest request) {
        lock.acquire();
        UUID id = request.getId() == null ? UUID.randomUUID() : request.getId();
        if (folders.existsById(id)) throw new BusinessException(ErrorCode.DUPLICATE_ENTITY_ID);
        Folder parent = request.getParentId() == null ? null : requireFolder(request.getParentId());
        Folder folder = new Folder(id, parent, request.getName().strip(), Math.addExact(folders.maxOrder(request.getParentId()), 1));
        em.persist(folder);
        em.flush();
        return new FolderResponse(folder);
    }
    @Transactional
    public FolderResponse rename(UUID id, UpdateFolderRequest request) {
        lock.acquire();
        Folder folder = requireFolder(id); folder.rename(request.getName().strip());
        em.flush();
        return new FolderResponse(folder);
    }
    @Transactional
    public FolderResponse move(UUID id, MoveFolderRequest request) {
        lock.acquire();
        Folder folder = requireFolder(id);
        Folder parent = request.getTargetParentId() == null ? null : requireFolder(request.getTargetParentId());
        Set<UUID> visited = new HashSet<>();
        for (Folder cursor = parent; cursor != null; cursor = cursor.getParent()) {
            if (cursor.getId().equals(id) || !visited.add(cursor.getId())) throw new BusinessException(ErrorCode.FOLDER_CYCLE_DETECTED);
        }
        UUID oldParent = folder.getParent() == null ? null : folder.getParent().getId();
        if (!Objects.equals(oldParent, request.getTargetParentId())) {
            folder.move(parent, Math.addExact(folders.maxOrder(request.getTargetParentId()), 1));
        em.flush();
        }
        return new FolderResponse(folder);
    }
    @Transactional
    public void delete(UUID id) {
        lock.acquire();
        Folder folder = requireFolder(id);
        folders.delete(folder);
        em.flush();
    }
}
