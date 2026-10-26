import type { LocalNoteDraft } from '@/features/local-drafts/localDraftTypes'
import { InvalidLocalDraft } from '@/features/local-drafts/localDraftTypes'
import { isDraftDirty } from '@/features/notes/noteDrafts'

export type OutboxStatus = 'pending' | 'inFlight' | 'conflict'
export interface NoteUpdateOperation {
  readonly operationId: string
  readonly noteId: string
  readonly type: 'NOTE_UPDATE'
  readonly title: string
  readonly content: string
  readonly expectedVersion: number
  readonly localRevision: number
  readonly createdAt: number
  updatedAt: number
  status: OutboxStatus
  /** Once set, the request snapshot/key can never be coalesced or reset. */
  attemptedAt: number | null
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validateOperation(value: NoteUpdateOperation): NoteUpdateOperation {
  if (!value || !uuid.test(value.operationId) || typeof value.noteId !== 'string' || !value.noteId
    || value.type !== 'NOTE_UPDATE' || typeof value.title !== 'string' || value.title.length > 200 || typeof value.content !== 'string'
    || ![value.expectedVersion, value.localRevision, value.createdAt, value.updatedAt].every(n => Number.isSafeInteger(n) && n >= 0)
    || value.localRevision < 1 || value.updatedAt < value.createdAt
    || !['pending', 'inFlight', 'conflict'].includes(value.status)
    || (value.status === 'pending' ? value.attemptedAt !== null
      : !Number.isSafeInteger(value.attemptedAt) || value.attemptedAt! < value.createdAt || value.updatedAt < value.attemptedAt!)) throw new InvalidLocalDraft()
  return value
}
export function createOperation(draft: LocalNoteDraft): NoteUpdateOperation {
  const now = Date.now()
  return validateOperation({ operationId: crypto.randomUUID(), noteId: draft.noteId, type: 'NOTE_UPDATE',
    title: draft.title, content: draft.content, expectedVersion: draft.baseVersion, localRevision: draft.localRevision,
    status: 'pending', attemptedAt: null, createdAt: now, updatedAt: now })
}
/** Never reuse a key for a different payload, even while coalescing unsent work. */
export function planOperation(draft: LocalNoteDraft, operations: NoteUpdateOperation[]) {
  operations.forEach(validateOperation)
  const frozen = operations.filter(op => op.status !== 'pending' || op.attemptedAt !== null)
    .sort((a, b) => b.localRevision - a.localRevision)[0]
  // A clean revert still needs a successor if an uncertain request may change the server.
  const needed = frozen ? frozen.title !== draft.title || frozen.content !== draft.content : isDraftDirty(draft)
  return { remove: operations.filter(op => op.status === 'pending' && op.attemptedAt === null).map(op => op.operationId),
    add: needed ? createOperation(draft) : null }
}
