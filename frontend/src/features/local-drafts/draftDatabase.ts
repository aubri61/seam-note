import { blockedChoice, ChangedConflict, headStamp, serverDraft, snapshot } from '@/features/conflicts/conflictModel'
import type { ConflictHead, ConflictPreview, RecoveryCopy } from '@/features/conflicts/conflictModel'
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

import { DRAFT_DB_NAME, DRAFT_CHANNEL, InvalidLocalDraft, LocalDraftConflict, LocalNoteDeleted, MissingDraftRecoveryBlocked } from './localDraftTypes'
import type { DraftRepository, LocalNoteDraft, MissingDraftCheckpoint } from './localDraftTypes'

export function validateLocalDraft(value: LocalNoteDraft): LocalNoteDraft {
  const strings = [value.noteId, value.title, value.content, value.baseTitle, value.baseContent, value.storageToken, value.writerId]
  const numbers = [value.baseVersion, value.latestServerVersion, value.localRevision, value.localSavedAt]
  if (!strings.every(item => typeof item === 'string') || !value.noteId || !value.storageToken || !value.writerId
    || !numbers.every(item => Number.isSafeInteger(item) && item >= 0) || value.localRevision < 1
    || value.title.length > 200 || value.latestServerVersion < value.baseVersion) throw new InvalidLocalDraft()
  if(value.recoveredAs!==undefined&&typeof value.recoveredAs!=='string')throw new InvalidLocalDraft()
  if(value.conflictHistory!==undefined){
    if(!Array.isArray(value.conflictHistory))throw new InvalidLocalDraft()
    for(const copy of value.conflictHistory){
      const valid=(d:NoteDraft|null)=>!d||d.noteId===value.noteId&&typeof d.title==='string'&&d.title.length<=200&&typeof d.content==='string'
        &&typeof d.baseTitle==='string'&&typeof d.baseContent==='string'&&Number.isSafeInteger(d.baseVersion)&&d.baseVersion>=0
        &&Number.isSafeInteger(d.latestServerVersion)&&d.latestServerVersion>=d.baseVersion
      if(!copy||typeof copy.id!=='string'||!Number.isSafeInteger(copy.createdAt)||copy.createdAt<0
        ||!['LOCAL_DRAFT_CONFLICT','SERVER_VERSION_CONFLICT','SERVER_NOTE_DELETED'].includes(copy.kind)||!['mine','other','recover'].includes(copy.choice)||!copy.mine||!copy.stored
        ||!valid(copy.mine)||!valid(copy.stored)||!valid(copy.other)||!Array.isArray(copy.operations)||!Array.isArray(copy.creations))throw new InvalidLocalDraft()
      copy.operations.forEach(validateOperation);copy.creations.forEach(validateCreation)
    }
  }
  return value
}

