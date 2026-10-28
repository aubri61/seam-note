import type { CreateFolderRequest, CreateNoteRequest, Note, Folder } from '@/lib/api/types'
import type { CreationOperation } from './creationModel'
// Serialize child creation against manual creation/deletion across tabs.
async function withCreationLock<T>(action: () => Promise<T>) {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('seam-note:creation-sync', action)
  return action()
}
const repository=async()=>(await import('@/features/local-drafts/draftDatabase')).draftRepository
export const creationStorage={
  list:async()=>(await repository()).listCreations(),
  createFolder:async(r:CreateFolderRequest)=>withCreationLock(async () => (await repository()).createLocalFolder(r)),
  createNote:async(r:CreateNoteRequest)=>withCreationLock(async () => (await repository()).createLocalNote(r)),
  local:async(id:string)=>(await repository()).localEntity(id),
  view:async()=>(await repository()).localWorkspace(),
  chain:async(id:string)=>(await repository()).creationChain(id),
  claim:async(id:string, allowedOperationIds?: readonly string[])=>(await repository()).claimCreation(id, allowedOperationIds),
  conflict:async(id:string, failureCode?: string)=>(await repository()).conflictCreation(id, failureCode),
  ackFolder:async(op:CreationOperation,response:Folder)=>(await repository()).ackFolderCreation(op,response),
  ackNote:async(op:CreationOperation,response:Note,token:string,revision:number,writerId:string)=>(await repository()).ackNoteCreation(op,response,token,revision,writerId),
}
