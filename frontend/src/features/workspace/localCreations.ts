import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateFolderRequest, CreateNoteRequest, Folder, Note } from '@/lib/api/types'
import { creationStorage } from '@/features/outbox/creationStorage'
import { loadWorkspace, workspaceStorage } from '@/features/offline/workspaceCache'
import { workspaceKeys } from '@/lib/query/queryKeys'

export function useLocalFolderCreation(onCreated:(folder:Folder)=>void){
  const client=useQueryClient()
  return useMutation({mutationKey:['local','folder-create'],networkMode:'always',retry:false,
    mutationFn:(r:CreateFolderRequest)=>creationStorage.createFolder(r),
    onSuccess:async folder=>{
      await client.cancelQueries({queryKey:workspaceKeys.tree()})
      client.setQueryData(workspaceKeys.tree(),await loadWorkspace({}, {online:()=>false,get:async()=>{throw Error('local only')},storage:workspaceStorage}))
      onCreated(folder)
    }})
}
export function useLocalNoteCreation(onCreated:(note:Note)=>void){
  const client=useQueryClient()
  return useMutation({mutationKey:['local','note-create'],networkMode:'always',retry:false,
    mutationFn:(r:CreateNoteRequest)=>creationStorage.createNote(r),
    onSuccess:async note=>{
      await client.cancelQueries({queryKey:workspaceKeys.tree()})
      client.setQueryData(workspaceKeys.tree(),await loadWorkspace({}, {online:()=>false,get:async()=>{throw Error('local only')},storage:workspaceStorage}))
      onCreated(note)
    }})
}
