import { useEffect, useState } from 'react'
import type { Note, UUID } from '@/lib/api/types'
import { editDraft, hasDirtyDrafts, receiveServerNote } from './noteDrafts'
import type { DraftPatch, NoteDrafts } from './noteDrafts'
import { protectUnsavedDrafts } from './draftNavigation'

/** Owned by AppLayout, so changing the selected editor never unmounts the drafts. */
export function useNoteDrafts(selectedId: UUID | null, serverNote: Note | null) {
  const [state, setState] = useState<{ drafts: NoteDrafts; lastServer: Note | null }>({ drafts: {}, lastServer: null })
  // Adjust this component's state only when a new, ID-checked Query snapshot arrives.
  // React rerenders before committing children, avoiding an empty/stale editor frame.
  if (serverNote && serverNote.id === selectedId && serverNote !== state.lastServer) {
    setState(current => ({ drafts: receiveServerNote(current.drafts, serverNote), lastServer: serverNote }))
  }
  const anyDirty = hasDirtyDrafts(state.drafts)
  useEffect(() => {
    if (anyDirty) return protectUnsavedDrafts(window)
  }, [anyDirty])

  function edit(noteId: UUID, patch: DraftPatch) {
    // Functional updates always apply to the latest draft, including batched input.
    setState(current => {
      const drafts = editDraft(current.drafts, noteId, patch)
      return drafts === current.drafts ? current : { ...current, drafts }
    })
  }
  return { draft: selectedId ? state.drafts[selectedId] ?? null : null, edit }
}
