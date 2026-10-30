import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'
import axios from 'axios'
import { isCancelledError, useQueryClient } from '@tanstack/react-query'
import type { DraftSession } from '@/features/local-drafts/draftSession'
import type { WorkspaceTreeResponse, Note } from '@/lib/api/types'
import { ApiError } from '@/lib/api/client'
import { noteKeys, workspaceKeys } from '@/lib/query/queryKeys'
import { noteQueries } from '@/features/notes/noteQueries'
import { workspaceTreeQuery } from '@/features/workspace/workspaceQueries'
import { isDraftDirty } from '@/features/notes/noteDrafts'
import type { WorkspaceSyncResult } from './SyncCoordinator'
import { workspaceSyncStorage } from './workspaceSyncStorage'
import { AutoSyncScheduler, needsFreshPull } from './autoSyncScheduler'
import type { SyncTrigger, RunOutcome } from './autoSyncScheduler'

type ServerState='idle'|'syncing'|'synced'|'pending'|'error'|'review'
export function useWorkspaceSync(session:DraftSession,online:boolean,workspace:WorkspaceTreeResponse|undefined,selectedId:string|null=null) {
  const client=useQueryClient(),entries=useSyncExternalStore(session.subscribe,session.getSnapshot)
  const selected=useRef(selectedId)
  useEffect(()=>{selected.current=selectedId},[selectedId])
  const runner=useRef<AutoSyncScheduler|null>(null)
  const [busy,setBusy]=useState(false),[result,setResult]=useState<WorkspaceSyncResult|null>(null),[error,setError]=useState('')
  const [serverState,setServerState]=useState<ServerState>('idle'),[count,setCount]=useState<{value?:number;error:boolean}>({error:false})
  useEffect(()=>{
    let disposed=false,subscription:{unsubscribe:()=>void}|undefined
    const blocked=new Set<string>()
    const read=async()=>{const value=await workspaceSyncStorage.read();const ids=new Set([...value.updates,...value.creations].map(o=>o.operationId));for(const id of blocked)if(!ids.has(id))blocked.delete(id);if(!disposed)setCount({value:value.updates.length+value.creations.length,error:false});return value}
    const isOnline=()=>navigator.onLine!==false
    const pullSelected=async(force=false)=>{
      const id=selected.current,data=client.getQueryData<WorkspaceTreeResponse>(workspaceKeys.tree())
      if(!id||!data?.notes.some(n=>n.id===id))return
      const {draftRepository:repo}=await import('@/features/local-drafts/draftDatabase')
      const local=await repo.localEntity(id)
      if(local&&!local.confirmed)return
      await client.fetchQuery({...noteQueries.detail(id),staleTime:force?0:2000,retry:false})
    }
    const run=async(reasons:ReadonlySet<SyncTrigger>):Promise<RunOutcome>=>{
      if(disposed||!isOnline())return 'success'
      const manual=reasons.has('manual'),freshPull=needsFreshPull(reasons)
      if(manual)blocked.clear()
      setBusy(true);setServerState('syncing');setError('')
      try{
        const initial=await read()
        // Recover only selected/queued note bodies, never all workspace bodies.
        const ids=new Set([...initial.updates.map(o=>o.noteId),...initial.creations.filter(o=>o.type==='NOTE_CREATE').map(o=>o.entityId)])
        if(selected.current)ids.add(selected.current)
        await Promise.allSettled([...ids].map(async id=>{session.select(id);await session.retry(id);await session.readyForSync(id)}))
        await Promise.allSettled(Object.entries(session.getSnapshot()).filter(([,e])=>e.draft).map(([id])=>session.flushLatest(id)))
        if(disposed||!isOnline())return 'success'
        // Startup can reuse the query just fetched by the UI. Focus/reconnect pull afresh.
        const data=await client.fetchQuery({...workspaceTreeQuery(),staleTime:reasons.has('startup')&&!freshPull?2000:0,retry:false})
        if(data.localSnapshot){
          setError(data.localSnapshot.cachedAt?'서버에 연결할 수 없습니다. 로컬 원고는 유지되며 잠시 후 다시 시도합니다.':'로컬 목록 저장을 확인하지 못해 자동 전송을 중단했습니다.')
          setServerState('error');return data.localSnapshot.cachedAt?'retry':'halt'
        }
        if(disposed||!isOnline())return 'success'
        // The GET is independent of sending; its response still passes DraftSession's barrier.
        try{await pullSelected(freshPull)}catch(cause){
          if(!(cause instanceof ApiError&&cause.status===404&&cause.code==='NOTE_NOT_FOUND'))throw cause
        }
        const {syncWorkspace}=await import('./SyncCoordinator')
        const outcome=await syncWorkspace(session,{
          read:async()=>{const all=await read();return {...all,creations:all.creations.filter(o=>!blocked.has(o.operationId)),updates:all.updates.filter(o=>!blocked.has(o.operationId))}},
          onNote:note=>client.setQueryData<Note>(noteKeys.detail(note.id),current=>current&&current.version>note.version?current:note),
        })
        if(disposed)return 'success'
        setResult(outcome)
        // Access can be restored by logging in; keep its original queue key eligible
        // for the next explicit focus/reconnect/manual attempt, without a retry loop.
        for(const issue of outcome.issues)if(issue.kind==='failed'&&issue.status!==401&&issue.status!==403)blocked.add(issue.operationId)
        if(outcome.acknowledged.length)await client.fetchQuery({...workspaceTreeQuery(),staleTime:0,retry:false})
        // Only the currently selected detail is refreshed, not every mounted query cache entry.
        try{await pullSelected()}catch(cause){if(!(cause instanceof ApiError&&cause.status===404&&cause.code==='NOTE_NOT_FOUND'))throw cause}
        const final=await read()
        if(outcome.issues.some(i=>i.status===401||i.status===403)){setError('서버 접근 권한을 확인해주세요. 자동 전송을 중단했습니다.');setServerState('error');return 'auth'}
        if(outcome.issues.some(i=>i.kind==='network')){setError('서버 연결 오류입니다. 로컬 원고와 기존 전송 키를 보존하고 다시 시도합니다.');setServerState('error');return 'retry'}
        const queuedNotes=new Set([...final.updates.map(o=>o.noteId),...final.creations.filter(o=>o.type==='NOTE_CREATE').map(o=>o.entityId)])
        const unqueued=final.drafts.some(d=>!d.recoveredAs&&isDraftDirty(d)&&!queuedNotes.has(d.noteId))
        if(unqueued)setError('로컬 변경에 대응하는 전송 작업을 확인하지 못했습니다. 원고를 보존했으며 확인이 필요합니다.')
        const review=unqueued||outcome.localFailures.length>0||outcome.issues.some(i=>i.kind!=='network')||blocked.size>0
        setServerState(review?'review':final.updates.length+final.creations.length?'pending':'synced')
        if(outcome.readError)setError(outcome.readError)
        return review?'review':'success'
      }catch(cause){
        if(disposed)return 'success'
        if(isCancelledError(cause)||axios.isCancel(cause)){setServerState('pending');return 'success'}
        if(cause instanceof Error&&cause.message.includes('다른 탭 또는 저장 작업')){setError('');setServerState('pending');return 'retry'}
        setError(cause instanceof Error?cause.message:'자동 동기화 상태를 확인하지 못했습니다. 로컬 원고를 보존합니다.');setServerState('error')
        if(cause instanceof ApiError&&(cause.status===401||cause.status===403))return 'auth'
        if(cause instanceof ApiError&&(cause.status===0||cause.status>=500||cause.status===408||cause.status===429))return 'retry'
        return 'halt'
      }finally{if(!disposed)setBusy(false)}
    }
    const scheduler=new AutoSyncScheduler({online:()=>navigator.onLine!==false,run});runner.current=scheduler
    let queueSignature:string|undefined,inputSignature=''
    const onMemory=()=>{
      const next=Object.entries(session.getSnapshot()).filter(([,e])=>e.draft&&e.revision>e.savedRevision&&isDraftDirty(e.draft)).map(([id,e])=>`${id}:${e.revision}`).join('|')
      if(next&&next!==inputSignature)scheduler.input()
      inputSignature=next
    }
    const unsubscribe=session.subscribe(onMemory)
    // Initialize/validate IndexedDB before subscribing or starting automatic network work.
    void Promise.all([import('dexie'),import('@/features/local-drafts/draftDatabase')]).then(async([{liveQuery},{draftRepository:repo,draftDatabase:db}])=>{
      await repo.workspaceSyncSnapshot()
      if(disposed)return
      subscription=liveQuery(()=>db.transaction('r',[db.outbox,db.creationOutbox],async()=>[...await db.outbox.toArray(),...await db.creationOutbox.toArray()])).subscribe({next:ops=>{
        if(disposed)return
        setCount({value:ops.length,error:false})
        const next=ops.filter(o=>o.status!=='conflict').map(o=>o.operationId).sort().join('|')
        if(queueSignature===undefined){queueSignature=next;scheduler.request('startup')}
        else if(next!==queueSignature){queueSignature=next;scheduler.queueChanged(!!next)}
      },error:()=>{if(!disposed){setCount({error:true});setError('로컬 작업을 읽지 못해 자동 전송을 중단했습니다.');setServerState('error')}}})
    }).catch(()=>{if(!disposed){setCount({error:true});setError('로컬 복구를 확인하지 못해 자동 전송을 중단했습니다.');setServerState('error')}})
    const focus=()=>{if(document.visibilityState!=='hidden')scheduler.request('focus')}
    const reconnect=()=>scheduler.request('online'),offline=()=>scheduler.offline()
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus)
    window.addEventListener('online',reconnect);window.addEventListener('offline',offline)
    return()=>{disposed=true;scheduler.dispose();if(runner.current===scheduler)runner.current=null;unsubscribe();subscription?.unsubscribe();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);window.removeEventListener('online',reconnect);window.removeEventListener('offline',offline)}
  },[session,client])
  const previousSelection=useRef(selectedId)
  useEffect(()=>{if(previousSelection.current!==selectedId){previousSelection.current=selectedId;runner.current?.request('selection')}},[selectedId])
  const disabled=!online||busy||count.error||count.value===undefined
  const onSaveShortcut=useEffectEvent((event:KeyboardEvent)=>{
    if(event.defaultPrevented||event.isComposing||event.altKey||event.shiftKey||!(event.metaKey||event.ctrlKey)||!(event.key.toLowerCase()==='s'||event.code==='KeyS'))return
    event.preventDefault()
    if(event.repeat||disabled||document.querySelector('[role="dialog"][aria-modal="true"]'))return
    runner.current?.request('manual')
  })
  useEffect(()=>{const listener=(event:KeyboardEvent)=>onSaveShortcut(event);window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener)},[])
  const localIssue=Object.values(entries).some(e=>e.phase==='failed'||e.phase==='conflict')
  const memoryPending=Object.values(entries).some(e=>!!e.draft&&e.revision!==e.savedRevision)
  const stateLabel=!online?'오프라인':busy?'서버 동기화 중':serverState==='error'?'서버 연결 또는 저장 확인 필요':serverState==='review'||localIssue?'충돌 / 확인 필요':memoryPending||!!count.value?'서버 동기화 대기':serverState==='synced'?'모든 변경사항 동기화 완료':'서버 상태 확인 중'
  // Existing return fields remain available to the current header/UI contract.
  void workspace
  return {busy,disabled,summary:stateLabel,message:stateLabel,error,details:[],stateLabel,result,onSync:()=>runner.current?.request('manual')}
}