export class DraftDatabase extends Dexie {
  deletedEntities!: Table<{key:string;id:string;kind:'folder'|'note';deletedAt:number},string>
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
    this.version(5).stores({ deletedEntities: '&key' })
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
          || existing.verno === 4 && existing.tables.length === 5 && outboxSchema && workspaceSchema && localSchema
          || existing.verno === 5 && existing.tables.length === 6 && outboxSchema && workspaceSchema && localSchema && existing.tables.find(t=>t.name==='deletedEntities')?.schema.primKey.keyPath==='key')) throw new InvalidLocalDraft()
      } finally { existing.close() }
    })().catch(error => { this.checked = undefined; throw error })
    const pending = this.checked
    try { await pending } finally { if (this.checked === pending) this.checked = undefined }
  }
  async localEntity(id:string) { await this.ensureSchema(); return this.db.localEntities.get(id) }
  async localWorkspace() {
    await this.ensureSchema()
    return this.db.transaction('r',[this.db.workspace,this.db.localEntities,this.db.deletedEntities],async()=>{
      const snapshot=await this.db.workspace.get('current'),all=await this.db.localEntities.toArray()
      return { entities:[...all.filter(e=>!e.confirmed||(e.confirmedAt??0)>=(snapshot?.requestedAt??0)),...(await this.db.deletedEntities.toArray()).map(d=>({id:d.id,kind:d.kind,confirmed:true,deleted:true}))],
        pendingIds:all.filter(e=>!e.confirmed).map(e=>e.id) }
    })
  }
  private async checkNewId(id:string) {
    if(await this.db.deletedEntities.get(`note:${id}`)||await this.db.deletedEntities.get(`folder:${id}`))throw new LocalDraftConflict()
    const cache=await this.db.workspace.get('current')
    if(await this.db.localEntities.get(id)||await this.db.drafts.get(id)
      ||cache?.data.folders.some(f=>f.id===id)||cache?.data.notes.some(n=>n.id===id)
      ||await this.db.outbox.where('noteId').equals(id).count()||await this.db.creationOutbox.where('entityId').equals(id).count())throw new LocalDraftConflict()
  }
  private async parentExists(id:string) {
    if(await this.db.deletedEntities.get(`folder:${id}`))throw new Error('삭제된 폴더입니다.')
    const local=await this.db.localEntities.get(id),cache=await this.db.workspace.get('current')
    if(local?.deleted)throw new Error('삭제된 폴더에는 원고를 만들 수 없습니다.')
    const provisional=local?.kind==='folder'&&(!local.confirmed||(local.confirmedAt??0)>=(cache?.requestedAt??0))
    if(!provisional&&!cache?.data.folders.some(f=>f.id===id))throw new Error('부모 폴더의 로컬 기록이 없습니다.')
  }
  async createLocalFolder(r:CreateFolderRequest):Promise<Folder> {
    await this.ensureSchema()
    const id=r.id??crypto.randomUUID(),parentId=r.parentId??null,name=r.name.trim(),stamp=new Date().toISOString()
    const op=creationOperation(id,{type:'FOLDER_CREATE',payload:{id,parentId,name}})
    return this.db.transaction('rw',[this.db.localEntities,this.db.creationOutbox,this.db.workspace,this.db.drafts,this.db.outbox,this.db.deletedEntities],async()=>{
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
    return this.db.transaction('rw',[this.db.localEntities,this.db.creationOutbox,this.db.workspace,this.db.drafts,this.db.outbox,this.db.deletedEntities],async()=>{
      await this.checkNewId(id);if(r.folderId)await this.parentExists(r.folderId)
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
  async renamePendingFolder(id: string, name: string): Promise<Folder> {
    await this.ensureSchema()
    return this.db.transaction('rw', [this.db.localEntities, this.db.creationOutbox], async () => {
      const entity = await this.db.localEntities.get(id)
      const operations = (await this.db.creationOutbox.where('entityId').equals(id).toArray()).map(validateCreation)
      if (!entity?.folder || entity.confirmed || operations.length !== 1) throw new LocalDraftConflict()
      const previous = operations[0]
      if (previous.type !== 'FOLDER_CREATE' || previous.status !== 'pending' || previous.attemptedAt !== null) {
        throw new Error('이미 전송했거나 결과가 불확실한 폴더는 서버 반영 상태를 확인한 뒤 이름을 변경해주세요.')
      }
      const next = creationOperation(id, {type:'FOLDER_CREATE',payload:{...previous.payload,name:name.trim()}})
      const folder = {...entity.folder,name:name.trim(),updatedAt:new Date().toISOString()}
      await this.db.localEntities.put({...entity,folder})
      await this.db.creationOutbox.delete(previous.operationId)
      await this.db.creationOutbox.add(next)
      return folder
    })
  }
  async confirmFolderRename(folder: Folder) {
    await this.ensureSchema()
    await this.db.transaction('rw', [this.db.localEntities, this.db.workspace], async () => {
      const entity = await this.db.localEntities.get(folder.id),cache = await this.db.workspace.get('current')
      if (entity && (!entity.confirmed || entity.kind !== 'folder')) throw new LocalDraftConflict()
      if (entity) await this.db.localEntities.put({...entity,folder,confirmedAt:Date.now()})
      if (cache) await this.db.workspace.put({...cache,data:{...cache.data,folders:cache.data.folders.map(f=>f.id===folder.id?folder:f)},
        requestedAt:Math.max(Date.now(),cache.requestedAt+1),cachedAt:Date.now()})
    })
  }
  private async folderDeletionState(id:string) {
    const cache=await this.db.workspace.get('current'),entities=await this.db.localEntities.toArray(),operations=(await this.db.creationOutbox.toArray()).map(validateCreation)
    const folderIds=new Set([id]),noteIds=new Set<string>()
    const folders=[...(cache?.data.folders??[]),...entities.flatMap(e=>e.folder?[e.folder]:[])]
    let changed=true
    while(changed){changed=false;for(const f of folders)if(f.parentId&&folderIds.has(f.parentId)&&!folderIds.has(f.id)){folderIds.add(f.id);changed=true}}
    for(const n of [...(cache?.data.notes??[]),...entities.flatMap(e=>e.note?[e.note]:[])])if(n.folderId&&folderIds.has(n.folderId))noteIds.add(n.id)
    for(const op of operations)if(op.type==='NOTE_CREATE'&&op.payload.folderId&&folderIds.has(op.payload.folderId))noteIds.add(op.entityId)
    const local=entities.find(e=>e.kind==='folder'&&e.id===id)
    const affected=operations.filter(op=>op.type==='FOLDER_CREATE'?folderIds.has(op.entityId):noteIds.has(op.entityId))
    const localOnly=!!local&&!local.confirmed&&!cache?.data.folders.some(f=>f.id===id)&&!entities.some(e=>e.confirmed&&(e.kind==='folder'?folderIds.has(e.id):noteIds.has(e.id)))&&affected.every(op=>op.status==='pending'&&op.attemptedAt===null)
    return {folderIds:[...folderIds],noteIds:[...noteIds],cache,entities,operations:affected,localOnly}
  }
  private async removeFolderTree(id:string) {
    const plan=await this.folderDeletionState(id),now=Date.now()
    await this.db.creationOutbox.bulkDelete(plan.operations.map(op=>op.operationId))
    for(const noteId of plan.noteIds){await this.db.outbox.where('noteId').equals(noteId).delete();await this.db.drafts.delete(noteId)}
    for(const e of plan.entities)if(e.kind==='folder'?plan.folderIds.includes(e.id):plan.noteIds.includes(e.id))await this.db.localEntities.delete(e.id)
    await this.db.deletedEntities.bulkPut([...plan.folderIds.map(id=>({key:`folder:${id}`,id,kind:'folder' as const,deletedAt:now})),...plan.noteIds.map(id=>({key:`note:${id}`,id,kind:'note' as const,deletedAt:now}))])
    if(plan.cache)await this.db.workspace.put({...plan.cache,requestedAt:Math.max(now,plan.cache.requestedAt+1),cachedAt:now,data:{...plan.cache.data,
      folders:plan.cache.data.folders.filter(f=>!plan.folderIds.includes(f.id)),notes:plan.cache.data.notes.filter(n=>!plan.noteIds.includes(n.id))}})
    return {folderIds:plan.folderIds,noteIds:plan.noteIds}
  }
  async prepareFolderDeletion(id:string) {
    await this.ensureSchema()
    return this.db.transaction('rw',[this.db.workspace,this.db.localEntities,this.db.creationOutbox,this.db.drafts,this.db.outbox,this.db.deletedEntities],async()=>{
      const plan=await this.folderDeletionState(id)
      if(!plan.localOnly)return 'server' as const
      await this.removeFolderTree(id)
      return 'local' as const
    })
  }
  async finishFolderDeletion(id:string) {
    await this.ensureSchema()
    return this.db.transaction('rw',[this.db.workspace,this.db.localEntities,this.db.creationOutbox,this.db.drafts,this.db.outbox,this.db.deletedEntities],()=>this.removeFolderTree(id))
  }
  private async removeLocalNote(id:string) {
    await this.db.drafts.delete(id)
    await this.db.outbox.where('noteId').equals(id).delete()
    const creations=await this.db.creationOutbox.where('entityId').equals(id).toArray()
    await this.db.creationOutbox.bulkDelete(creations.filter(op=>op.type==='NOTE_CREATE').map(op=>op.operationId))
    const entity=await this.db.localEntities.get(id)
    if(entity?.kind==='note')await this.db.localEntities.delete(id)
    const cache=await this.db.workspace.get('current'),now=Date.now()
    if(cache)await this.db.workspace.put({...cache,requestedAt:Math.max(now,cache.requestedAt+1),cachedAt:now,data:{...cache.data,notes:cache.data.notes.filter(n=>n.id!==id)}})
    await this.db.deletedEntities.put({key:`note:${id}`,id,kind:'note',deletedAt:now})
  }
  async finishNoteDeletion(id:string) {
    await this.ensureSchema()
    return this.db.transaction('rw',[this.db.drafts,this.db.outbox,this.db.creationOutbox,this.db.localEntities,this.db.workspace,this.db.deletedEntities],()=>this.removeLocalNote(id))
  }
  async deletedEntities() { await this.ensureSchema();return this.db.deletedEntities.toArray() }
  notifyDeleted() {
    try{const channel=new BroadcastChannel(DRAFT_CHANNEL);channel.postMessage({deleted:true});channel.close()}catch{ /* transaction tombstones remain authoritative */ }
    window.dispatchEvent(new Event('seam-note:workspace-deleted'))
  }
  async listCreations() {
    await this.ensureSchema()
    return (await this.db.creationOutbox.toArray()).map(validateCreation).sort((a,b)=>a.createdAt-b.createdAt||a.operationId.localeCompare(b.operationId))
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
  async claimCreation(entityId:string, allowedOperationIds?: readonly string[]) {
    await this.ensureSchema()
    return this.db.transaction('rw',[this.db.localEntities,this.db.creationOutbox],async()=>{
      const chain=await this.creationChain(entityId)
      if(!chain.length)return null
      if(chain.length!==1)throw new Error('부모 폴더가 서버에 확인되기 전 자식 전송을 중단했습니다.')
      const op=chain[0]
      if (allowedOperationIds && !allowedOperationIds.includes(op.operationId)) return null
      if(op.status==='conflict')throw new Error('생성 충돌 작업입니다. 로컬 데이터를 보존하고 전송을 중단했습니다.')
      if(op.status==='inFlight')return op
      const next={...op,status:'inFlight' as const,attemptedAt:Math.max(Date.now(),op.createdAt)}
      await this.db.creationOutbox.put(next);return next
    })
  }
  async conflictCreation(id:string, failureCode?: string){await this.ensureSchema();await this.db.transaction('rw',this.db.creationOutbox,async()=>{
    const op=await this.db.creationOutbox.get(id);if(!op||op.status!=='inFlight')throw new LocalDraftConflict()
    await this.db.creationOutbox.put({...op,status:'conflict', failureCode})
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
    return this.db.transaction('rw', [this.db.workspace,this.db.localEntities,this.db.creationOutbox,this.db.outbox], async () => {
      const previous = await this.db.workspace.get('current')
      if (previous && previous.requestedAt > requestedAt) return
      await this.db.workspace.put({ key: 'current', data: metadata, cachedAt: Date.now(), requestedAt })
      // Confirmed metadata bridges the period until a newer full server GET.
      const entities=await this.db.localEntities.toArray(),creates=(await this.db.creationOutbox.toArray()).map(validateCreation)
      const updates=(await this.db.outbox.toArray()).map(validateOperation)
      const queued=new Set(creates.map(op=>`${op.type==='FOLDER_CREATE'?'folder':'note'}:${op.entityId}`))
      const updating=new Set(updates.map(op=>op.noteId))
      const referenced=new Set(creates.flatMap(op=>{const parent=op.type==='FOLDER_CREATE'?op.payload.parentId:op.payload.folderId;return parent?[parent]:[]}))
      for(const e of entities)if(!e.confirmed){const parent=e.kind==='folder'?e.folder?.parentId:e.note?.folderId;if(parent)referenced.add(parent)}
      const serverFolders=new Set(metadata.folders.map(f=>f.id))
      for(const e of entities){
        if(!e.confirmed||!Number.isSafeInteger(e.confirmedAt)||e.confirmedAt!>=requestedAt||queued.has(`${e.kind}:${e.id}`)
          ||e.kind==='note'&&updating.has(e.id)||e.kind==='folder'&&referenced.has(e.id)&&!serverFolders.has(e.id))continue
        await this.db.localEntities.delete(e.id)
      }
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
  async read(noteId: string, { initial = false }: { initial?: boolean } = {}) {
    await this.ensureSchema()
    return this.db.transaction('r', [this.db.drafts, this.db.outbox, this.db.localEntities, this.db.creationOutbox,this.db.deletedEntities], async () => {
      if(await this.db.deletedEntities.get(`note:${noteId}`))throw new LocalNoteDeleted()
      const record = await this.db.drafts.get(noteId)
      if (!record) {
        if (initial) {
          const updates = await this.db.outbox.where('noteId').equals(noteId).count()
          const creates = await this.db.creationOutbox.where('entityId').equals(noteId).filter(op => op.type === 'NOTE_CREATE').count()
          const local = await this.db.localEntities.get(noteId)
          if (updates || creates || local && !local.confirmed) throw new MissingDraftRecoveryBlocked()
        }
        return undefined
      }
      validateLocalDraft(record)
      const operations = (await this.db.outbox.where('noteId').equals(noteId).toArray()).map(validateOperation)
      const local = await this.db.localEntities.get(noteId)
      const serverOperationPending = !!(local && !local.confirmed || operations.some(op => op.status !== 'pending'))
      const canRebaseLocalEdits = !serverOperationPending && (operations.length === 0 || operations.length === 1
        && operations[0].status === 'pending' && operations[0].title === record.title && operations[0].content === record.content
        && operations[0].expectedVersion === record.baseVersion && operations[0].localRevision === record.localRevision)
      return { ...record, serverOperationPending, canRebaseLocalEdits }
    })
  }
  /** Recreate only an externally removed row, never an explicitly deleted note.
   * The absence check, queue/checkpoint validation and regular CAS write share one transaction. */
  async restoreMissing(draft:NoteDraft,revision:number,checkpoint:MissingDraftCheckpoint,writerId:string) {
    await this.ensureSchema()
    return this.db.transaction('rw',[this.db.drafts,this.db.outbox,this.db.localEntities,this.db.creationOutbox,this.db.deletedEntities],async()=>{
      if(await this.db.deletedEntities.get(`note:${draft.noteId}`))throw new LocalNoteDeleted()
      if(await this.db.drafts.get(draft.noteId))throw new LocalDraftConflict()
      const old=checkpoint.draft
      if(old.noteId!==draft.noteId||!checkpoint.storageToken||!Number.isSafeInteger(checkpoint.revision)||checkpoint.revision<1
        ||revision<=checkpoint.revision||draft.baseVersion<old.baseVersion)throw new MissingDraftRecoveryBlocked()
      const operations=(await this.db.outbox.where('noteId').equals(draft.noteId).toArray()).map(validateOperation)
      if(operations.length>1||operations.some(op=>op.status!=='pending'||op.attemptedAt!==null||op.title!==old.title
        ||op.content!==old.content||op.expectedVersion!==old.baseVersion||op.localRevision!==checkpoint.revision))throw new MissingDraftRecoveryBlocked()
      const creates=(await this.db.creationOutbox.where('entityId').equals(draft.noteId).toArray()).map(validateCreation).filter(op=>op.type==='NOTE_CREATE')
      const local=await this.db.localEntities.get(draft.noteId)
      if(local?.kind==='note'&&!local.confirmed){
        if(operations.length||creates.length!==1)throw new MissingDraftRecoveryBlocked()
        const op=creates[0]
        if(op.type!=='NOTE_CREATE'||op.status!=='pending'||op.attemptedAt!==null||op.payload.title!==old.title
          ||op.payload.content!==old.content||op.localRevision!==checkpoint.revision||draft.baseVersion!==0)throw new MissingDraftRecoveryBlocked()
      }else if(creates.length)throw new MissingDraftRecoveryBlocked()
      // Still uses write's missing-row CAS. A concurrent new row cannot be overwritten.
      return this.commitDraft(draft,revision,undefined,writerId,true)
    })
  }
  write(draft: NoteDraft, revision: number, expectedToken: string | undefined, writerId: string) {
    return this.commitDraft(draft, revision, expectedToken, writerId, false)
  }
  private async commitDraft(draft: NoteDraft, revision: number, expectedToken: string | undefined, writerId: string, restoringMissing: boolean) {
    await this.ensureSchema()
    // The returned promise resolves only after the entire transaction commits.
    return this.db.transaction('rw', [this.db.drafts, this.db.outbox, this.db.localEntities, this.db.creationOutbox,this.db.deletedEntities], async () => {
      if(await this.db.deletedEntities.get(`note:${draft.noteId}`))throw new LocalNoteDeleted()
      const current = await this.db.drafts.get(draft.noteId)
      if (current) validateLocalDraft(current)
      if (current?.recoveredAs) throw new Error('이 원고는 새 UUID로 복구됐습니다. 복구된 원고를 열어주세요.')
      if (current?.storageToken !== expectedToken || current && revision <= current.localRevision) throw new LocalDraftConflict()
      const next: LocalNoteDraft = {
        ...(current?.conflictHistory ? {conflictHistory:current.conflictHistory} : {}),
        noteId: draft.noteId, title: draft.title, content: draft.content,
        baseTitle: draft.baseTitle, baseContent: draft.baseContent,
        baseVersion: draft.baseVersion, latestServerVersion: draft.latestServerVersion,
        localRevision: revision, localSavedAt: Date.now(),
        storageToken: crypto.randomUUID(), writerId,
      }
      validateLocalDraft(next)
      const operations = await this.db.outbox.where('noteId').equals(draft.noteId).toArray()
      const local=await this.db.localEntities.get(draft.noteId)
      // A new session cannot replace an orphan queue with a fresh server snapshot.
      // Only restoreMissing's checkpoint/queue validation may authorize this case,
      // in the same transaction. A concurrent row is still fenced by the CAS above.
      if (!current && !restoringMissing) {
        const creates = await this.db.creationOutbox.where('entityId').equals(draft.noteId).filter(op => op.type === 'NOTE_CREATE').count()
        if (operations.length || creates || local && !local.confirmed) throw new MissingDraftRecoveryBlocked()
      }
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
  async conflictHead(noteId: string): Promise<ConflictHead> {
    await this.ensureSchema()
    return this.db.transaction('r',[this.db.drafts,this.db.outbox,this.db.creationOutbox],async()=>{
      const record=await this.db.drafts.get(noteId)
      if(record)validateLocalDraft(record)
      return {record,operations:(await this.db.outbox.where('noteId').equals(noteId).toArray()).map(validateOperation),
        creations:(await this.db.creationOutbox.where('entityId').equals(noteId).toArray()).map(validateCreation)}
    })
  }
  async conflictNotes() {
    await this.ensureSchema()
    return this.db.transaction('r',[this.db.outbox,this.db.drafts,this.db.deletedEntities],async()=>{
      const operations=(await this.db.outbox.where('status').equals('conflict').toArray()).map(validateOperation)
      const result:{noteId:string;code?:string;hasDraft:boolean}[]=[]
      for(const op of operations){
        if(await this.db.deletedEntities.get(`note:${op.noteId}`))continue
        const record=await this.db.drafts.get(op.noteId)
        if(record)validateLocalDraft(record)
        result.push({noteId:op.noteId,code:op.failureCode,hasDraft:!!record})
      }
      return result
    })
  }
  /** Explicit user discard only after the server has confirmed NOTE_NOT_FOUND. */
  async discardDeletedConflict(preview: ConflictPreview, isCurrent:()=>boolean) {
    await this.ensureSchema()
    return this.db.transaction('rw',[this.db.drafts,this.db.outbox,this.db.creationOutbox,this.db.localEntities,this.db.workspace,this.db.deletedEntities],async()=>{
      const head=await this.conflictHead(preview.noteId)
      if(preview.kind!=='SERVER_NOTE_DELETED'||!preview.serverMissing||!isCurrent()||headStamp(head)!==headStamp(preview.head))throw new ChangedConflict()
      const blocked=blockedChoice(preview.kind,head)
      if(blocked)throw new Error(blocked)
      await this.removeLocalNote(preview.noteId)
      if(!isCurrent())throw new ChangedConflict()
      return null
    })
  }
  /** Selection, recovery copies and queue replacement commit or roll back together. No network in IDB. */
  async resolveConflict(preview: ConflictPreview, choice: 'mine'|'other'|'recover', writerId: string,
    isCurrent:()=>boolean, folderId?: string | null) {
    await this.ensureSchema()
    return this.db.transaction('rw',[this.db.drafts,this.db.outbox,this.db.creationOutbox,this.db.localEntities,this.db.workspace,this.db.deletedEntities],async()=>{
      const head=await this.conflictHead(preview.noteId)
      if(!isCurrent()||headStamp(head)!==headStamp(preview.head))throw new ChangedConflict()
      const blocked=blockedChoice(preview.kind,head)
      if(blocked)throw new Error(blocked)
      const current=validateLocalDraft(head.record!),now=Date.now()
      const copy:RecoveryCopy={id:crypto.randomUUID(),createdAt:now,kind:preview.kind,choice,mine:snapshot(preview.mine),stored:snapshot(current),
        other:preview.kind==='SERVER_NOTE_DELETED'?null:preview.server?serverDraft(preview.server):head.record?snapshot(head.record):null,
        operations:head.operations,creations:head.creations}
      const history=[...(current.conflictHistory??[]),copy]
      const revision=Math.max(current.localRevision,preview.memoryRevision)+1
      let next:LocalNoteDraft,replacement:Note|undefined
      if(preview.kind==='SERVER_NOTE_DELETED') {
        if(preview.serverMissing!==true)throw new ChangedConflict()
        if(choice!=='recover')throw new Error('잘못된 복구 선택입니다.')
        replacement=await this.createLocalNote({id:crypto.randomUUID(),folderId:folderId||null,title:preview.mine.title,content:preview.mine.content})
        next={...current,...snapshot(preview.mine),conflictHistory:history,recoveredAs:replacement.id,
          localRevision:revision,storageToken:crypto.randomUUID(),localSavedAt:now,writerId}
        await this.db.drafts.put(next)
        await this.db.outbox.bulkDelete(head.operations.map(o=>o.operationId))
      } else if(preview.kind==='LOCAL_DRAFT_CONFLICT') {
        if(choice==='recover')throw new Error('잘못된 선택입니다.')
        const text=choice==='mine'?preview.mine:current
        next=await this.write({...snapshot(current),title:text.title,content:text.content},revision,current.storageToken,writerId)
        next={...next,conflictHistory:history}
        await this.db.drafts.put(next)
      } else {
        if(!preview.server||preview.server.id!==preview.noteId||choice==='recover'||preview.server.version<Math.max(current.baseVersion,current.latestServerVersion,preview.mine.latestServerVersion))throw new ChangedConflict()
        const base=serverDraft(preview.server),text=choice==='mine'?preview.mine:base
        next={...base,title:text.title,content:text.content,conflictHistory:history,localRevision:revision,
          localSavedAt:now,storageToken:crypto.randomUUID(),writerId}
        validateLocalDraft(next)
        await this.db.drafts.put(next)
        await this.db.outbox.bulkDelete(head.operations.map(o=>o.operationId))
        if(isDraftDirty(next))await this.db.outbox.add(createOperation(next))
      }
      if(!isCurrent())throw new ChangedConflict()
      return {record:next,replacement}
    })
  }
  async workspaceSyncCount() {
    await this.ensureSchema()
    return this.db.transaction('r', [this.db.outbox, this.db.creationOutbox], async () =>
      await this.db.outbox.count() + await this.db.creationOutbox.count())
  }
  async workspaceSyncSnapshot() {
    await this.ensureSchema()
    return this.db.transaction('r', [this.db.drafts, this.db.outbox, this.db.localEntities, this.db.creationOutbox, this.db.workspace], async () => ({
      drafts: await this.db.drafts.toArray(), updates: await this.db.outbox.toArray(),
      creations: await this.db.creationOutbox.toArray(), entities: await this.db.localEntities.toArray(),
      workspace: (await this.db.workspace.get('current'))?.data,
    }))
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
  async prepareManual(noteId: string, token: string, revision: number, allowedOperationIds?: readonly string[]) {
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
      if (frozen.length) return !allowedOperationIds || allowedOperationIds.includes(frozen[0].operationId) ? frozen[0] : null
      if (!ops.length) return null
      const op = ops[0]
      if (allowedOperationIds && !allowedOperationIds.includes(op.operationId)) return null
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
  async markConflict(operationId: string, failureCode?: string) {
    await this.ensureSchema()
    return this.db.transaction('rw', this.db.outbox, async () => {
      const operation = await this.db.outbox.get(operationId)
      if (!operation) throw new LocalDraftConflict()
      validateOperation(operation)
      if (operation.status !== 'inFlight') throw new LocalDraftConflict()
      const next: NoteUpdateOperation = { ...operation, status: 'conflict', failureCode, updatedAt: Math.max(Date.now(), operation.updatedAt) }
      await this.db.outbox.put(next)
      return next
    })
  }
}
export const draftDatabase = new DraftDatabase()
export const draftRepository = new DexieDraftRepository(draftDatabase)
