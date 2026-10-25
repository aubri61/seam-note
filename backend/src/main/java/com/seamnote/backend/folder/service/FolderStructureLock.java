package com.seamnote.backend.folder.service;

import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
/** All structural writers must acquire this DB-wide lock before reading state. */
@Component
public class FolderStructureLock {
    private final EntityManager em;
    public FolderStructureLock(EntityManager em) { this.em = em; }
    @Transactional(propagation = Propagation.MANDATORY)
    public void acquire() {
        em.createNativeQuery("select pg_advisory_xact_lock(736284091)").getSingleResult();
    }
}
