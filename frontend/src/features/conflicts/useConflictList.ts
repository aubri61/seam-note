import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DraftSession } from '@/features/local-drafts/draftSession'
export function useConflictList(session:DraftSession,busy:boolean,refresh:number) {
  const entries=useSyncExternalStore(session.subscribe,session.getSnapshot)
  // Normal typing/save phases must not reload conflict payloads. Local conflict membership is sufficient.
  const signature=Object.entries(entries).filter(([,entry])=>entry.phase==='conflict').map(([id])=>id).sort().join('|')
  const [items,setItems]=useState<{noteId:string;code:string}[]>([]),[error,setError]=useState('')
  useEffect(()=>{
    let active=true,sequence=0
    const read=async()=>{
      const request=++sequence
      try {
        const repo=(await import('@/features/local-drafts/draftDatabase')).draftRepository
        const known=await repo.conflictNotes(),map=new Map(known.map(o=>[o.noteId,o.code??'OTHER_CONFLICT']))
        for(const [id,entry] of Object.entries(session.getSnapshot()))if(entry.phase==='conflict')map.set(id,'LOCAL_DRAFT_CONFLICT')
        if(active&&request===sequence){setItems([...map].map(([noteId,code])=>({noteId,code})));setError('')}
      }catch{if(active&&request===sequence)setError('충돌 목록을 읽지 못했습니다. 기존 원고와 작업을 보존합니다.')}
    }
    void read();window.addEventListener('focus',read);document.addEventListener('visibilitychange',read)
    return()=>{active=false;window.removeEventListener('focus',read);document.removeEventListener('visibilitychange',read)}
  },[session,signature,busy,refresh])
  return {items,error}
}
