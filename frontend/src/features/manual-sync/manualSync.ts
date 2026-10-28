import { parseDocument } from '@/features/notes/richTextDocument'
import { withSyncLock } from './syncLock'
import type { Note } from '@/lib/api/types'
import { ApiError, putJsonWithOperation } from '@/lib/api/client'
import type { DraftSession } from '@/features/local-drafts/draftSession'
import { isDraftDirty } from '@/features/notes/noteDrafts'
import type { NoteUpdateOperation } from '@/features/outbox/outboxModel'
import { outboxRepository } from '@/features/outbox/outboxRepository'
import { isManualSyncNote, verifySyncResponse } from './syncContract'

export async function sendNoteSnapshot(operation: NoteUpdateOperation): Promise<Note> {
  parseDocument(operation.content)
  const response = await putJsonWithOperation<Note>(`/notes/${encodeURIComponent(operation.noteId)}`, {
    title: operation.title, content: operation.content, expectedVersion: operation.expectedVersion,
  }, operation.operationId)
  return verifySyncResponse(operation, response.body, response.operationId)
}

interface Dependencies {
  storage: Pick<typeof outboxRepository, 'prepareManual' | 'acknowledge' | 'markConflict'>
  send: typeof sendNoteSnapshot
  locks: LockManager | undefined
  canSend?: () => boolean
  lockHeld?: boolean
  allowedOperationIds?: readonly string[]
  onAcknowledged?: (operation: NoteUpdateOperation, note: Note) => void
  onSending?: (operation: NoteUpdateOperation) => void
}
export async function syncOneNote(noteId: string, session: DraftSession,
  dependencies: Dependencies = { storage: outboxRepository, send: sendNoteSnapshot, locks: navigator.locks }) {
  if (!isManualSyncNote(noteId)) throw new Error('올바른 원고 ID가 필요합니다.')
  if (!dependencies.locks) throw new Error('탭 간 잠금을 지원하지 않아 수동 전송을 중단했습니다.')
  const run = () => dependencies.locks!.request(`seam-note:manual-sync:${noteId}`, { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (!lock) throw new Error('다른 탭에서 이 원고를 동기화하고 있습니다. 전송하지 않았습니다.')
    const entry = session.getSnapshot()[noteId]
    if (!entry?.draft || entry.draft.noteId !== noteId || ['recovering', 'failed', 'conflict'].includes(entry.phase)
      || dependencies.canSend?.() === false) throw new Error('원고 조회·로컬 복구 상태를 확인한 뒤 다시 시도해주세요.')
    session.protectServerForManual(noteId)
    await session.flushLatest(noteId)
    if (dependencies.canSend?.() === false) throw new Error('원고를 저장할 수 없는 상태로 변경되어 전송을 중단했습니다.')
    const head = session.savedHead(noteId)
    const operation = await dependencies.storage.prepareManual(noteId, head.token, head.revision, dependencies.allowedOperationIds)
    if (!operation) { session.releaseServerProtection(noteId); return { kind: 'unchanged' as const } }
    if (dependencies.canSend?.() === false) throw new Error('원고를 저장할 수 없는 상태로 변경되어 작업을 보존하고 전송을 중단했습니다.')
    dependencies.onSending?.(operation)
    let note: Note
    try { note = await dependencies.send(operation) }
    catch (error) {
      if (error instanceof ApiError && (error.status === 409
        && ['VERSION_CONFLICT', 'IDEMPOTENCY_KEY_REUSED'].includes(error.code) || error.status === 404 && error.code === 'NOTE_NOT_FOUND')) {
        await dependencies.storage.markConflict(operation.operationId, error.code)
        throw new Error(`${error.code}: 로컬 원고를 보존했습니다. 자동 병합하거나 다시 덮어쓰지 않습니다.`, { cause: error })
      }
      throw new Error('서버 결과를 확정하지 못했습니다. 기존 작업을 보존했으며, 다시 누르면 같은 키·내용으로 재시도합니다.', { cause: error })
    }
    // DEV-only lab: validated HTTP response, before any ACK/IndexedDB transaction.
    if (import.meta.env && import.meta.env.DEV && import.meta.env.VITE_SYNC_DELAY_NOTE_ID === noteId) {
      const { beforeAck } = await import('../../dev/manualSyncDelay')
      await beforeAck(noteId, operation.operationId)
    }
    try {
      await session.acceptServerAck(noteId, note, (token, revision, writerId) =>
        dependencies.storage.acknowledge(operation, note, token, revision, writerId))
    } catch (cause) {
      throw new Error('서버 성공 응답은 받았지만 로컬 ack를 확정하지 못했습니다. 작업과 원고를 보존하고 전송을 중단했습니다.', {cause})
    }
    dependencies.onAcknowledged?.(operation, note)
    try { await session.flushLatest(noteId) } catch {
      throw new Error('전송한 작업의 서버 저장과 ack는 완료했지만 새 입력의 로컬 저장을 확인하지 못했습니다. 새 입력을 보존하고 저장 상태를 확인해주세요.')
    }
    return { kind: 'synced' as const, note, operationId: operation.operationId,
      hasNewerChanges: !!session.getSnapshot()[noteId]?.draft && isDraftDirty(session.getSnapshot()[noteId].draft!) }
  })
  return dependencies.lockHeld ? run() : withSyncLock(run, dependencies.locks)
}
