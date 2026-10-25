import { Outlet } from 'react-router-dom'
import type { ComponentProps } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@emotion/react'
import styled from '@emotion/styled'
import { AppHeader } from '@/app/AppHeader'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Sidebar } from '@/app/sidebar/Sidebar'
import { useFolders } from '@/features/folders/useFolders'
import { DesktopSidebar } from '@/app/sidebar/DesktopSidebar'
import { SidebarDrawer } from '@/app/sidebar/SidebarDrawer'
import { WorkspaceActionDialog } from '@/features/workspace/WorkspaceActionDialog'
import type { WorkspaceAction } from '@/features/workspace/WorkspaceActionDialog'
import { ApiError } from '@/lib/api/client'
import { useNoteDrafts } from '@/features/notes/useNoteDrafts'
import { draftStatus } from '@/features/notes/noteDrafts'
import type { NoteEditor } from '@/features/notes/NoteEditor'

const Shell = styled.div(({ theme }) => ({
  display: 'flex',
  width: `calc(100% - ${theme.spacing.xs})`,
  minHeight: `calc(100svh - ${theme.spacing.sm})`,
  margin: theme.spacing.xs,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.panel,
  overflow: 'clip',
  background: theme.colors.surface,
}))

const EditorArea = styled.main(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  minHeight: `calc(100svh - ${theme.spacing.xs} * 2 - 2px)`,
}))

