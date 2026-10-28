import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { DraftSession } from '@/features/local-drafts/draftSession'
import type { Note } from '@/lib/api/types'
import { noteKeys, workspaceKeys } from '@/lib/query/queryKeys'
import { syncCreations } from './autoCreationSync'

/** Online startup, creation commits and reconnect wake only the creation queue.
 * A bounded backoff avoids hammering an unavailable API or another tab's lock. */
export function useAutoCreationSync(session:DraftSession,online:boolean) {
  const client=useQueryClient(),[error,setError]=useState('')
  useEffect(()=>{
    if(!online)return
    let disposed=false,running=false,wanted=false,failures=0,timer:ReturnType<typeof setTimeout>|undefined
    let subscription:{unsubscribe:()=>void}|undefined
    const backoff=[1000,3000,10000,30000]
    const schedule=(delay=0)=>{
      wanted=true
      if(disposed||running||timer)return
      timer=setTimeout(()=>{timer=undefined;void run()},delay)
    }
    const run=async()=>{
      if(disposed||navigator.onLine===false)return
      running=true;wanted=false
      try{
        const result=await syncCreations(session,{onNote:note=>{
          client.setQueryData<Note>(noteKeys.detail(note.id),current=>current&&current.version>note.version?current:note)
        }})
        if(disposed)return
        setError(result.error)
        if(result.completed)void client.invalidateQueries({queryKey:workspaceKeys.tree()})
        if(result.retryable){
          wanted=false
          if(failures<backoff.length){const delay=backoff[failures++];timer=setTimeout(()=>{timer=undefined;void run()},delay)}
        }else{failures=0;if(result.more)wanted=true}
      }catch{
        if(!disposed){
          setError('생성 항목은 로컬에 보관되어 있습니다. 서버 연결 또는 다른 탭의 저장 완료를 기다립니다.')
          wanted=false
          if(failures<backoff.length){const delay=backoff[failures++];timer=setTimeout(()=>{timer=undefined;void run()},delay)}
        }
      }finally{running=false;if(wanted&&!disposed&&!timer)schedule()}
    }
    // Dexie's existing cross-tab observation observes actual committed queue records.
    void Promise.all([import('dexie'),import('@/features/local-drafts/draftDatabase')]).then(async([{liveQuery},{draftRepository,draftDatabase}])=>{
      // Open/validate first. The observed callback must issue the Dexie query
      // directly; async schema-probing outside the observation zone loses dependencies.
      await draftRepository.listCreations()
      if(disposed)return
      let signature=''
      subscription=liveQuery(()=>draftDatabase.creationOutbox.toArray()).subscribe({next:operations=>{
        const next=JSON.stringify(operations)
        if(signature!==next){signature=next;schedule()}
      },error:()=>{if(!disposed)setError('생성 작업을 읽지 못했습니다. 로컬 항목을 보존했습니다.')}})
    }).catch(()=>{if(!disposed)setError('생성 저장소를 열지 못했습니다. 로컬 항목을 보존했습니다.')})
    return()=>{disposed=true;if(timer)clearTimeout(timer);subscription?.unsubscribe()}
  },[session,online,client])
  return online?error:''
}
