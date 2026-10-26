import Dexie from 'dexie'
import type { Table } from 'dexie'
import { isDraftDirty } from '@/features/notes/noteDrafts'
import { createOperation, planOperation, validateOperation } from '@/features/outbox/outboxModel'
import type { NoteUpdateOperation } from '@/features/outbox/outboxModel'
import type { Note } from '@/lib/api/types'
import { verifySyncResponse } from '@/features/manual-sync/syncContract'
import type { NoteDraft } from '@/features/notes/noteDrafts'

import { DRAFT_DB_NAME, InvalidLocalDraft, LocalDraftConflict } from './localDraftTypes'
import type { DraftRepository, LocalNoteDraft } from './localDraftTypes'

export function validateLocalDraft(value: LocalNoteDraft): LocalNoteDraft {
  const strings = [value.noteId, value.title, value.content, value.baseTitle, value.baseContent, value.storageToken, value.writerId]
  const numbers = [value.baseVersion, value.latestServerVersion, value.localRevision, value.localSavedAt]
  if (!strings.every(item => typeof item === 'string') || !value.noteId || !value.storageToken || !value.writerId
    || !numbers.every(item => Number.isSafeInteger(item) && item >= 0) || value.localRevision < 1
    || value.title.length > 200 || value.latestServerVersion < value.baseVersion) throw new InvalidLocalDraft()
  return value
}