export function AppLayout() {
  const theme = useTheme()
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.tablet})`)
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile)
  const [previousMode, setPreviousMode] = useState(isMobile)
  const previousFocusMode = useRef(isMobile)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const folders = useFolders()
  const drafts = useNoteDrafts(folders.selectedNoteId, folders.activeNote)
  const editorLoading = !folders.routeError && (folders.workspace.isPending || !!folders.selectedNoteId && folders.noteQuery.isFetching)
  const editorError = folders.routeError ?? (!folders.workspace.data ? folders.workspace.error : null) ?? folders.detailError
  const status = draftStatus(drafts.draft, editorLoading, editorError)
  const [action, setAction] = useState<WorkspaceAction | null>(null)
  const [creationMessage, setCreationMessage] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const pendingEditorFocus = useRef(false)
  const sidebarId = 'folders-sidebar'

  // Reset before rendering the new presentation so an open desktop sidebar
  // cannot briefly mount an open modal (or the reverse) during a breakpoint change.
  if (previousMode !== isMobile) {
    setPreviousMode(isMobile)
    setSidebarOpen(false)
  }

  useEffect(() => {
    if (previousFocusMode.current !== isMobile) {
      previousFocusMode.current = isMobile
      // Preserve editor focus; only repair focus lost with an unmounted sidebar.
      if (document.activeElement === document.body) toggleRef.current?.focus()
    }
  }, [isMobile])

  function closeSidebar() {
    setSidebarOpen(false)
    // Modal focus restoration belongs to Radix's onCloseAutoFocus.
    if (!isMobile) toggleRef.current?.focus()
  }

  function selectNote(id: string) {
    folders.select(id)
    if (isMobile) {
      pendingEditorFocus.current = true
      setSidebarOpen(false)
    }
  }

  function showCreatedNote() {
    if (isMobile) { pendingEditorFocus.current = true; setSidebarOpen(false) }
  }
  function create(kind: 'folder' | 'document') {
    if (folders.busy || !folders.workspace.data) return
    setCreationMessage('')
    if (kind === 'folder') {
      void folders.createFolder({ id: crypto.randomUUID(), parentId: folders.creationParentId, name: '새 폴더' })
    } else if (folders.creationParentId) {
      void folders.createEmptyNote(folders.creationParentId).then(success => { if (success) showCreatedNote() })
    } else {
      setCreationMessage('먼저 폴더를 만들거나 원고를 넣을 폴더를 선택해주세요.')
    }
  }
  function openCreateNote() { create('document') }
  const creationError = folders.createFolderMutation.error ?? folders.createNoteMutation.error
  async function retryCreation() {
    if (folders.createFolderMutation.isError && folders.createFolderMutation.variables) {
      await folders.createFolder(folders.createFolderMutation.variables)
    } else if (folders.createNoteMutation.isError && folders.createNoteMutation.variables) {
      const request = folders.createNoteMutation.variables
      if (await folders.createEmptyNote(request.folderId, request.id ?? undefined)) showCreatedNote()
    }
  }
  function openDeleteNote() {
    if (folders.busy || !folders.selectedNoteId) return
    const node = folders.tree.notes.get(folders.selectedNoteId)
    if (!node) return
    folders.resetMutationErrors()
    setAction({ kind: 'delete-note', note: node.note })
  }

  const creationFeedback = (creationMessage || creationError) && <div role="alert" style={{ padding: '8px 24px', fontSize: 13 }}>
          <p>{creationMessage || creationError?.message}</p>
          {creationError && <>
            {creationError instanceof ApiError && creationError.status === 0 && <p>서버에 반영됐지만 응답만 유실됐을 수 있습니다. 목록을 먼저 확인해주세요.</p>}
            {creationError instanceof ApiError && creationError.code === 'DUPLICATE_ENTITY_ID' && <p>이전 요청이 반영됐을 수 있습니다. 목록에서 확인해주세요.</p>}
            <button type="button" disabled={folders.busy} onClick={() => void folders.workspace.refetch()}>목록 새로고침</button>
            <button type="button" disabled={folders.busy} onClick={() => void retryCreation()}>같은 요청 다시 시도</button>
          </>}
        </div>

  const sidebar = <Sidebar onClose={closeSidebar} folders={folders} onSelectNote={selectNote}
    onCreate={create} creationFeedback={isMobile ? creationFeedback : undefined} />

  return (
    <Shell>
      {isMobile ? (
        <SidebarDrawer id={sidebarId} open={sidebarOpen} onOpenChange={setSidebarOpen} toggleRef={toggleRef} onAfterClose={() => {
          if (pendingEditorFocus.current) {
            pendingEditorFocus.current = false
            titleRef.current?.focus()
          }
        }}>
          {sidebar}
        </SidebarDrawer>
      ) : (
        <DesktopSidebar id={sidebarId} open={sidebarOpen}>{sidebar}</DesktopSidebar>
      )}
      <EditorArea aria-label="문서 편집 영역">
        <AppHeader
          sidebarOpen={sidebarOpen}
          isMobile={isMobile}
          sidebarId={sidebarId}
          onToggleSidebar={() => setSidebarOpen(open => !open)}
          toggleRef={toggleRef}
          status={status}
          path={folders.ancestors.map(item => item.name)}
        />
        {(!isMobile || !sidebarOpen) && creationFeedback}
        <Outlet context={{
          draft: folders.routeError ? null : drafts.draft, onEdit: drafts.edit,
          selectedNoteId: folders.selectedNoteId, titleRef,
          loading: editorLoading, error: editorError,
          canRetry: !folders.routeError || !!folders.selectedNoteId,
          busy: folders.busy, canCreate: !!folders.workspace.data,
          canDelete: !!folders.selectedNoteId && folders.tree.notes.has(folders.selectedNoteId) && !folders.routeError,
          onCreateNote: openCreateNote, onDeleteNote: openDeleteNote,
          onRetry: () => { void (folders.routeError || folders.workspace.isError ? folders.workspace.refetch() : folders.noteQuery.refetch()) },
        } satisfies ComponentProps<typeof NoteEditor>} />
      </EditorArea>
      {folders.busy && <div role="status" style={{ position: 'fixed', bottom: 16, left: 24 }}>요청을 처리하는 중입니다.</div>}
      {action && <WorkspaceActionDialog key={action.kind} action={action} folders={folders} onClose={() => setAction(null)} />}
    </Shell>
  )
}
