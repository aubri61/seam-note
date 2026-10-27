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
    if(error instanceof ApiError&&error.status===409)await creationStorage.conflict(op.operationId)
    throw new Error('생성 결과 또는 ACK를 확인하지 못했습니다. 로컬 데이터와 같은 키의 작업을 보존했습니다. '+(error instanceof ApiError?error.code:''),{cause:error})
  }
}
async function locked<T>(action:()=>Promise<T>){
  if(!navigator.onLine||!navigator.locks)throw new Error('온라인 및 탭 간 잠금을 확인한 뒤 저장해주세요.')
  return navigator.locks.request('seam-note:creation-sync',{mode:'exclusive',ifAvailable:true},lock=>{
    if(!lock)throw new Error('다른 탭에서 생성 작업을 반영하고 있습니다. 전송을 중단했습니다.')
    return action()
  })
}
async function foldersFor(id:string){
  const chain=await creationStorage.chain(id)
  for(const pending of chain){
    if(pending.type!=='FOLDER_CREATE')continue
    const op=await creationStorage.claim(pending.entityId)
    if(op){const result=await send(op);await creationStorage.ackFolder(op,result as Folder)}
  }
}
export async function syncLocalFolder(id:string){return locked(()=>foldersFor(id))}
export async function syncLocalNote(id:string,session:DraftSession,canSend:()=>boolean):Promise<Note|null>{
  if(!(await creationStorage.local(id))|| (await creationStorage.local(id))?.confirmed)return null
  return locked(async()=>{
    if(!canSend())throw new Error('원고 상태가 바뀌어 생성을 중단했습니다.')
    const entry=session.getSnapshot()[id]
    if(!entry?.draft||['failed','conflict','recovering'].includes(entry.phase))throw new Error('로컬 원고 복구가 필요합니다.')
    session.protectServerForManual(id);await session.flushLatest(id)
    await foldersFor(id)
    if(!canSend())throw new Error('원고 상태가 바뀌어 생성을 중단했습니다.')
    const op=await creationStorage.claim(id)
    if(!op)return null
    if(op.type!=='NOTE_CREATE')throw new Error('원고 생성 작업이 아닙니다.')
    const result=await send(op) as Note
    await session.acceptServerAck(id,result,(token,revision,writerId)=>creationStorage.ackNote(op,result,token,revision,writerId))
    await session.flushLatest(id)
    return result
  })
}
export async function manualOperations(id:string){
  return [...await outboxRepository.listForNote(id),...await creationStorage.chain(id)]
}
