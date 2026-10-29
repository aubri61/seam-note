import type { Note } from '@/lib/api/types'
import type { NoteUpdateOperation } from '@/features/outbox/outboxModel'

export function verifySyncResponse(operation: NoteUpdateOperation, note: Note, echoedId: unknown): Note {
  if (typeof echoedId !== 'string' || echoedId.toLowerCase() !== operation.operationId.toLowerCase()
    || !note || note.id !== operation.noteId || note.title !== operation.title || note.content !== operation.content
    || !Number.isSafeInteger(note.version) || note.version !== operation.expectedVersion + 1
    || note.folderId !== null && (typeof note.folderId !== 'string' || !note.folderId) || !Number.isSafeInteger(note.sortOrder) || note.sortOrder < 0
    || typeof note.createdAt !== 'string' || !Number.isFinite(Date.parse(note.createdAt))
    || typeof note.updatedAt !== 'string' || !Number.isFinite(Date.parse(note.updatedAt))) {
    throw new Error('서버 응답의 작업 ID·원고·버전을 확인하지 못했습니다. 기존 작업을 보존합니다.')
  }
  return note
}

/** Product availability is independent of build mode or lab configuration. */
export function isManualSyncNote(noteId: string | null) {
  return !!noteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(noteId)
}

export function manualSaveState(noteId: string | null, entry: import('@/features/local-drafts/draftSession').DraftEntry | undefined,
  available: boolean, operations: readonly Pick<NoteUpdateOperation,'status'>[] | undefined, storageError: boolean, busy: boolean) {
  const result = (disabled: boolean, summary: string) => ({ disabled, summary, remaining: operations?.length })
  if (busy) return result(true, '서버 저장 중 · 추가 입력은 별도로 보존됩니다.')
  if (!isManualSyncNote(noteId) || !available) return result(true, '원고를 정상적으로 조회한 뒤 서버에 저장할 수 있습니다.')
  if (!entry?.draft || entry.draft.noteId !== noteId || entry.phase === 'recovering') return result(true, '로컬 원고 복구를 기다리고 있습니다.')
  if (entry.phase === 'failed' || entry.phase === 'conflict') return result(true, '로컬 저장 상태를 복구한 뒤 서버에 저장해주세요.')
  if (storageError) return result(true, 'Outbox 상태를 확인하지 못해 전송을 중단했습니다.')
  if (!operations) return result(true, '서버 저장 작업을 확인하고 있습니다.')
  if (operations.some(op => op.status === 'conflict')) return result(true, '서버 충돌 해결이 필요합니다. 로컬 원고를 보존했습니다.')
  if (operations.some(op => op.status === 'inFlight')) return result(false, '미확정 작업이 남아 있습니다. 같은 키와 내용으로 재시도합니다.')
  const dirty = entry.draft.title !== entry.draft.baseTitle || entry.draft.content !== entry.draft.baseContent
  if (!dirty && !operations.length) return result(true, '서버에 저장할 변경사항이 없습니다.')
  if (entry.revision > entry.savedRevision) return result(false, '최신 입력을 로컬 저장한 뒤 서버에 전송합니다.')
  return result(false, '서버에 저장할 변경사항이 있습니다.')
}
