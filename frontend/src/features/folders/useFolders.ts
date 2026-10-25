import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useWorkspaceTreeQuery } from '@/features/workspace/workspaceQueries'
import { buildWorkspaceTree, firstNoteId, noteAncestors } from '@/features/workspace/workspaceTree'
import { useNoteQuery } from '@/features/notes/noteQueries'
import { selectedNoteDetail } from '@/features/notes/notePresentation'
import type { CreateFolderRequest, WorkspaceTreeResponse } from '@/lib/api/types'
import { workspaceKeys } from '@/lib/query/queryKeys'
import type { TreeSelection } from '@/features/workspace/workspaceActions'
import { folderPath, nextNoteAfterDeletion, creationParent } from '@/features/workspace/workspaceActions'
import { useCreateFolderMutation, useCreateNoteMutation, useDeleteNoteMutation, useRenameFolderMutation } from '@/features/workspace/workspaceMutations'

const emptyWorkspace: WorkspaceTreeResponse = { folders: [], notes: [] }

export function useFolders() {
  const client = useQueryClient()
  const writing = useRef(false)
  const [selection, setSelection] = useState<TreeSelection | null>(null)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const workspace = useWorkspaceTreeQuery()
  const tree = useMemo(() => buildWorkspaceTree(workspace.data ?? emptyWorkspace), [workspace.data])
  const [requestedNoteId, setRequestedNoteId] = useState<string | null>(null)
  const selectedNoteId = requestedNoteId && tree.notes.has(requestedNoteId) ? requestedNoteId : firstNoteId(tree)
  const selectedFolderId = selection?.kind === 'folder' && tree.folders.has(selection.id) ? selection.id : null
  const creationParentId = creationParent(tree, selection, selectedNoteId)
  const noteQuery = useNoteQuery(selectedNoteId)
  const [search, setSearch] = useState('')
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({})
  const ancestors = useMemo(() => noteAncestors(tree, selectedNoteId), [tree, selectedNoteId])
  const openFolders = useMemo(() => ({
    ...Object.fromEntries(ancestors.map(folder => [folder.id, true])), ...openOverrides,
  }), [ancestors, openOverrides])

  function revealFolder(id: string) {
    const current = buildWorkspaceTree(client.getQueryData<WorkspaceTreeResponse>(workspaceKeys.tree()) ?? emptyWorkspace)
    setOpenOverrides(old => ({ ...openFolders, ...old, ...Object.fromEntries(folderPath(current, id).map(folder => [folder, true])) }))
    setSearch('')
  }
  const createFolderMutation = useCreateFolderMutation(folder => {
    setSelection({ kind: 'folder', id: folder.id })
    setEditingFolderId(folder.id)
    revealFolder(folder.id)
  })
  const createNoteMutation = useCreateNoteMutation(note => {
    setRequestedNoteId(note.id)
    setSelection({ kind: 'note', id: note.id })
    revealFolder(note.folderId)
  })
  const deleteNoteMutation = useDeleteNoteMutation((id, before) => {
    const previous = buildWorkspaceTree(before ?? emptyWorkspace)
    const next = nextNoteAfterDeletion(previous, id)
    if (selectedNoteId === id && next) revealFolder(previous.notes.get(next)!.note.folderId)
    setRequestedNoteId(current => {
      const active = current && previous.notes.has(current) ? current : firstNoteId(previous)
      return active === id ? next : current
    })
  })
  const renameFolderMutation = useRenameFolderMutation()
  const busy = renameFolderMutation.isPending || createFolderMutation.isPending || createNoteMutation.isPending || deleteNoteMutation.isPending

  function resetMutationErrors() {
    renameFolderMutation.reset()
    createFolderMutation.reset()
    createNoteMutation.reset()
    deleteNoteMutation.reset()
  }
  async function perform(action: () => Promise<unknown>): Promise<boolean | null> {
    // Synchronous guard covers duplicate events before React renders disabled buttons.
    if (writing.current) return null
    writing.current = true
    resetMutationErrors()
    try { await action(); return true }
    catch { return false } // Error remains available on the mutation; never pretend success.
    finally { writing.current = false }
  }

  function select(id: string) {
    if (!tree.notes.has(id)) return
    setRequestedNoteId(id)
    setSelection({ kind: 'note', id })
    setOpenOverrides(current => ({ ...openFolders, ...current, ...Object.fromEntries(noteAncestors(tree, id).map(folder => [folder.id, true])) }))
  }

  return {
    workspace, tree, selectedNoteId, selectedFolderId, creationParentId, noteQuery,
    editingFolderId, cancelFolderName: () => setEditingFolderId(null),
    renameFolderMutation,
    renameCreatedFolder: async (id: string, name: string) => {
      const success = await perform(() => renameFolderMutation.mutateAsync({ id, name }))
      if (success) setEditingFolderId(null)
      return success
    },
    selectFolder: (id: string) => setSelection({ kind: 'folder', id }),
    busy, createFolderMutation, createNoteMutation, deleteNoteMutation, resetMutationErrors,
    createFolder: (request: CreateFolderRequest) => perform(() => createFolderMutation.mutateAsync(request)),
    createEmptyNote: (folderId: string, id?: string) => perform(() => createNoteMutation.mutateAsync({ id: id ?? crypto.randomUUID(), folderId, title: '', content: '' })),
    deleteNote: (id: string) => perform(() => deleteNoteMutation.mutateAsync(id)),
    activeNote: selectedNoteDetail(selectedNoteId, noteQuery.data),
    ancestors, search, setSearch, openFolders, select,
    setFolderOpen: (id: string, open: boolean) => setOpenOverrides(current => ({ ...current, [id]: open })),
  }
}
