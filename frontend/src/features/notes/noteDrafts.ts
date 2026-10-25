import type { Note, UUID } from '@/lib/api/types'

/** React editing state, never a Query cache object or a saved manuscript. */
export interface NoteDraft {
  noteId: UUID
  title: string
  content: string
  baseVersion: number
  baseTitle: string
  baseContent: string
  /** Highest observed response version; does not rebase a dirty draft. */
  latestServerVersion: number
}
export type NoteDrafts = Readonly<Record<UUID, NoteDraft>>
export type DraftPatch = Partial<Pick<NoteDraft, 'title' | 'content'>>
export type DraftStatus = '변경사항 없음' | '저장되지 않은 변경사항' | '원고 로딩 중' | '원고 조회 실패'

export function isDraftDirty(draft: NoteDraft): boolean {
  return draft.title !== draft.baseTitle || draft.content !== draft.baseContent
}
export function hasDirtyDrafts(drafts: NoteDrafts): boolean {
  return Object.values(drafts).some(isDraftDirty)
}

export function receiveServerNote(drafts: NoteDrafts, note: Note): NoteDrafts {
  const previous = drafts[note.id]
  if (previous) {
    // Dirty content and its original base are immutable to server responses.
    // Version monotonicity also rejects a late older response for the same ID.
    if (isDraftDirty(previous) || note.version <= previous.baseVersion || note.version < previous.latestServerVersion) {
      return note.version > previous.latestServerVersion
        ? { ...drafts, [note.id]: { ...previous, latestServerVersion: note.version } } : drafts
    }
  }
  const draft: NoteDraft = {
    noteId: note.id, title: note.title, content: note.content,
    baseVersion: note.version, baseTitle: note.title, baseContent: note.content,
    latestServerVersion: note.version,
  }
  return { ...drafts, [note.id]: draft }
}

export function editDraft(drafts: NoteDrafts, id: UUID, patch: DraftPatch): NoteDrafts {
  const previous = drafts[id]
  if (!previous || patch.title !== undefined && patch.title.length > 200) return drafts
  const title = patch.title ?? previous.title
  const content = patch.content ?? previous.content
  if (title === previous.title && content === previous.content) return drafts
  return { ...drafts, [id]: { ...previous, title, content } }
}

export function draftStatus(draft: NoteDraft | null, loading: boolean, error: Error | null): DraftStatus {
  if (error) return '원고 조회 실패'
  if (loading) return '원고 로딩 중'
  return draft && isDraftDirty(draft) ? '저장되지 않은 변경사항' : '변경사항 없음'
}
