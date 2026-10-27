import { withSyncLock } from './syncLock'
import type { Folder, Note } from '@/lib/api/types'
import { ApiError, postJsonWithOperation } from '@/lib/api/client'
import type { DraftSession } from '@/features/local-drafts/draftSession'
import type { CreationOperation } from '@/features/outbox/creationModel'
import { outboxRepository } from '@/features/outbox/outboxRepository'
import { creationStorage } from '@/features/outbox/creationStorage'

export function verifyCreation(op:CreationOperation,body:Folder|Note,key:unknown){
  if(key!==op.operationId||!body||body.id!==op.entityId||body.version!==0||!Number.isSafeInteger(body.sortOrder)||body.sortOrder<0
    ||!Number.isFinite(Date.parse(body.createdAt))||!Number.isFinite(Date.parse(body.updatedAt)))throw new Error('생성 응답의 ID/버전을 확인하지 못했습니다. 작업을 보존합니다.')
  if(op.type==='FOLDER_CREATE'){
    const f=body as Folder;if(f.name!==op.payload.name||f.parentId!==op.payload.parentId)throw new Error('생성 폴더 응답이 요청과 다릅니다.')
  }else{
    const n=body as Note;if(n.folderId!==op.payload.folderId||n.title!==op.payload.title||n.content!==op.payload.content)throw new Error('생성 원고 응답이 요청과 다릅니다.')
  }
  return body
}
async function send(op:CreationOperation){
  try{
    const result=await postJsonWithOperation<Note|Folder>(op.type==='FOLDER_CREATE'?'/folders':'/notes',op.payload,op.operationId)
    return verifyCreation(op,result.body,result.operationId)
  }catch(error){
    if(error instanceof ApiError&&(error.status===409 || error.status===404 && error.code==='FOLDER_NOT_FOUND'))await creationStorage.conflict(op.operationId, error.code)
    throw new Error('생성 결과 또는 ACK를 확인하지 못했습니다. 로컬 데이터와 같은 키의 작업을 보존했습니다. '+(error instanceof ApiError?error.code:''),{cause:error})
  }
}
export interface CreationSyncOptions {
  lockHeld?: boolean
  allowedOperationIds?: readonly string[]
  onAcknowledged?: (operation: CreationOperation) => void
}
async function foldersFor(id:string, options: CreationSyncOptions = {}){
  const chain=await creationStorage.chain(id)
  for(const pending of chain){
    if(pending.type!=='FOLDER_CREATE')continue
    const op=await creationStorage.claim(pending.entityId, options.allowedOperationIds)
    if(op){const result=await send(op);await creationStorage.ackFolder(op,result as Folder);options.onAcknowledged?.(op)}
  }
}
export async function syncLocalFolder(id:string, options: CreationSyncOptions = {}) {
  return options.lockHeld ? foldersFor(id, options) : withSyncLock(() => foldersFor(id, options))
}
export async function syncLocalNote(id:string,session:DraftSession,canSend:()=>boolean, options: CreationSyncOptions = {}):Promise<Note|null>{
  if(!(await creationStorage.local(id))|| (await creationStorage.local(id))?.confirmed)return null
  const run = async () => {
    if(!canSend())throw new Error('원고 상태가 바뀌어 생성을 중단했습니다.')
    const entry=session.getSnapshot()[id]
    if(!entry?.draft||['failed','conflict','recovering'].includes(entry.phase))throw new Error('로컬 원고 복구가 필요합니다.')
    session.protectServerForManual(id);await session.flushLatest(id)
    await foldersFor(id, options)
    if(!canSend())throw new Error('원고 상태가 바뀌어 생성을 중단했습니다.')
    const op=await creationStorage.claim(id, options.allowedOperationIds)
    if(!op)return null
    if(op.type!=='NOTE_CREATE')throw new Error('원고 생성 작업이 아닙니다.')
    const result=await send(op) as Note
    await session.acceptServerAck(id,result,(token,revision,writerId)=>creationStorage.ackNote(op,result,token,revision,writerId))
    options.onAcknowledged?.(op)
    await session.flushLatest(id)
    return result
  }
  return options.lockHeld ? run() : withSyncLock(run)
}
export async function manualOperations(id:string){
  return [...await outboxRepository.listForNote(id),...await creationStorage.chain(id)]
}
