import type { DraftSession } from '@/features/local-drafts/draftSession'
import type { CreationOperation } from '@/features/outbox/creationModel'
import type { Note } from '@/lib/api/types'
import { creationStorage } from '@/features/outbox/creationStorage'
import { syncLocalFolder, syncLocalNote } from './creationSync'
import { withSyncLock } from './syncLock'

interface Dependencies {
  list: () => Promise<CreationOperation[]>
  chain: typeof creationStorage.chain
  folder: typeof syncLocalFolder
  note: typeof syncLocalNote
  online: () => boolean
  lock: <T>(action:()=>Promise<T>)=>Promise<T>
  onNote?: (note:Note)=>void
}
/** Creation-only pass. Never calls syncOneNote and never drains NOTE_UPDATE. */
export async function syncCreations(session:DraftSession,overrides:Partial<Dependencies>={}) {
  const deps:Dependencies={list:creationStorage.list,chain:creationStorage.chain,folder:syncLocalFolder,note:syncLocalNote,
    online:()=>navigator.onLine!==false,lock:withSyncLock,...overrides}
  return deps.lock(async()=>{
    const all=await deps.list(),operations=all.filter(op=>op.status!=='conflict'),failed=new Set<string>()
    let completed=0,error=all.some(op=>op.status==='conflict')?'폴더 또는 원고 생성 충돌을 확인해주세요. 로컬 항목은 유지됩니다.':'',retryable=false
    for(const op of operations){
      if(!deps.online())break
      let chain:CreationOperation[]=[]
      try{
        chain=await deps.chain(op.entityId)
        if(!chain.length||chain.some(item=>failed.has(item.entityId)))continue
        if(chain.some(item=>item.status==='conflict')){
          failed.add(op.entityId);error='폴더 또는 원고 생성에 충돌이 있어 서버 반영을 보류했습니다. 로컬 항목은 유지됩니다.';continue
        }
        if(op.type==='FOLDER_CREATE')await deps.folder(op.entityId,{lockHeld:true})
        else{
          await session.readyForSync(op.entityId)
          const note=await deps.note(op.entityId,session,deps.online,{lockHeld:true})
          if(note)deps.onNote?.(note)
        }
        completed++
      }catch{
        for(const item of chain)failed.add(item.entityId)
        failed.add(op.entityId);retryable=true
        error='새 폴더·원고의 서버 반영을 기다리고 있습니다. 로컬 항목을 유지하며 연결 후 다시 시도합니다.'
      }
    }
    return {completed,error,retryable,more:false}
  })
}
