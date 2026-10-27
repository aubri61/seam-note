import Dexie from 'dexie'
import { creationOperation, validateCreation } from '@/features/outbox/creationModel'
import type { LocalEntity, CreationOperation } from '@/features/outbox/creationModel'
import type { Folder, CreateFolderRequest, CreateNoteRequest } from '@/lib/api/types'
import { validateWorkspace } from '@/features/offline/workspaceCache'
import type { WorkspaceRecord } from '@/features/offline/workspaceCache'
import type { WorkspaceTreeResponse } from '@/lib/api/types'
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
  localEntities!: Table<LocalEntity,string>
  creationOutbox!: Table<CreationOperation,string>
  workspace!: Table<WorkspaceRecord, string>
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
    this.version(3).stores({ drafts: '&noteId', outbox: '&operationId, noteId, status', workspace: '&key' })
    this.version(4).stores({ drafts: '&noteId', outbox: '&operationId, noteId, status', workspace: '&key', localEntities: '&id, kind', creationOutbox: '&operationId, entityId, status' })
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
        const workspace = existing.tables.find(table => table.name === 'workspace')
        const workspaceSchema = workspace?.schema.primKey.keyPath === 'key' && workspace.schema.indexes.length === 0
        const entities=existing.tables.find(t=>t.name==='localEntities'), creations=existing.tables.find(t=>t.name==='creationOutbox')
        const localSchema=entities?.schema.primKey.keyPath==='id'&&entities.schema.indexes.map(i=>i.name).join(',')==='kind'
          &&creations?.schema.primKey.keyPath==='operationId'&&creations.schema.indexes.map(i=>i.name).sort().join(',')==='entityId,status'
        if (!draftSchema || !(existing.verno === 1 && existing.tables.length === 1
          || existing.verno === 2 && existing.tables.length === 2 && outboxSchema
          || existing.verno === 3 && existing.tables.length === 3 && outboxSchema && workspaceSchema
          || existing.verno === 4 && existing.tables.length === 5 && outboxSchema && workspaceSchema && localSchema)) throw new InvalidLocalDraft()
      } finally { existing.close() }
    })().catch(error => { this.checked = undefined; throw error })
    const pending = this.checked
    try { await pending } finally { if (this.checked === pending) this.checked = undefined }
  }
  async localEntity(id:string) { await this.ensureSchema(); return this.db.localEntities.get(id) }
  async localWorkspace() {
    await this.ensureSchema()
    return this.db.transaction('r',[this.db.workspace,this.db.localEntities],async()=>{
      const snapshot=await this.db.workspace.get('current'),all=await this.db.localEntities.toArray()
      return { entities:all.filter(e=>!e.confirmed||(e.confirmedAt??0)>=(snapshot?.requestedAt??0)),
        pendingIds:all.filter(e=>!e.confirmed).map(e=>e.id) }
    })
  }
  private async checkNewId(id:string) {
    const cache=await this.db.workspace.get('current')
    if(await this.db.localEntities.get(id)||await this.db.drafts.get(id)
      ||cache?.data.folders.some(f=>f.id===id)||cache?.data.notes.some(n=>n.id===id)
      ||await this.db.outbox.where('noteId').equals(id).count()||await this.db.creationOutbox.where('entityId').equals(id).count())throw new LocalDraftConflict()
  }
  private async parentExists(id:string) {
    const local=await this.db.localEntities.get(id),cache=await this.db.workspace.get('current')
    const provisional=local?.kind==='folder'&&(!local.confirmed||(local.confirmedAt??0)>=(cache?.requestedAt??0))
    if(!provisional&&!cache?.data.folders.some(f=>f.id===id))throw new Error('부모 폴더의 로컬 기록이 없습니다.')
  }
  async createLocalFolder(r:CreateFolderRequest):Promise<Folder> {
    await this.ensureSchema()
    const id=r.id??crypto.randomUUID(),parentId=r.parentId??null,name=r.name.trim(),stamp=new Date().toISOString()
    const op=creationOperation(id,{type:'FOLDER_CREATE',payload:{id,parentId,name}})
    return this.db.transaction('rw',[this.db.localEntities,this.db.creationOutbox,this.db.workspace,this.db.drafts,this.db.outbox],async()=>{
      await this.checkNewId(id);if(parentId)await this.parentExists(parentId)
      const cache=await this.db.workspace.get('current'),entities=await this.db.localEntities.toArray()
      const peers=[...(cache?.data.folders??[]),...entities.flatMap(e=>e.folder?[e.folder]:[])].filter(f=>f.parentId===parentId)
      const folder:Folder={id,parentId,name,sortOrder:Math.max(-1,...peers.map(f=>f.sortOrder))+1,version:0,createdAt:stamp,updatedAt:stamp}
      await this.db.localEntities.add({id,kind:'folder',confirmed:false,folder});await this.db.creationOutbox.add(op)
      return folder
    })
  }
  async createLocalNote(r:CreateNoteRequest):Promise<Note> {
    await this.ensureSchema()
    const id=r.id??crypto.randomUUID(),stamp=new Date().toISOString()
    const op=creationOperation(id,{type:'NOTE_CREATE',payload:{id,folderId:r.folderId,title:r.title,content:r.content},localRevision:1})
    return this.db.transaction('rw',[this.db.localEntities,this.db.creationOutbox,this.db.workspace,this.db.drafts,this.db.outbox],async()=>{
      await this.checkNewId(id);await this.parentExists(r.folderId)
      const cache=await this.db.workspace.get('current'),entities=await this.db.localEntities.toArray()
      const peers=[...(cache?.data.notes??[]),...entities.flatMap(e=>e.note?[e.note]:[])].filter(n=>n.folderId===r.folderId)
      const note:Note={id,folderId:r.folderId,title:r.title,content:r.content,sortOrder:Math.max(-1,...peers.map(n=>n.sortOrder))+1,version:0,createdAt:stamp,updatedAt:stamp}
      const summary={id:note.id,folderId:note.folderId,title:note.title,sortOrder:note.sortOrder,version:note.version,updatedAt:note.updatedAt}
      const draft:LocalNoteDraft={noteId:id,title:r.title,content:r.content,baseTitle:r.title,baseContent:r.content,baseVersion:0,latestServerVersion:0,
        localRevision:1,localSavedAt:Date.now(),storageToken:crypto.randomUUID(),writerId:'local-creation'}
      validateLocalDraft(draft)
      await this.db.localEntities.add({id,kind:'note',confirmed:false,note:summary});await this.db.drafts.add(draft);await this.db.creationOutbox.add(op)
      return note
    })
  }
  private async folderDeletionState(id: string) {
    const cache = await this.db.workspace.get('current')
    const entities = await this.db.localEntities.toArray()
    const active = entities.filter(e => !e.confirmed || (e.confirmedAt ?? 0) >= (cache?.requestedAt ?? 0))
    if (cache?.data.folders.some(f => f.parentId === id) || cache?.data.notes.some(n => n.folderId === id)
      || active.some(e => e.folder?.parentId === id || e.note?.folderId === id)) {
      throw new Error('원고나 하위 폴더가 있는 폴더는 삭제할 수 없습니다. 먼저 안의 항목을 정리해주세요.')
    }
    const local = entities.find(e => e.id === id)
    const allOperations = (await this.db.creationOutbox.toArray()).map(validateCreation)
    if (allOperations.some(op => op.type === 'FOLDER_CREATE' ? op.payload.parentId === id : op.payload.folderId === id)) {
      throw new Error('하위 항목의 생성 대기가 남아 있어 폴더를 삭제할 수 없습니다.')
    }
    const operations = allOperations.filter(op => op.entityId === id)
    if (operations.some(op => op.type !== 'FOLDER_CREATE' || op.status !== 'pending' || op.attemptedAt !== null)) {
      throw new Error('서버 생성 결과가 불확실하거나 충돌한 폴더는 삭제할 수 없습니다. 서버 반영 상태를 먼저 확인해주세요.')
    }
    if (local && local.kind !== 'folder' || (!local || local.confirmed) && operations.length) throw new LocalDraftConflict()
    if (!local?.folder && !cache?.data.folders.some(f => f.id === id)) throw new Error('폴더의 로컬 기록을 확인하지 못했습니다.')
    if (local && !local.confirmed && operations.length !== 1) throw new LocalDraftConflict()
    return { local, operations, cache }
  }
  async prepareFolderDeletion(id: string) {
    await this.ensureSchema()
    return this.db.transaction('rw', [this.db.workspace, this.db.localEntities, this.db.creationOutbox], async () => {
      const {local, operations} = await this.folderDeletionState(id)
      if (!local || local.confirmed) return 'server' as const
      await this.db.creationOutbox.bulkDelete(operations.map(op => op.operationId))
      await this.db.localEntities.delete(id)
      return 'local' as const
    })
  }
  async finishFolderDeletion(id: string) {
    await this.ensureSchema()
    await this.db.transaction('rw', [this.db.workspace, this.db.localEntities, this.db.creationOutbox], async () => {
      const {local, operations, cache} = await this.folderDeletionState(id)
      if (local && !local.confirmed || operations.length) throw new LocalDraftConflict()
      if (cache) await this.db.workspace.put({...cache, data: {...cache.data, folders: cache.data.folders.filter(f => f.id !== id)},
        requestedAt: Math.max(Date.now(), cache.requestedAt + 1), cachedAt: Date.now()})
      await this.db.localEntities.delete(id)
    })
  }
  async creationChain(id:string) {
    await this.ensureSchema()
    return this.db.transaction('r',[this.db.localEntities,this.db.creationOutbox],async()=>{
      const chain:CreationOperation[]=[],visited=new Set<string>()
      let cursor:string|null=id
      while(cursor){
        if(visited.has(cursor))throw new LocalDraftConflict();visited.add(cursor)
        const e:LocalEntity|undefined=await this.db.localEntities.get(cursor)
        if(!e||e.confirmed)break
        const ops=(await this.db.creationOutbox.where('entityId').equals(cursor).toArray()).map(validateCreation)
        if(ops.length!==1)throw new LocalDraftConflict();chain.unshift(ops[0])
        cursor=e.kind==='folder'?e.folder!.parentId:e.note!.folderId
      }
      return chain
    })
  }
  async claimCreation(entityId:string) {
    await this.ensureSchema()
    return this.db.transaction('rw',[this.db.localEntities,this.db.creationOutbox],async()=>{
      const chain=await this.creationChain(entityId)
      if(!chain.length)return null
      if(chain.length!==1)throw new Error('부모 폴더가 서버에 확인되기 전 자식 전송을 중단했습니다.')
      const op=chain[0]
      if(op.status==='conflict')throw new Error('생성 충돌 작업입니다. 로컬 데이터를 보존하고 전송을 중단했습니다.')
      if(op.status==='inFlight')return op
      const next={...op,status:'inFlight' as const,attemptedAt:Math.max(Date.now(),op.createdAt)}
      await this.db.creationOutbox.put(next);return next
    })
  }
  async conflictCreation(id:string){await this.ensureSchema();await this.db.transaction('rw',this.db.creationOutbox,async()=>{
    const op=await this.db.creationOutbox.get(id);if(!op||op.status!=='inFlight')throw new LocalDraftConflict()
    await this.db.creationOutbox.put({...op,status:'conflict'})
  })}
  private async confirmCreation(op:CreationOperation,response:Folder|Note) {
    const stored=await this.db.creationOutbox.get(op.operationId),entity=await this.db.localEntities.get(op.entityId)
    if(!stored||stored.status!=='inFlight'||JSON.stringify(stored.payload)!==JSON.stringify(op.payload)||!entity||entity.confirmed||response.id!==op.entityId||response.version!==0)throw new LocalDraftConflict()
    const note=response as Note,folder=response as Folder
    if(op.type==='FOLDER_CREATE'?(folder.name!==op.payload.name||folder.parentId!==op.payload.parentId)
      :(note.folderId!==op.payload.folderId||note.title!==op.payload.title||note.content!==op.payload.content))throw new LocalDraftConflict()
    const cache=await this.db.workspace.get('current'),data=cache?.data??{folders:[],notes:[]}
    let confirmed:LocalEntity
    if(op.type==='FOLDER_CREATE'){
      confirmed={id:response.id,kind:'folder',confirmed:true,confirmedAt:Date.now(),folder}
      data.folders=[...data.folders.filter(f=>f.id!==response.id),folder]
    }else{
      const summary={id:note.id,folderId:note.folderId,title:note.title,sortOrder:note.sortOrder,version:note.version,updatedAt:note.updatedAt}
      confirmed={id:response.id,kind:'note',confirmed:true,confirmedAt:Date.now(),note:summary}
      data.notes=[...data.notes.filter(n=>n.id!==response.id),summary]
    }
    await this.db.workspace.put({key:'current',data:validateWorkspace(data),cachedAt:Date.now(),requestedAt:cache?.requestedAt??0})
    await this.db.localEntities.put(confirmed);await this.db.creationOutbox.delete(op.operationId)
  }
  async ackFolderCreation(op:CreationOperation,response:Folder){
    await this.ensureSchema();if(op.type!=='FOLDER_CREATE')throw new LocalDraftConflict()
    await this.db.transaction('rw',[this.db.workspace,this.db.localEntities,this.db.creationOutbox],()=>this.confirmCreation(op,response))
  }
  async ackNoteCreation(op:CreationOperation,response:Note,token:string,revision:number,writerId:string){
    await this.ensureSchema();if(op.type!=='NOTE_CREATE')throw new LocalDraftConflict()
    return this.db.transaction('rw',[this.db.workspace,this.db.localEntities,this.db.creationOutbox,this.db.drafts,this.db.outbox],async()=>{
      const current=await this.db.drafts.get(op.entityId)
      if(!current||validateLocalDraft(current).storageToken!==token||current.localRevision!==revision||current.baseVersion!==0
        ||await this.db.outbox.where('noteId').equals(op.entityId).count())throw new LocalDraftConflict()
      const next={...current,baseTitle:response.title,baseContent:response.content,baseVersion:response.version,
        latestServerVersion:Math.max(current.latestServerVersion,response.version),localRevision:current.localRevision+1,storageToken:crypto.randomUUID(),localSavedAt:Date.now(),writerId}
      await this.confirmCreation(op,response)
      await this.db.drafts.put(next)
      const plan=planOperation(next,[]);if(plan.add)await this.db.outbox.add(plan.add)
      return next
    })
  }
  async readWorkspace() {
    await this.ensureSchema()
    const record = await this.db.workspace.get('current')
    if (record) {
      validateWorkspace(record.data)
      if (record.key !== 'current' || !Number.isSafeInteger(record.cachedAt) || record.cachedAt < 0
        || !Number.isSafeInteger(record.requestedAt) || record.requestedAt < 0) throw new InvalidLocalDraft()
    }
    return record
  }
  async saveWorkspace(data: WorkspaceTreeResponse, requestedAt: number) {
    await this.ensureSchema()
    const metadata = validateWorkspace(data)
    return this.db.transaction('rw', this.db.workspace, async () => {
      const previous = await this.db.workspace.get('current')
      if (previous && previous.requestedAt > requestedAt) return
      await this.db.workspace.put({ key: 'current', data: metadata, requestedAt, cachedAt: Date.now() })
    })
  }
  async readTitles() {
    await this.ensureSchema()
    const titles: Record<string, string> = {}
    await this.db.drafts.each(record => {
      validateLocalDraft(record)
      titles[record.noteId] = record.title
    })
    return titles
  }
  async read(noteId: string) {
    await this.ensureSchema()
    return this.db.transaction('r', [this.db.drafts, this.db.outbox, this.db.localEntities, this.db.creationOutbox], async () => {
      const record = await this.db.drafts.get(noteId)
      if (!record) return undefined
      validateLocalDraft(record)
      const operations = (await this.db.outbox.where('noteId').equals(noteId).toArray()).map(validateOperation)
      const local = await this.db.localEntities.get(noteId)
      return local && !local.confirmed || operations.some(op => op.status !== 'pending') ? { ...record, serverOperationPending: true } : record
    })
  }
  async write(draft: NoteDraft, revision: number, expectedToken: string | undefined, writerId: string) {
    await this.ensureSchema()
    // The returned promise resolves only after the entire transaction commits.
    return this.db.transaction('rw', [this.db.drafts, this.db.outbox, this.db.localEntities, this.db.creationOutbox], async () => {
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
      const local=await this.db.localEntities.get(draft.noteId)
      if(local&&!local.confirmed){
        if(local.kind!=='note'||operations.length)throw new LocalDraftConflict()
        const creates=(await this.db.creationOutbox.where('entityId').equals(draft.noteId).toArray()).map(validateCreation)
        if(creates.length!==1||creates[0].type!=='NOTE_CREATE')throw new LocalDraftConflict()
        const op=creates[0]
        await this.db.drafts.put(next)
        if(op.status==='pending'){
          await this.db.creationOutbox.delete(op.operationId)
          await this.db.creationOutbox.add(creationOperation(draft.noteId,{type:'NOTE_CREATE',payload:{...op.payload,title:next.title,content:next.content},localRevision:revision}))
        }
        return next
      }
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
    return this.db.transaction('rw', [this.db.drafts, this.db.outbox, this.db.localEntities], async () => {
      const local=await this.db.localEntities.get(noteId)
      if(local&&!local.confirmed)throw new LocalDraftConflict()
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
