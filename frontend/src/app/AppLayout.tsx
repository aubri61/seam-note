import { Link, Outlet } from 'react-router-dom'
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
import { notePath } from '@/app/routing/noteRoutes'
import { useConnectivity } from '@/features/offline/useConnectivity'
import { PwaStatus } from '@/features/pwa/PwaStatus'
import { useManualSync } from '@/features/manual-sync/useManualSync'
import { localDraftStatus } from '@/features/local-drafts/localDraftStatus'
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
  const online = useConnectivity()
  const folders = useFolders()
  const drafts = useNoteDrafts(folders.selectedNoteId, folders.activeNote)
  const editorLoading = !folders.routeError && (folders.workspace.isPending || !!folders.selectedNoteId && folders.noteQuery.isFetching)
  const queryError = folders.routeError ?? (!folders.workspace.data ? folders.workspace.error : null) ?? folders.detailError
  const offlineDetail = !online || folders.detailError instanceof ApiError && (folders.detailError.status === 0 || folders.detailError.status >= 500)
  const editorError = offlineDetail && drafts.draft && !folders.routeError && folders.workspace.data ? null : queryError
  const serverAvailable = online && !folders.workspace.data?.localSnapshot?.cachedAt
  const manualSync = useManualSync(folders.selectedNoteId, drafts.session, drafts.entry,
    online && !!folders.selectedNoteId && folders.tree.notes.has(folders.selectedNoteId)
      && folders.activeNote?.id === folders.selectedNoteId && !editorError && !editorLoading && !folders.busy)
  const status = localDraftStatus(drafts.entry, drafts.recovering, editorLoading, editorError)
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
    if (!serverAvailable || folders.busy || !folders.workspace.data) return
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
    if (!serverAvailable) return
    if (folders.createFolderMutation.isError && folders.createFolderMutation.variables) {
      await folders.createFolder(folders.createFolderMutation.variables)
    } else if (folders.createNoteMutation.isError && folders.createNoteMutation.variables) {
      const request = folders.createNoteMutation.variables
      if (await folders.createEmptyNote(request.folderId, request.id ?? undefined)) showCreatedNote()
    }
  }
  function openDeleteNote() {
    if (!serverAvailable || folders.busy || !folders.selectedNoteId) return
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
            <button type="button" disabled={folders.busy || !serverAvailable} onClick={() => void retryCreation()}>같은 요청 다시 시도</button>
          </>}
        </div>

  const sidebar = <Sidebar onClose={closeSidebar} folders={{ ...folders, busy: folders.busy || !serverAvailable, renameCreatedFolder: serverAvailable ? folders.renameCreatedFolder : async () => null }} draftTitles={drafts.draftTitles} onSelectNote={selectNote}
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
          manualSync={manualSync}
          path={folders.ancestors.map(item => item.name)}
        />
        <PwaStatus />
        {(!online || folders.workspace.data?.localSnapshot) && <aside role="status" style={{ padding: '8px 24px', fontSize: 12 }}>
          {!online ? '오프라인 편집 · 변경사항은 이 브라우저에 로컬 저장됩니다.' : '서버 목록을 확인하지 못해 로컬 목록을 사용합니다.'}
          <p>{folders.workspace.data?.localSnapshot?.warning ?? '이 브라우저에 본문이 로컬 저장된 원고만 열 수 있습니다.'}</p>
          <p>서버 저장·생성·삭제는 온라인에서만 가능합니다. 브라우저 저장소 삭제·회수 시 로컬 데이터가 사라질 수 있습니다.</p>
          {online && <button type="button" onClick={() => { void folders.workspace.refetch(); void folders.noteQuery.refetch() }}>서버 목록 다시 확인</button>}
        </aside>}
        {!drafts.recovering && !drafts.draft && offlineDetail && <p role="alert" style={{ padding: '8px 24px' }}>이 원고의 본문은 이 브라우저에 저장되어 있지 않아 오프라인에서 열 수 없습니다. 온라인에서 먼저 열어주세요.</p>}
        {(!isMobile || !sidebarOpen) && creationFeedback}
        {drafts.backgroundIssues.map(id => <div key={id} role="alert" style={{ padding: '8px 24px', fontSize: 13 }}>
          <p>다른 원고의 로컬 저장을 완료하지 못했습니다. 입력은 메모리에 유지됩니다.</p>
          <Link to={notePath(id)}>저장 실패 원고 확인</Link>
        </div>)}
        <Outlet context={{
          draft: drafts.draft, onEdit: drafts.edit,
          localEntry: drafts.entry, onRetryLocal: drafts.retryLocal,
          selectedNoteId: folders.selectedNoteId, titleRef,
          loading: editorLoading || drafts.recovering, error: editorError,
          canRetry: !folders.routeError || !!folders.selectedNoteId,
          busy: folders.busy, canCreate: serverAvailable && !!folders.workspace.data,
          canDelete: serverAvailable && !!folders.selectedNoteId && folders.tree.notes.has(folders.selectedNoteId) && !folders.routeError,
          onCreateNote: openCreateNote, onDeleteNote: openDeleteNote,
          onRetry: () => { void (folders.routeError || folders.workspace.isError ? folders.workspace.refetch() : folders.noteQuery.refetch()) },
        } satisfies ComponentProps<typeof NoteEditor>} />
      </EditorArea>
      {folders.busy && <div role="status" style={{ position: 'fixed', bottom: 16, left: 24 }}>요청을 처리하는 중입니다.</div>}
      {action && <WorkspaceActionDialog key={action.kind} action={action} folders={folders} onClose={() => setAction(null)} />}
    </Shell>
  )
}
