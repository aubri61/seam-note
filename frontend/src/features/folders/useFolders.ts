import { useEffect, useMemo, useRef, useState } from 'react'
import { readFolderExpansion, writeFolderExpansion } from './folderExpansion'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'
import { missingNoteError, notePath, resolveNoteRoute } from '@/app/routing/noteRoutes'
import { ApiError } from '@/lib/api/client'
import { useQueryClient } from '@tanstack/react-query'
import { useWorkspaceTreeQuery } from '@/features/workspace/workspaceQueries'
import { buildWorkspaceTree, firstNoteId, noteAncestors } from '@/features/workspace/workspaceTree'
import { useNoteQuery } from '@/features/notes/noteQueries'
import { selectedNoteDetail } from '@/features/notes/notePresentation'
import type { CreateFolderRequest, Folder, WorkspaceTreeResponse } from '@/lib/api/types'
import { workspaceKeys } from '@/lib/query/queryKeys'
import { folderPath, nextNoteAfterDeletion, creationParent } from '@/features/workspace/workspaceActions'
import { useDeleteFolderMutation, useDeleteNoteMutation, useRenameFolderMutation } from '@/features/workspace/workspaceMutations'
import { useLocalFolderCreation, useLocalNoteCreation } from '@/features/workspace/localCreations'


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
  // A naming row is a UI preview; it is persisted only after confirmation.
  const [pendingFolder, setPendingFolder] = useState<Folder | null>(null)
  const workspace = useWorkspaceTreeQuery()
  const tree = useMemo(() => {
    const data = workspace.data ?? emptyWorkspace
    return buildWorkspaceTree(pendingFolder && !data.folders.some(folder => folder.id === pendingFolder.id)
      ? { ...data, folders: [...data.folders, pendingFolder] } : data)
  }, [workspace.data, pendingFolder])
  const selectedNoteId = route.noteId
  const selectedFolderId = selection.navigationKey === location.key && selection.folderId && tree.folders.has(selection.folderId) ? selection.folderId : null
  const creationParentId = creationParent(tree, selectedFolderId ? { kind: 'folder', id: selectedFolderId } : null, selectedNoteId)
  const missingFromWorkspace = !!workspace.data && !workspace.data.localSnapshot?.cachedAt && !!selectedNoteId && !tree.notes.has(selectedNoteId)
  const localIds=workspace.data?.localIds??[]
  const localNote=!!selectedNoteId&&localIds.includes(selectedNoteId)
  const noteQuery = useNoteQuery(route.error || missingFromWorkspace || localNote ? null : selectedNoteId)
  const routeError = route.error ?? (missingFromWorkspace ? missingNoteError() : null)
  const detailError = noteQuery.error instanceof ApiError && noteQuery.error.status === 404 ? missingNoteError() : noteQuery.error
  const firstId = firstNoteId(tree)
  useEffect(() => {
    if (route.home && workspace.data && firstId) void navigate(notePath(firstId), { replace: true })
    else if (selectedNoteId && match?.params.noteId !== selectedNoteId) void navigate(notePath(selectedNoteId), { replace: true })
  }, [route.home, workspace.data, firstId, selectedNoteId, match?.params.noteId, navigate])
  const [search, setSearch] = useState('')
  const [savedExpansion, setSavedExpansion] = useState(readFolderExpansion)
  const ancestors = useMemo(() => noteAncestors(tree, selectedNoteId), [tree, selectedNoteId])
  // null means no valid preference; {} deliberately means all folders collapsed.
  const openFolders = useMemo(() => savedExpansion ?? Object.fromEntries(
    ancestors.map(folder => [folder.id, true]),
  ), [ancestors, savedExpansion])
  useEffect(() => {
    if (savedExpansion !== null) writeFolderExpansion(savedExpansion)
  }, [savedExpansion])

  // URL navigation clears folder selection, but never overrides the user's tree preference.
  if (selection.navigationKey !== location.key) {
    setSelection({ navigationKey: location.key, folderId: null })
  }

  function revealFolder(id: string) {
    const current = buildWorkspaceTree(client.getQueryData<WorkspaceTreeResponse>(workspaceKeys.tree()) ?? emptyWorkspace)
    setSavedExpansion(old => ({ ...openFolders, ...old, ...Object.fromEntries(folderPath(current, id).map(folder => [folder, true])) }))
    setSearch('')
  }
  const createFolderMutation = useLocalFolderCreation(folder => {
    setSelection({ navigationKey: location.key, folderId: folder.id })
    setEditingFolderId(null)
    setPendingFolder(null)
    revealFolder(folder.id)
  })
  const createNoteMutation = useLocalNoteCreation(note => {
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
  const deleteFolderMutation = useDeleteFolderMutation(id => {
    setSelection(current => current.folderId === id ? { ...current, folderId: null } : current)
    setSavedExpansion(current => current === null ? null : Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)))
  })
  const renameFolderMutation = useRenameFolderMutation()
  const busy = renameFolderMutation.isPending || createFolderMutation.isPending || createNoteMutation.isPending || deleteNoteMutation.isPending || deleteFolderMutation.isPending

  function resetMutationErrors() {
    renameFolderMutation.reset()
    createFolderMutation.reset()
    createNoteMutation.reset()
    deleteNoteMutation.reset()
    deleteFolderMutation.reset()
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
  }

  return {
    workspace, tree, localIds, localNote, selectedNoteId, selectedFolderId, creationParentId, noteQuery, routeError, detailError,
    editingFolderId, pendingFolder, cancelFolderName: () => { setEditingFolderId(null); setPendingFolder(null); resetMutationErrors() },
    beginFolderCreation: (root = false, parentOverride?: string) => {
      if (busy || pendingFolder || !workspace.data) return
      resetMutationErrors()
      const parentId = root ? null : parentOverride ?? creationParentId
      const siblings = workspace.data.folders.filter(folder => folder.parentId === parentId)
      const folder: Folder = { id: crypto.randomUUID(), parentId, name: '새 폴더',
        sortOrder: Math.max(-1, ...siblings.map(item => item.sortOrder)) + 1, version: 0,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      setPendingFolder(folder)
      setEditingFolderId(folder.id)
      setSearch('')
      if (parentId) revealFolder(parentId)
    },
    renameFolderMutation,
    renameCreatedFolder: async (id: string, name: string) => {
      if (pendingFolder?.id === id) {
        return perform(() => createFolderMutation.mutateAsync({ id, parentId: pendingFolder.parentId, name }))
      }
      if (tree.folders.get(id)?.folder.name === name) { setEditingFolderId(null); return true }
      const success = await perform(() => renameFolderMutation.mutateAsync({ id, name }))
      if (success) setEditingFolderId(null)
      return success
    },
    selectFolder: (id: string) => setSelection({ navigationKey: location.key, folderId: id }),
    busy, createFolderMutation, createNoteMutation, deleteNoteMutation, deleteFolderMutation, resetMutationErrors,
    createFolder: (request: CreateFolderRequest) => perform(() => createFolderMutation.mutateAsync(request)),
    createEmptyNote: (folderId: string, id?: string) => perform(() => createNoteMutation.mutateAsync({ id: id ?? crypto.randomUUID(), folderId, title: '', content: '' })),
    deleteFolder: (id: string) => perform(() => deleteFolderMutation.mutateAsync(id)),
    deleteNote: (id: string) => perform(() => deleteNoteMutation.mutateAsync(id)),
    activeNote: routeError || !workspace.data ? null : selectedNoteDetail(selectedNoteId, noteQuery.data),
    ancestors, search, setSearch, openFolders, select,
    setFolderOpen: (id: string, open: boolean) => setSavedExpansion(current => ({ ...openFolders, ...current, [id]: open })),
  }
}
