import type { Folder, NoteSummary, CreateFolderRequest, CreateNoteRequest } from '@/lib/api/types'
import type { OutboxStatus } from './outboxModel'
import { InvalidLocalDraft } from '@/features/local-drafts/localDraftTypes'
export interface LocalEntity {
  id: string
  kind: 'folder' | 'note'
  confirmed: boolean
  confirmedAt?: number
  folder?: Folder
  note?: NoteSummary
}
interface Base { readonly operationId: string; readonly entityId: string; status: OutboxStatus; readonly createdAt: number; attemptedAt: number | null }
export type CreationOperation = Base & ({ readonly type: 'FOLDER_CREATE'; readonly payload: Readonly<CreateFolderRequest & { id: string; parentId: string | null }> }
  | { readonly type: 'NOTE_CREATE'; readonly payload: Readonly<CreateNoteRequest & { id: string }>; readonly localRevision: number })
export function validateCreation(op: CreationOperation): CreationOperation {
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if(!op||!uuid.test(op.operationId)||!uuid.test(op.entityId)||op.payload?.id!==op.entityId
    ||!['pending','inFlight','conflict'].includes(op.status)||!Number.isSafeInteger(op.createdAt)||op.createdAt<0
    ||(op.status==='pending'?op.attemptedAt!==null:!Number.isSafeInteger(op.attemptedAt)||op.attemptedAt!<op.createdAt))throw new InvalidLocalDraft()
  if(op.type==='FOLDER_CREATE'){
    if(typeof op.payload.name!=='string'||!op.payload.name.trim()||op.payload.name.length>200
      ||op.payload.parentId!==null&&!uuid.test(op.payload.parentId))throw new InvalidLocalDraft()
  }else if(op.type==='NOTE_CREATE'){
    if(!uuid.test(op.payload.folderId)||typeof op.payload.title!=='string'||op.payload.title.length>200||typeof op.payload.content!=='string'
      ||!Number.isSafeInteger(op.localRevision)||op.localRevision<1)throw new InvalidLocalDraft()
  }else throw new InvalidLocalDraft()
  return op
}
export function creationOperation(entityId: string, data: Omit<Extract<CreationOperation,{type:'FOLDER_CREATE'}>,'operationId'|'entityId'|'status'|'createdAt'|'attemptedAt'>
 | Omit<Extract<CreationOperation,{type:'NOTE_CREATE'}>,'operationId'|'entityId'|'status'|'createdAt'|'attemptedAt'>): CreationOperation {
  return validateCreation({ ...data, entityId, operationId:crypto.randomUUID(),status:'pending',createdAt:Date.now(),attemptedAt:null } as CreationOperation)
}
