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
        const known=await repo.conflictNotes(),map=new Map(known.filter(o=>o.hasDraft).map(o=>[o.noteId,o.code??'OTHER_CONFLICT']))
        const orphanIds=new Set(known.filter(o=>!o.hasDraft).map(o=>o.noteId))
        for(const [id,entry] of Object.entries(session.getSnapshot()))if(entry.phase==='conflict'&&entry.draft&&!orphanIds.has(id))map.set(id,'LOCAL_DRAFT_CONFLICT')
        if(active&&request===sequence){setItems([...map].map(([noteId,code])=>({noteId,code})));setError(known.some(o=>!o.hasDraft)?'로컬 원고 없이 남은 충돌 작업이 있습니다. 복구 모달을 열지 않고 기존 작업을 보존했습니다.':'')}
      }catch{if(active&&request===sequence)setError('충돌 목록을 읽지 못했습니다. 기존 원고와 작업을 보존합니다.')}
    }
    void read();window.addEventListener('focus',read);document.addEventListener('visibilitychange',read);window.addEventListener('seam-note:workspace-deleted',read)
    return()=>{active=false;window.removeEventListener('focus',read);document.removeEventListener('visibilitychange',read);window.removeEventListener('seam-note:workspace-deleted',read)}
  },[session,signature,busy,refresh])
  return {items,error}
}