export class DraftDatabase extends Dexie {
  drafts!: Table<LocalNoteDraft, string>
  outbox!: Table<NoteUpdateOperation, string>
  constructor(name = DRAFT_DB_NAME) {
    super(name)
    // Only the lookup key is indexed. Future tables/upgrades must be additive.
    this.version(1).stores({ drafts: '&noteId' })
    this.version(2).stores({ drafts: '&noteId', outbox: '&operationId, noteId, status' }).upgrade(async tx => {
      // The versionchange transaction includes both stores: any invalid record aborts the upgrade.
      const drafts = await tx.table<LocalNoteDraft>('drafts').toArray()
      for (const draft of drafts) {
        validateLocalDraft(draft)
        if (isDraftDirty(draft)) await tx.table('outbox').add(createOperation(draft))
      }
    })
  }
}
export class DexieDraftRepository implements DraftRepository {
  private db: DraftDatabase
  private checked?: Promise<void>
  constructor(db: DraftDatabase) { this.db = db }
  private async ensureSchema() {
    if (this.db.isOpen()) return
    this.checked ??= (async () => {
      if (!await Dexie.exists(this.db.name)) return
      // Inspect without declaring a target version: never upgrade an unknown DB.
      const existing = new Dexie(this.db.name)
      try {
        await existing.open()
        const drafts = existing.tables.find(table => table.name === 'drafts')
        const outbox = existing.tables.find(table => table.name === 'outbox')
        const draftSchema = drafts?.schema.primKey.keyPath === 'noteId' && drafts.schema.indexes.length === 0
        const outboxSchema = outbox?.schema.primKey.keyPath === 'operationId'
          && outbox.schema.indexes.map(index => index.name).sort().join(',') === 'noteId,status'
        if (!draftSchema || !(existing.verno === 1 && existing.tables.length === 1
          || existing.verno === 2 && existing.tables.length === 2 && outboxSchema)) throw new InvalidLocalDraft()
      } finally { existing.close() }
    })().catch(error => { this.checked = undefined; throw error })
    const pending = this.checked
    try { await pending } finally { if (this.checked === pending) this.checked = undefined }
  }
  async read(noteId: string) {
    await this.ensureSchema()
    return this.db.transaction('r', [this.db.drafts, this.db.outbox], async () => {
      const record = await this.db.drafts.get(noteId)
      if (!record) return undefined
      validateLocalDraft(record)
      const operations = (await this.db.outbox.where('noteId').equals(noteId).toArray()).map(validateOperation)
      return operations.some(op => op.status !== 'pending') ? { ...record, serverOperationPending: true } : record
    })
  }
  async write(draft: NoteDraft, revision: number, expectedToken: string | undefined, writerId: string) {
    await this.ensureSchema()
    // The returned promise resolves only after the entire transaction commits.
    return this.db.transaction('rw', [this.db.drafts, this.db.outbox], async () => {
      const current = await this.db.drafts.get(draft.noteId)
      if (current) validateLocalDraft(current)
      if (current?.storageToken !== expectedToken || current && revision <= current.localRevision) throw new LocalDraftConflict()
      const next: LocalNoteDraft = {
        noteId: draft.noteId, title: draft.title, content: draft.content,
        baseTitle: draft.baseTitle, baseContent: draft.baseContent,
        baseVersion: draft.baseVersion, latestServerVersion: draft.latestServerVersion,
        localRevision: revision, localSavedAt: Date.now(),
        storageToken: crypto.randomUUID(), writerId,
      }
      validateLocalDraft(next)
      const operations = await this.db.outbox.where('noteId').equals(draft.noteId).toArray()
      const plan = planOperation(next, operations)
      await this.db.drafts.put(next)
      await this.db.outbox.bulkDelete(plan.remove)
      if (plan.add) await this.db.outbox.add(plan.add)
      return next
    })
  }
  async listOperations(noteId: string) {
    await this.ensureSchema()
    return (await this.db.outbox.where('noteId').equals(noteId).toArray()).map(validateOperation)
  }
  async listPending() {
    await this.ensureSchema()
    return (await this.db.outbox.where('status').equals('pending').toArray()).map(validateOperation)
      .sort((a, b) => a.createdAt - b.createdAt || a.operationId.localeCompare(b.operationId))
  }
  /** Foundation only: no network call. Uncertain predecessors block all successors. */
  async claim(operationId: string): Promise<NoteUpdateOperation> {
    await this.ensureSchema()
    return this.db.transaction('rw', this.db.outbox, async () => {
      const operation = await this.db.outbox.get(operationId)
      if (!operation) throw new LocalDraftConflict()
      validateOperation(operation)
      if (operation.status !== 'pending' || operation.attemptedAt !== null) throw new LocalDraftConflict()
      const siblings = (await this.db.outbox.where('noteId').equals(operation.noteId).toArray()).map(validateOperation)
      if (siblings.some(op => op.operationId !== operationId)) throw new LocalDraftConflict()
      const now = Math.max(Date.now(), operation.updatedAt)
      const next: NoteUpdateOperation = { ...operation, status: 'inFlight', attemptedAt: now, updatedAt: now }
      await this.db.outbox.put(next)
      return next
    })
  }
  /** Atomic head check + manual selection. Retrying inFlight keeps its exact key/payload. */
  async prepareManual(noteId: string, token: string, revision: number) {
    await this.ensureSchema()
    return this.db.transaction('rw', [this.db.drafts, this.db.outbox], async () => {
      const current = await this.db.drafts.get(noteId)
      if (!current || validateLocalDraft(current).storageToken !== token || current.localRevision !== revision) throw new LocalDraftConflict()
      const ops = (await this.db.outbox.where('noteId').equals(noteId).toArray()).map(validateOperation)
      if (ops.some(op => op.status === 'conflict')) throw new Error('서버 버전 충돌 작업이 남아 있습니다. 로컬 원고를 보존하고 충돌을 확인해주세요.')
      const frozen = ops.filter(op => op.status === 'inFlight')
      if (frozen.length > 1) throw new LocalDraftConflict()
      if (frozen.length) return frozen[0]
      if (!ops.length) return null
      const op = ops[0]
      if (ops.length !== 1 || op.localRevision !== revision || op.title !== current.title
        || op.content !== current.content || op.expectedVersion !== current.baseVersion) throw new LocalDraftConflict()
      const now = Math.max(Date.now(), op.updatedAt)
      const claimed: NoteUpdateOperation = { ...op, status: 'inFlight', attemptedAt: now, updatedAt: now }
      await this.db.outbox.put(claimed)
      return claimed
    })
  }
  async acknowledge(operation: NoteUpdateOperation, response: Note, token: string, revision: number, writerId: string) {
    verifySyncResponse(operation, response, operation.operationId)
    await this.ensureSchema()
    return this.db.transaction('rw', [this.db.drafts, this.db.outbox], async () => {
      const current = await this.db.drafts.get(operation.noteId), stored = await this.db.outbox.get(operation.operationId)
      if (!current || !stored) throw new LocalDraftConflict()
      validateLocalDraft(current); validateOperation(stored)
      if (current.storageToken !== token || current.localRevision !== revision || current.baseVersion !== operation.expectedVersion
        || stored.status !== 'inFlight' || stored.noteId !== operation.noteId || stored.title !== operation.title
        || stored.content !== operation.content || stored.expectedVersion !== operation.expectedVersion
        || stored.localRevision !== operation.localRevision || stored.createdAt !== operation.createdAt) throw new LocalDraftConflict()
      const remaining = (await this.db.outbox.where('noteId').equals(operation.noteId).toArray())
        .filter(op => op.operationId !== operation.operationId).map(validateOperation)
      if (remaining.some(op => op.status !== 'pending')) throw new LocalDraftConflict()
      const next: LocalNoteDraft = { ...current, baseTitle: operation.title, baseContent: operation.content,
        baseVersion: response.version, latestServerVersion: Math.max(current.latestServerVersion, response.version),
        localRevision: current.localRevision + 1, storageToken: crypto.randomUUID(), localSavedAt: Date.now(), writerId }
      validateLocalDraft(next)
      const plan = planOperation(next, remaining)
      await this.db.drafts.put(next)
      await this.db.outbox.delete(operation.operationId)
      await this.db.outbox.bulkDelete(plan.remove)
      if (plan.add) await this.db.outbox.add(plan.add)
      return next
    })
  }
  async markConflict(operationId: string) {
    await this.ensureSchema()
    return this.db.transaction('rw', this.db.outbox, async () => {
      const operation = await this.db.outbox.get(operationId)
      if (!operation) throw new LocalDraftConflict()
      validateOperation(operation)
      if (operation.status !== 'inFlight') throw new LocalDraftConflict()
      const next: NoteUpdateOperation = { ...operation, status: 'conflict', updatedAt: Math.max(Date.now(), operation.updatedAt) }
      await this.db.outbox.put(next)
      return next
    })
  }
}
export const draftDatabase = new DraftDatabase()
export const draftRepository = new DexieDraftRepository(draftDatabase)
