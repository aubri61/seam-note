import type { Note } from '@/lib/api/types'
import type { NoteUpdateOperation } from './outboxModel'

// Storage boundary only. This module never sends a request.
const repository = async () => (await import('@/features/local-drafts/draftDatabase')).draftRepository
export const outboxRepository = {
  listPending: async () => (await repository()).listPending(),
  listForNote: async (noteId: string) => (await repository()).listOperations(noteId),
  claim: async (operationId: string) => (await repository()).claim(operationId),
  prepareManual: async (noteId: string, token: string, revision: number) => (await repository()).prepareManual(noteId, token, revision),
  acknowledge: async (operation: NoteUpdateOperation, note: Note, token: string, revision: number, writerId: string) =>
    (await repository()).acknowledge(operation, note, token, revision, writerId),
  markConflict: async (operationId: string) => (await repository()).markConflict(operationId),
}
