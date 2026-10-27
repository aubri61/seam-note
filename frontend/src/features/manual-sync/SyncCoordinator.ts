import { LocalDraftConflict } from '@/features/local-drafts/localDraftTypes'
import { ApiError } from '@/lib/api/client'
import type { Note } from '@/lib/api/types'
import type { DraftSession } from '@/features/local-drafts/draftSession'
import { validateCreation } from '@/features/outbox/creationModel'
import type { CreationOperation } from '@/features/outbox/creationModel'
import { validateOperation } from '@/features/outbox/outboxModel'
import type { NoteUpdateOperation } from '@/features/outbox/outboxModel'
import { outboxRepository } from '@/features/outbox/outboxRepository'
import { syncLocalFolder, syncLocalNote } from './creationSync'
import { sendNoteSnapshot, syncOneNote } from './manualSync'
import { withSyncLock } from './syncLock'
import { workspaceSyncStorage } from './workspaceSyncStorage'
import type { WorkspaceSyncSnapshot } from './workspaceSyncStorage'

export type SyncIssueKind = 'conflict' | 'review' | 'deferred' | 'network' | 'failed'
export interface SyncIssue { operationId: string; entityId: string; kind: SyncIssueKind; message: string; code?: string }
export interface WorkspaceSyncResult {
  acknowledged: string[]; issues: SyncIssue[]; localFailures: {noteId: string; message: string}[]
  initialCount: number; remaining?: number; newOrRebased?: number; readError?: string
}
function entityId(op: CreationOperation | NoteUpdateOperation) { return op.type === 'NOTE_UPDATE' ? op.noteId : op.entityId }
function persistedIssue(op: CreationOperation | NoteUpdateOperation): SyncIssue {
  const code = op.failureCode
  return {operationId:op.operationId,entityId:entityId(op),kind:code==='NOTE_NOT_FOUND'?'review':code==='FOLDER_NOT_FOUND'?'deferred':'conflict',code,
    message:code==='NOTE_NOT_FOUND'?'서버에서 원고를 찾지 못한 작업입니다. 로컬 원고를 보존했습니다.':code==='FOLDER_NOT_FOUND'?'서버 부모 폴더 확인이 필요합니다.':'충돌 작업을 보존했습니다. 별도 확인이 필요합니다.'}
}
/** Validate a dependency graph, without changing either Outbox or trusting insertion order. */
export function planWorkspaceSync(snapshot: WorkspaceSyncSnapshot) {
  const issues: SyncIssue[] = [], nodes = new Map<string, CreationOperation>(), dependencies = new Map<string, string>()
  const entities = new Map(snapshot.entities.map(e => [e.id,e]))
  const updates = new Map<string, NoteUpdateOperation[]>()
  const bad = new Set<string>()
  const reject = (op: CreationOperation | NoteUpdateOperation, message: string) => {bad.add(op.operationId);issues.push({operationId:op.operationId,entityId:entityId(op),kind:'deferred',message})}
  for (const op of snapshot.creations) {
    try { validateCreation(op) } catch { reject(op,'잘못된 생성 작업을 보존하고 전송을 보류했습니다.');continue }
    const previous = nodes.get(op.entityId)
    if (previous) {reject(previous,'동일 엔티티의 생성 작업이 중복되어 있습니다.');reject(op,'동일 엔티티의 생성 작업이 중복되어 있습니다.');continue}
    nodes.set(op.entityId,op)
    const e=entities.get(op.entityId)
    if (!e || e.confirmed || (op.type==='FOLDER_CREATE' ? e.kind!=='folder'||e.folder?.parentId!==op.payload.parentId : e.kind!=='note'||e.note?.folderId!==op.payload.folderId)) reject(op,'생성 작업과 로컬 엔티티 관계를 확인하지 못했습니다.')
    if (op.status==='conflict') {bad.add(op.operationId);issues.push(persistedIssue(op))}
  }
  for (const op of nodes.values()) {
    const parent=op.type==='FOLDER_CREATE'?op.payload.parentId:op.payload.folderId
    if (!parent) continue
    const parentOp=nodes.get(parent),parentEntity=entities.get(parent)
    if (parentOp) {
      dependencies.set(op.entityId,parent)
      if(parentOp.type!=='FOLDER_CREATE')reject(op,'부모가 폴더 생성 작업이 아닙니다.')
    } else if (parentEntity&&!parentEntity.confirmed || !snapshot.workspace?.folders.some(f=>f.id===parent)&&!(parentEntity?.confirmed&&parentEntity.kind==='folder')) reject(op,'부모 폴더의 서버 확인 또는 생성 작업이 없습니다.')
  }
  const ordered: CreationOperation[] = [], visited=new Set<string>(),active=new Set<string>()
  // Iterative traversal avoids a deep-folder JavaScript recursion limit.
  for (const start of nodes.keys()) {
    const path:string[]=[];let id:string|undefined=start
    while(id&&!visited.has(id)&&!active.has(id)){active.add(id);path.push(id);id=dependencies.get(id)}
    if(id&&active.has(id))for(const key of path)reject(nodes.get(key)!,'순환된 폴더 의존성을 보류했습니다.')
    for(const key of path.reverse()){active.delete(key);visited.add(key);ordered.push(nodes.get(key)!)}
  }
  for(const op of snapshot.updates){
    try{validateOperation(op)}catch{reject(op,'잘못된 수정 작업을 보존했습니다.');continue}
    if(op.status==='conflict'){issues.push(persistedIssue(op));continue}
    const local=entities.get(op.noteId)
    if(local&&!local.confirmed){reject(op,'서버 생성이 확인되기 전 수정 작업은 전송할 수 없습니다.');continue}
    const group=updates.get(op.noteId)??[];group.push(op);updates.set(op.noteId,group)
  }
  const conflictedNotes = new Set(snapshot.updates.filter(op=>op.status==='conflict').map(op=>op.noteId))
  for (const id of conflictedNotes) {
    for (const op of updates.get(id)??[]) reject(op,'앞선 충돌 작업을 먼저 확인해야 합니다.')
    updates.delete(id)
  }
  return {ordered,bad,dependencies,updates,issues}
}
function localCause(error: unknown): boolean {
  for (let i=0; error instanceof Error && i<8; i++, error=error.cause) if (error instanceof LocalDraftConflict) return true
  return false
}
function apiCause(error: unknown): ApiError | undefined {
  for(let i=0;error instanceof Error&&i<8;i++,error=error.cause)if(error instanceof ApiError)return error
}
interface Dependencies {
  read: typeof workspaceSyncStorage.read
  folder: typeof syncLocalFolder; createNote: typeof syncLocalNote; update: typeof syncOneNote
  locks: LockManager | undefined
  onNote?: (note: Note) => void
}
/** Exactly one explicit pass. No timer, online listener, automatic retry, or unbounded drain. */
export async function syncWorkspace(session: DraftSession, overrides: Partial<Dependencies> = {}): Promise<WorkspaceSyncResult> {
  const deps: Dependencies = {read:workspaceSyncStorage.read,folder:syncLocalFolder,createNote:syncLocalNote,update:syncOneNote,locks:typeof navigator==='undefined'?undefined:navigator.locks,...overrides}
  return withSyncLock(async()=>{
    const acknowledged=new Set<string>(),issues=new Map<string,SyncIssue>(),localFailures=new Map<string,string>()
    const issue=(value:SyncIssue)=>{if(!acknowledged.has(value.operationId))issues.set(value.operationId,value)}
    for(const [id,entry] of Object.entries(session.getSnapshot())){
      if(!entry.draft)continue
      try{await session.readyForSync(id);await session.flushLatest(id)}catch(error){localFailures.set(id,error instanceof Error?error.message:'로컬 저장 실패')}
    }
    // This read establishes the finite cut after this tab's memory commit barrier.
    const snapshot=await deps.read(),plan=planWorkspaceSync(snapshot)
    const original=new Set([...snapshot.creations,...snapshot.updates].map(op=>op.operationId))
    plan.issues.forEach(issue)
    const byEntity=new Map(plan.ordered.map(op=>[op.entityId,op]))
    const initialDrafts=new Map(snapshot.drafts.map(d=>[d.noteId,d]))
    let consecutiveNetwork=0,stopReason=''
    const ack=(op:CreationOperation|NoteUpdateOperation)=>{acknowledged.add(op.operationId);issues.delete(op.operationId);consecutiveNetwork=0}
    const handle=(op:CreationOperation|NoteUpdateOperation,error:unknown)=>{
      const api=apiCause(error),id=entityId(op),phase=session.getSnapshot()[id]?.phase
      if (!api && localCause(error)) {
        localFailures.set(id,'다른 탭의 로컬 저장 기준이 변경되어 전송·ACK를 확정하지 못했습니다. 현재 입력과 미확정 작업을 보존했습니다.')
        return
      }
      if(phase==='failed'||phase==='conflict')localFailures.set(id,phase==='conflict'?'다른 탭과 로컬 원고 충돌: 현재 입력과 미확정 작업을 보존했습니다.':'로컬 저장 또는 ACK 확인이 필요합니다. 원고를 보존했습니다.')
      if(acknowledged.has(op.operationId)){localFailures.set(id,'서버 ACK 후 후속 작업 또는 로컬 저장 확인이 필요합니다.');return}
      const network=!!api&&(api.status===0||api.status>=500)
      if(network){if(++consecutiveNetwork>=2)stopReason='네트워크 장애가 연속되어 나머지 작업을 보류했습니다.'}
      else if(api?.status===401||api?.status===403)stopReason='서버 접근 권한을 확인한 뒤 다시 시도해주세요.'
      issue({operationId:op.operationId,entityId:id,code:api?.code,kind:network?'network':api?.status===404&&api.code==='NOTE_NOT_FOUND'&&op.type==='NOTE_UPDATE'?'review':api?.status===409?'conflict':api?.status===404&&api.code==='FOLDER_NOT_FOUND'?'deferred':'failed',
        message:api?.status===404&&api.code==='NOTE_NOT_FOUND'?'서버에서 원고를 찾지 못했습니다. 자동 재생성 없이 로컬 원고와 작업을 보존했습니다.':error instanceof Error?error.message:'동기화 확인 실패'})
    }
    const safeNote=async(id:string)=>{
      if(localFailures.has(id))return false
      try{await session.readyForSync(id);await session.flushLatest(id);return true}
      catch(error){localFailures.set(id,error instanceof Error?error.message:'로컬 복구 실패');return false}
    }
    const update=async(id:string,allowed:readonly string[],fallback:CreationOperation|NoteUpdateOperation)=>{
      let sent:NoteUpdateOperation|undefined
      try{
        const result=await deps.update(id,session,{storage:outboxRepository,send:sendNoteSnapshot,locks:deps.locks,lockHeld:true,allowedOperationIds:allowed,
          canSend:()=>!localFailures.has(id),onSending:op=>{sent=op},onAcknowledged:op=>ack(op)})
        if(result.kind==='synced')deps.onNote?.(result.note)
        return result
      }catch(error){handle(sent??fallback,error);return null}
    }
    for(const op of plan.ordered){
      if(plan.bad.has(op.operationId))continue
      const parent=plan.dependencies.get(op.entityId),parentOp=parent?byEntity.get(parent):undefined
      if(stopReason||parentOp&&!acknowledged.has(parentOp.operationId)){
        issue({operationId:op.operationId,entityId:op.entityId,kind:'deferred',message:stopReason||'부모 생성이 확인되지 않아 보류했습니다.'});continue
      }
      if(op.type==='NOTE_CREATE'&&!await safeNote(op.entityId)){issue({operationId:op.operationId,entityId:op.entityId,kind:'deferred',message:'이 원고의 로컬 저장 확인이 필요합니다.'});continue}
      try{
        const options={lockHeld:true,allowedOperationIds:[op.operationId],onAcknowledged:ack}
        if(op.type==='FOLDER_CREATE')await deps.folder(op.entityId,options)
        else{
          const note=await deps.createNote(op.entityId,session,()=>!localFailures.has(op.entityId),options)
          if(note)deps.onNote?.(note)
          // One bounded follow-up is allowed only for a creation ACK from this run.
          if(acknowledged.has(op.operationId)){
            const follow=(await deps.read()).updates.filter(u=>u.noteId===op.entityId)
            if(follow.length)await update(op.entityId,follow.map(u=>u.operationId),op)
          }
        }
        if(!acknowledged.has(op.operationId))issue({operationId:op.operationId,entityId:op.entityId,kind:'deferred',message:'클릭 이후 로컬 작업이 변경되어 다음 동기화로 남겼습니다.'})
      }catch(error){handle(op,error)}
    }
    for(const [id,ops] of plan.updates){
      if(stopReason||!await safeNote(id)){
        ops.forEach(op=>issue({operationId:op.operationId,entityId:id,kind:'deferred',message:stopReason||'이 원고의 로컬 저장 확인이 필요합니다.'}));continue
      }
      const result=await update(id,ops.map(op=>op.operationId),ops[0])
      if(result?.kind==='unchanged')ops.forEach(op=>issue({operationId:op.operationId,entityId:id,kind:'deferred',message:'클릭 이후 수정 작업이 바뀌어 다음 동기화로 남겼습니다.'}))
      // ACK can rebase a clicked pending successor into a new key. Send it once
      // only when the latest body still equals the click snapshot (no new input).
      const clicked=initialDrafts.get(id),current=session.getSnapshot()[id]?.draft
      if(result?.kind==='synced'&&ops.length>1&&clicked&&current?.title===clicked.title&&current.content===clicked.content){
        try{const follow=(await deps.read()).updates.filter(u=>u.noteId===id&&u.status==='pending');if(follow.length)await update(id,follow.map(u=>u.operationId),ops[0])}catch(error){localFailures.set(id,error instanceof Error?error.message:'후속 작업 조회 실패')}
      }
    }
    const result:WorkspaceSyncResult={acknowledged:[...acknowledged],issues:[...issues.values()],localFailures:[...localFailures].map(([noteId,message])=>({noteId,message})),initialCount:original.size}
    try{
      const final=await deps.read(),remaining=[...final.creations,...final.updates]
      result.remaining=remaining.length;result.newOrRebased=remaining.filter(op=>!original.has(op.operationId)).length
    }catch{result.readError='최종 Outbox를 읽지 못했습니다. 남은 작업 수와 완료 여부를 확인할 수 없습니다.'}
    return result
  },deps.locks)
}
