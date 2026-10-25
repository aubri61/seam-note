import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'
import { missingNoteError, notePath, resolveNoteRoute } from '@/app/routing/noteRoutes'
import { ApiError } from '@/lib/api/client'
import { useQueryClient } from '@tanstack/react-query'
import { useWorkspaceTreeQuery } from '@/features/workspace/workspaceQueries'
import { buildWorkspaceTree, firstNoteId, noteAncestors } from '@/features/workspace/workspaceTree'
import { useNoteQuery } from '@/features/notes/noteQueries'
import { selectedNoteDetail } from '@/features/notes/notePresentation'
import type { CreateFolderRequest, WorkspaceTreeResponse } from '@/lib/api/types'
import { workspaceKeys } from '@/lib/query/queryKeys'
import { folderPath, nextNoteAfterDeletion, creationParent } from '@/features/workspace/workspaceActions'
import { useCreateFolderMutation, useCreateNoteMutation, useDeleteNoteMutation, useRenameFolderMutation } from '@/features/workspace/workspaceMutations'

const emptyWorkspace: WorkspaceTreeResponse = { folders: [], notes: [] }

export function useFolders() {
  const client = useQueryClient()
  const location = useLocation()
  const match = useMatch('/notes/:noteId')
  const navigate = useNavigate()
  const route = resolveNoteRoute(location.pathname, match?.params.noteId)
  const writing = useRef(false)
  const [selection, setSelection] = useState<{ navigationKey: string; folderId: string | null }>({ navigationKey: location.key, folderId: null })
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const workspace = useWorkspaceTreeQuery()
  const tree = useMemo(() => buildWorkspaceTree(workspace.data ?? emptyWorkspace), [workspace.data])
  const selectedNoteId = route.noteId
  const selectedFolderId = selection.navigationKey === location.key && selection.folderId && tree.folders.has(selection.folderId) ? selection.folderId : null
  const creationParentId = creationParent(tree, selectedFolderId ? { kind: 'folder', id: selectedFolderId } : null, selectedNoteId)
  const missingFromWorkspace = !!workspace.data && !!selectedNoteId && !tree.notes.has(selectedNoteId)
  const noteQuery = useNoteQuery(route.error || missingFromWorkspace ? null : selectedNoteId)
  const routeError = route.error ?? (missingFromWorkspace ? missingNoteError() : null)
  const detailError = noteQuery.error instanceof ApiError && noteQuery.error.status === 404 ? missingNoteError() : noteQuery.error
  const firstId = firstNoteId(tree)
  useEffect(() => {
    if (route.home && workspace.data && firstId) void navigate(notePath(firstId), { replace: true })
    else if (selectedNoteId && match?.params.noteId !== selectedNoteId) void navigate(notePath(selectedNoteId), { replace: true })
  }, [route.home, workspace.data, firstId, selectedNoteId, match?.params.noteId, navigate])
  const [search, setSearch] = useState('')
  const [openOverrides, setOpenOverrides] = useState<Record<string, boolean>>({})
  const ancestors = useMemo(() => noteAncestors(tree, selectedNoteId), [tree, selectedNoteId])
  const openFolders = useMemo(() => ({
    ...Object.fromEntries(ancestors.map(folder => [folder.id, true])), ...openOverrides,
  }), [ancestors, openOverrides])

  // A route transition selects its Note, clearing only folder UI selection and
  // reopening the new ancestors. The Draft owner remains mounted above the Outlet.
  if (selection.navigationKey !== location.key) {
    setSelection({ navigationKey: location.key, folderId: null })
    setOpenOverrides(current => ({ ...current, ...Object.fromEntries(ancestors.map(folder => [folder.id, true])) }))
  }

  function revealFolder(id: string) {
    const current = buildWorkspaceTree(client.getQueryData<WorkspaceTreeResponse>(workspaceKeys.tree()) ?? emptyWorkspace)
    setOpenOverrides(old => ({ ...openFolders, ...old, ...Object.fromEntries(folderPath(current, id).map(folder => [folder, true])) }))
    setSearch('')
  }
  const createFolderMutation = useCreateFolderMutation(folder => {
    setSelection({ navigationKey: location.key, folderId: folder.id })
    setEditingFolderId(folder.id)
    revealFolder(folder.id)
  })
  const createNoteMutation = useCreateNoteMutation(note => {
    void navigate(notePath(note.id))
    revealFolder(note.folderId)
  })
  const deleteNoteMutation = useDeleteNoteMutation((id, before) => {
    const previous = buildWorkspaceTree(before ?? emptyWorkspace)
    const next = nextNoteAfterDeletion(previous, id)
    if (selectedNoteId === id) {
      if (next) revealFolder(previous.notes.get(next)!.note.folderId)
      void navigate(next ? notePath(next) : '/', { replace: true })
    }
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
    setSelection({ navigationKey: location.key, folderId: null })
    setOpenOverrides(current => ({ ...openFolders, ...current, ...Object.fromEntries(noteAncestors(tree, id).map(folder => [folder.id, true])) }))
  }

  return {
    workspace, tree, selectedNoteId, selectedFolderId, creationParentId, noteQuery, routeError, detailError,
    editingFolderId, cancelFolderName: () => setEditingFolderId(null),
    renameFolderMutation,
    renameCreatedFolder: async (id: string, name: string) => {
      const success = await perform(() => renameFolderMutation.mutateAsync({ id, name }))
      if (success) setEditingFolderId(null)
      return success
    },
    selectFolder: (id: string) => setSelection({ navigationKey: location.key, folderId: id }),
    busy, createFolderMutation, createNoteMutation, deleteNoteMutation, resetMutationErrors,
    createFolder: (request: CreateFolderRequest) => perform(() => createFolderMutation.mutateAsync(request)),
    createEmptyNote: (folderId: string, id?: string) => perform(() => createNoteMutation.mutateAsync({ id: id ?? crypto.randomUUID(), folderId, title: '', content: '' })),
    deleteNote: (id: string) => perform(() => deleteNoteMutation.mutateAsync(id)),
    activeNote: routeError || !workspace.data ? null : selectedNoteDetail(selectedNoteId, noteQuery.data),
    ancestors, search, setSearch, openFolders, select,
    setFolderOpen: (id: string, open: boolean) => setOpenOverrides(current => ({ ...current, [id]: open })),
  }
}
