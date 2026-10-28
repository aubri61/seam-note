import type { RecoveryCopy } from '@/features/conflicts/conflictModel'
import type { NoteDraft } from '@/features/notes/noteDrafts'

export const DRAFT_DB_NAME = 'seam-note-local'
export const DRAFT_CHANNEL = 'seam-note-local-drafts-v1'
export interface LocalNoteDraft extends NoteDraft {
  /** Additive unindexed fields in existing drafts records; no schema version change. */
  conflictHistory?: RecoveryCopy[]
  recoveredAs?: string
  /** Read projection from Outbox, never a persisted drafts schema field. */
  serverOperationPending?: boolean
  /** Transactional read projection only; never persisted. Unknown means unsafe to rebase edits. */
  canRebaseLocalEdits?: boolean
  localRevision: number
  localSavedAt: number
  storageToken: string
  writerId: string
}
export interface DraftRepository {
  read(noteId: string): Promise<LocalNoteDraft | undefined>
  write(draft: NoteDraft, revision: number, expectedToken: string | undefined, writerId: string): Promise<LocalNoteDraft>
}
export class LocalDraftConflict extends Error {
  constructor() { super('Another local draft revision exists'); this.name = 'LocalDraftConflict' }
}
export class InvalidLocalDraft extends Error {
  constructor() { super('Local draft record is not supported'); this.name = 'InvalidLocalDraft' }
}
