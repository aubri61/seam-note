import { mutationOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { createFolder, renameFolder } from '@/features/folders/folderApi'
import { createNote, deleteNote } from '@/features/notes/noteApi'
import { folderKeys, noteKeys, workspaceKeys } from '@/lib/query/queryKeys'
import type { Folder, Note, UUID, WorkspaceTreeResponse } from '@/lib/api/types'

export function createFolderMutationOptions(client: QueryClient, onCreated?: (folder: Folder) => void) {
  return mutationOptions({
    mutationKey: ['folders', 'create'], mutationFn: createFolder, retry: false, networkMode: 'always',
    onSuccess: async (folder) => {
      await client.cancelQueries({ queryKey: workspaceKeys.tree(), exact: true })
      client.setQueryData<WorkspaceTreeResponse>(workspaceKeys.tree(), current => current ? {
        ...current, folders: [...current.folders.filter(item => item.id !== folder.id), folder],
      } : undefined)
      client.setQueryData(folderKeys.detail(folder.id), folder)
      onCreated?.(folder)
      void Promise.all([
        client.invalidateQueries({ queryKey: workspaceKeys.tree(), exact: true }),
        client.invalidateQueries({ queryKey: folder.parentId ? folderKeys.children(folder.parentId) : folderKeys.roots(), exact: true }),
      ])
    },
  })
}

export function createNoteMutationOptions(client: QueryClient, onCreated?: (note: Note) => void) {
  return mutationOptions({
    mutationKey: ['notes', 'create'], mutationFn: createNote, retry: false, networkMode: 'always',
    onSuccess: async (note) => {
      await client.cancelQueries({ queryKey: workspaceKeys.tree(), exact: true })
      const { id, folderId, title, sortOrder, version, updatedAt } = note
      client.setQueryData<WorkspaceTreeResponse>(workspaceKeys.tree(), current => current ? {
        ...current, notes: [...current.notes.filter(item => item.id !== id), { id, folderId, title, sortOrder, version, updatedAt }],
      } : undefined)
      client.setQueryData(noteKeys.detail(id), note)
      onCreated?.(note)
      void Promise.all([
        client.invalidateQueries({ queryKey: workspaceKeys.tree(), exact: true }),
        client.invalidateQueries({ queryKey: noteKeys.byFolder(folderId), exact: true }),
      ])
    },
  })
}

export function deleteNoteMutationOptions(client: QueryClient, onDeleted?: (id: UUID, before: WorkspaceTreeResponse | undefined) => void) {
  return mutationOptions({
    mutationKey: ['notes', 'delete'], mutationFn: deleteNote, retry: false, networkMode: 'always',
    onSuccess: async (_, id) => {
      await Promise.all([
        client.cancelQueries({ queryKey: workspaceKeys.tree(), exact: true }),
        client.cancelQueries({ queryKey: noteKeys.detail(id), exact: true }),
      ])
      const before = client.getQueryData<WorkspaceTreeResponse>(workspaceKeys.tree())
      client.setQueryData<WorkspaceTreeResponse>(workspaceKeys.tree(), current => current ? {
        ...current, notes: current.notes.filter(note => note.id !== id),
      } : undefined)
      onDeleted?.(id, before)
      client.removeQueries({ queryKey: noteKeys.detail(id), exact: true })
      void Promise.all([
        client.invalidateQueries({ queryKey: workspaceKeys.tree(), exact: true }),
        client.invalidateQueries({ queryKey: noteKeys.lists() }),
      ])
    },
  })
}

export function useCreateFolderMutation(onCreated: (folder: Folder) => void) {
  return useMutation(createFolderMutationOptions(useQueryClient(), onCreated))
}
export function useCreateNoteMutation(onCreated: (note: Note) => void) {
  return useMutation(createNoteMutationOptions(useQueryClient(), onCreated))
}
export function useDeleteNoteMutation(onDeleted: (id: UUID, before: WorkspaceTreeResponse | undefined) => void) {
  return useMutation(deleteNoteMutationOptions(useQueryClient(), onDeleted))
}

export function renameFolderMutationOptions(client: QueryClient) {
  return mutationOptions({
    mutationKey: ['folders', 'rename'], mutationFn: renameFolder, retry: false, networkMode: 'always',
    onSuccess: async folder => {
      await client.cancelQueries({ queryKey: workspaceKeys.tree(), exact: true })
      client.setQueryData<WorkspaceTreeResponse>(workspaceKeys.tree(), current => current ? {
        ...current, folders: current.folders.map(item => item.id === folder.id ? folder : item),
      } : undefined)
      client.setQueryData(folderKeys.detail(folder.id), folder)
      void Promise.all([
        client.invalidateQueries({ queryKey: workspaceKeys.tree(), exact: true }),
        client.invalidateQueries({ queryKey: folder.parentId ? folderKeys.children(folder.parentId) : folderKeys.roots(), exact: true }),
      ])
    },
  })
}
export function useRenameFolderMutation() {
  return useMutation(renameFolderMutationOptions(useQueryClient()))
}
