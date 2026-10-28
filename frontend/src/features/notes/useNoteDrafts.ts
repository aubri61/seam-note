import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Note, UUID } from '@/lib/api/types'
import type { DraftPatch } from './noteDrafts'
import { protectUnsavedDrafts } from './draftNavigation'
import { localDraftRepository, readLocalDraftTitles } from '@/features/local-drafts/localDraftRepository'
import { DraftSession, hasUnprotectedChanges } from '@/features/local-drafts/draftSession'

/** The session is owned by AppLayout; URL changes never replace it. */
export function useNoteDrafts(selectedId: UUID | null, serverNote: Note | null) {
  const [session] = useState(() => new DraftSession(localDraftRepository, crypto.randomUUID()))
  const entries = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const [restoredTitles, setRestoredTitles] = useState<Record<string, string>>({})
  useEffect(() => {
    let active = true
    void readLocalDraftTitles().then(titles => { if (active) setRestoredTitles(titles) }).catch(() => {
      // Per-note recovery reports storage errors; do not log manuscript data.
    })
    return () => { active = false }
  }, [])
  // Presentation only: never write edited titles into the server Query cache.
  const draftTitles = useMemo(() => ({ ...restoredTitles, ...Object.fromEntries(
    Object.entries(entries).flatMap(([id, value]) => value.draft ? [[id, value.draft.title]] : []),
  ) }), [entries, restoredTitles])
  useEffect(() => session.connect(), [session])
  useEffect(() => {
    if (!selectedId) return
    session.select(selectedId)
    return () => { void session.flush(selectedId) }
  }, [selectedId, session])
  useEffect(() => {
    if (serverNote && serverNote.id === selectedId) session.receive(serverNote)
  }, [selectedId, serverNote, session])
  const unprotected = hasUnprotectedChanges(entries)
  useEffect(() => {
    if (unprotected) return protectUnsavedDrafts(window)
  }, [unprotected])
  const entry = selectedId ? entries[selectedId] : undefined
  return {
    draft: entry?.draft ?? null, entry, draftTitles, session,
    backgroundIssues: Object.entries(entries).filter(([id, value]) => id !== selectedId && !!value.error && !!value.draft).map(([id]) => id),
    recovering: !!selectedId && (!entry || entry.phase === 'recovering'),
    edit: (noteId: UUID, patch: DraftPatch) => session.edit(noteId, patch),
    retryLocal: () => { if (selectedId) void session.retry(selectedId) },
  }
}
