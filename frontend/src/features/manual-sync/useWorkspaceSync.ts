import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DraftSession } from '@/features/local-drafts/draftSession'
import type { WorkspaceTreeResponse, Note } from '@/lib/api/types'
import { noteKeys, workspaceKeys } from '@/lib/query/queryKeys'
import type { WorkspaceSyncResult } from './SyncCoordinator'
import { workspaceSyncStorage } from './workspaceSyncStorage'

export function useWorkspaceSync(session: DraftSession, online: boolean, workspace: WorkspaceTreeResponse | undefined) {
  const client=useQueryClient(),entries=useSyncExternalStore(session.subscribe,session.getSnapshot)
  const gate=useRef(false),[busy,setBusy]=useState(false),[result,setResult]=useState<WorkspaceSyncResult|null>(null),[error,setError]=useState('')
  const [count,setCount]=useState<{value?:number;error:boolean}>({error:false})
  useEffect(()=>{
    let active=true,sequence=0
    const read=()=>{const request=++sequence;void workspaceSyncStorage.count().then(value=>{
      if(active&&request===sequence)setCount({value,error:false})
    }).catch(()=>{if(active&&request===sequence)setCount({error:true})})}
    read();window.addEventListener('focus',read);document.addEventListener('visibilitychange',read)
    return()=>{active=false;window.removeEventListener('focus',read);document.removeEventListener('visibilitychange',read)}
  },[entries,busy,result,workspace])
  async function run(){
    if(gate.current||!online)return
    gate.current=true;setBusy(true);setError('');setResult(null)
    try{
      const {syncWorkspace}=await import('./SyncCoordinator')
      const outcome=await syncWorkspace(session,{
        onNote:note=>client.setQueryData<Note>(noteKeys.detail(note.id),current=>current&&current.version>note.version?current:note)})
      // A manual sync is also an explicit pull. Workspace summaries do not
      // contain the body, so an empty Outbox must still refresh active details.
      // DraftSession.receive retains dirty/uncertain drafts via its existing barrier.
      await client.invalidateQueries({queryKey:noteKeys.all})
      setResult(outcome)
    }catch(cause){setError(cause instanceof Error?cause.message:'전체 동기화 상태를 확인하지 못했습니다. 작업을 보존했습니다.')}
    finally{
      gate.current=false;setBusy(false)
      void client.invalidateQueries({queryKey:workspaceKeys.tree()})
    }
  }
  const memoryPending=Object.values(entries).filter(e=>!!e.draft&&e.revision!==e.savedRevision).length
  const categories=result?.issues.reduce<Record<string,number>>((counts,item)=>({...counts,[item.kind]:(counts[item.kind]??0)+1}),{})??{}
  const summary=count.error?'Outbox 조회 실패 · 작업 수를 확인할 수 없습니다.':count.value===undefined?'미동기화 작업 확인 중':`미동기화 작업 ${count.value}개${memoryPending?` · 로컬 저장 대기 원고 ${memoryPending}개`:''}`
  const message=result?`마지막 실행: ACK 성공 ${result.acknowledged.length}개 · 충돌 ${categories.conflict??0}개 · 확인 필요 ${categories.review??0}개 · 보류 ${categories.deferred??0}개 · 네트워크 오류 ${categories.network??0}개 · 기타 실패 ${categories.failed??0}개 · 로컬 저장 실패 ${result.localFailures.length}개 · 종료 시 남은 작업 ${result.remaining??'확인 불가'}개${result.newOrRebased?` (새로 기록·재조정된 작업 ${result.newOrRebased}개 포함)`:''}`:''
  const details=result?[...result.issues.map(i=>({id:i.operationId,entityId:i.entityId,message:i.message})),...result.localFailures.map(i=>({id:'local:'+i.noteId,entityId:i.noteId,message:i.message}))].map(i=>({...i,label:entries[i.entityId]?.draft?.title||workspace?.folders.find(f=>f.id===i.entityId)?.name||workspace?.notes.find(n=>n.id===i.entityId)?.title||'제목 없음'})):[]
  return {busy,disabled:!online||busy||count.error||count.value===undefined,summary,message,error:error||result?.readError||'',details,onSync:()=>{void run()}}
}
