import { LocalDraftConflict } from '@/features/local-drafts/localDraftTypes'
import type { DraftSession } from '@/features/local-drafts/draftSession'
import { getNote } from '@/features/notes/noteApi'
import { ApiError } from '@/lib/api/client'
import { withSyncLock } from '@/features/manual-sync/syncLock'
import { blockedChoice, ChangedConflict, NoConflict, classifyConflict, headStamp, serverDraft, snapshot } from './conflictModel'
import type { ConflictPreview } from './conflictModel'
const repository=async()=>(await import('@/features/local-drafts/draftDatabase')).draftRepository
export const deletedError=(error:unknown)=>error instanceof ApiError&&error.status===404&&error.code==='NOTE_NOT_FOUND'
export async function inspectConflict(id:string,session:DraftSession):Promise<ConflictPreview> {
  session.select(id)
  if(!session.getSnapshot()[id]?.draft)await session.readyForSync(id)
  let entry=session.getSnapshot()[id]
  if(entry.phase!=='conflict')await session.flushLatest(id)
  else await session.retry(id) // Only the existing verified automatic reconciliation is permitted.
  entry=session.getSnapshot()[id]
  if(!entry?.draft)throw new Error('로컬 원고를 복구하지 못했습니다. 입력을 먼저 보관해주세요.')
  const repo=await repository(),head=await repo.conflictHead(id)
  let kind=classifyConflict(head,entry.phase==='conflict')
  let missing=false
  if(!kind&&!head.record?.recoveredAs&&!head.creations.length&&!head.operations.some(o=>o.status!=='pending')&&navigator.onLine!==false){
    try{await getNote(id)}catch(error){if(deletedError(error)){kind='SERVER_NOTE_DELETED';missing=true}else throw error}
  }
  if(!kind&&head.operations.some(o=>o.status==='inFlight'))throw new Error('전송 결과가 미확정입니다. 모든 변경사항 동기화로 기존 키의 결과를 확인한 뒤 다시 비교해주세요.')
  if(!kind){if(head.operations.some(o=>o.status==='conflict'))throw new Error('버전 충돌 이외의 오류입니다. UUID·멱등성 키 또는 오류 코드를 확인해주세요. 기존 작업을 보존합니다.');throw new NoConflict()}
  const preview:ConflictPreview={noteId:id,kind,memoryRevision:entry.revision,mine:snapshot(entry.draft),head,...(missing?{serverMissing:true as const}:{})}
  if(kind!=='LOCAL_DRAFT_CONFLICT') {
    try {
      const server=await getNote(id);serverDraft(server)
      if(server.id!==id)throw new Error('서버 원고 ID가 일치하지 않습니다.')
      preview.server=server
      if(kind==='SERVER_NOTE_DELETED')preview.blocked='서버에서 원고가 다시 조회됩니다. 삭제로 단정하거나 자동 복구하지 않습니다. 상태를 다시 확인해주세요.'
    }catch(error){if(!deletedError(error))throw error;preview.kind='SERVER_NOTE_DELETED';preview.serverMissing=true}
  }
  preview.blocked??=blockedChoice(preview.kind,head)
  return preview
}
export async function chooseConflict(preview:ConflictPreview,choice:'mine'|'other'|'recover',session:DraftSession,folderId?:string|null) {
  const repo=await repository()
  const execute=async()=>{
    if(session.getSnapshot()[preview.noteId]?.revision!==preview.memoryRevision)throw new ChangedConflict()
    if(headStamp(await repo.conflictHead(preview.noteId))!==headStamp(preview.head))throw new ChangedConflict()
    if(preview.blocked)throw new Error(preview.blocked)
    if(preview.kind==='SERVER_VERSION_CONFLICT') {
      const current=await getNote(preview.noteId)
      if(!preview.server||current.id!==preview.noteId||current.version!==preview.server.version||current.title!==preview.server.title||current.content!==preview.server.content)throw new ChangedConflict()
    } else if(preview.kind==='SERVER_NOTE_DELETED') {
      try{await getNote(preview.noteId)}catch(error){if(deletedError(error))return apply();throw error}
      throw new ChangedConflict()
    }
    return apply()
  }
  const apply=async()=>{
    let result:Awaited<ReturnType<typeof repo.resolveConflict>>|undefined
    try {
      await session.applyConflictChoice(preview.noteId,preview.memoryRevision,async(writer,current)=>{
        result=await repo.resolveConflict(preview,choice,writer,current,folderId);return result.record
      })
    }catch(error){if(error instanceof LocalDraftConflict)throw new ChangedConflict();throw error}
    return result!
  }
  if(preview.kind!=='LOCAL_DRAFT_CONFLICT')return withSyncLock(execute)
  if(!navigator.locks)throw new Error('탭 간 잠금을 지원하지 않아 선택을 적용하지 않았습니다.')
  return navigator.locks.request(`seam-note:conflict-choice:${preview.noteId}`,{mode:'exclusive',ifAvailable:true},lock=>{
    if(!lock)throw new Error('다른 탭에서 버전을 선택 중입니다. 다시 비교해주세요.')
    return execute()
  })
}

/** A version choice is an explicit save action for this note only. Existing locks,
 * frozen snapshots, retry keys and ACK fences remain the authority. */
export async function saveChosenNote(noteId:string,session:DraftSession) {
  if(navigator.onLine===false)throw new Error('선택한 원고는 로컬에 보관했습니다. 인터넷 연결 후 선택 버튼을 다시 눌러 서버 저장을 재시도해주세요.')
  const [{syncLocalNote},{syncOneNote,sendNoteSnapshot},{outboxRepository}]=await Promise.all([
    import('@/features/manual-sync/creationSync'),import('@/features/manual-sync/manualSync'),
    import('@/features/outbox/outboxRepository'),
  ])
  return withSyncLock(async()=>{
    // A recovered UUID exists in IndexedDB before it is mounted by the router.
    await session.readyForSync(noteId)
    const canSend=()=>navigator.onLine!==false
    await syncLocalNote(noteId,session,canSend,{lockHeld:true})
    return syncOneNote(noteId,session,{lockHeld:true,storage:outboxRepository,send:sendNoteSnapshot,locks:navigator.locks,canSend})
  })
}

/** Does not DELETE or recreate a server note. Revalidate missing state before local discard. */
export async function discardDeletedNote(preview:ConflictPreview,session:DraftSession) {
  return withSyncLock(async()=>{
    if(preview.kind!=='SERVER_NOTE_DELETED'||!preview.serverMissing||preview.blocked)throw new ChangedConflict()
    try{await getNote(preview.noteId);throw new ChangedConflict()}catch(error){if(!deletedError(error))throw error}
    const repo=await repository()
    await session.applyConflictChoice(preview.noteId,preview.memoryRevision,(_writer,current)=>repo.discardDeletedConflict(preview,current))
    repo.notifyDeleted()
  })
}
