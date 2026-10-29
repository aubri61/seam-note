import { ApiError } from '@/lib/api/client'
import { deleteNote } from './noteApi'
import { withSyncLock } from '@/features/manual-sync/syncLock'

/** One explicit deletion: prevent concurrent sends, then atomically retire local state. */
export async function deleteNoteEntry(id: string): Promise<void> {
  return withSyncLock(async () => {
    try { await deleteNote(id) }
    catch (error) {
      if (!(error instanceof ApiError && error.status === 404 && error.code === 'NOTE_NOT_FOUND')) throw error
    }
    const { draftRepository } = await import('@/features/local-drafts/draftDatabase')
    try { await draftRepository.finishNoteDeletion(id) }
    catch (cause) { throw new Error('서버에서 삭제됐지만 로컬 원고와 대기 작업 정리를 완료하지 못했습니다. 삭제를 다시 시도해주세요.', { cause }) }
    draftRepository.notifyDeleted()
  })
}
