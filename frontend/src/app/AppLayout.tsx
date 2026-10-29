import { Link, Outlet, useNavigate } from 'react-router-dom'
import type { ComponentProps } from 'react'
import { lazy, Suspense, useEffect, useEffectEvent, useRef, useState } from 'react'
import { useConflictList } from '@/features/conflicts/useConflictList'
import { useTheme } from '@emotion/react'
import styled from '@emotion/styled'
import { AppHeader } from '@/app/AppHeader'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Sidebar } from '@/app/sidebar/Sidebar'
import type { FolderAction } from '@/features/folders/FolderMenu'
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
import { useAutoCreationSync } from '@/features/manual-sync/useAutoCreationSync'
import { useWorkspaceSync } from '@/features/manual-sync/useWorkspaceSync'
import { localDraftStatus } from '@/features/local-drafts/localDraftStatus'
import type { NoteEditor } from '@/features/notes/NoteEditor'

const ManualSyncDelayPanel = import.meta.env.DEV && import.meta.env.VITE_SYNC_DELAY_NOTE_ID
  ? lazy(() => import('../dev/ManualSyncDelayPanel')) : null

const ConflictDialog=lazy(()=>import('@/features/conflicts/ConflictDialog'))

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
  const navigate=useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.tablet})`)
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile)
  const [previousMode, setPreviousMode] = useState(isMobile)
  const previousFocusMode = useRef(isMobile)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const online = useConnectivity()
  const folders = useFolders()
  const drafts = useNoteDrafts(folders.selectedNoteId, folders.activeNote)
  const creationSyncError=useAutoCreationSync(drafts.session,online)
  const editorLoading = !folders.routeError && (folders.workspace.isPending || !!folders.selectedNoteId && folders.noteQuery.isFetching)
  const queryError = folders.routeError ?? (!folders.workspace.data ? folders.workspace.error : null) ?? folders.detailError
  const offlineDetail = !online || folders.detailError instanceof ApiError && (folders.detailError.status === 0 || folders.detailError.status >= 500)
  const editorError = offlineDetail && drafts.draft && !folders.routeError && folders.workspace.data ? null : queryError
  const serverAvailable = online && !folders.workspace.data?.localSnapshot?.cachedAt
  const workspaceSync = useWorkspaceSync(drafts.session, online, folders.workspace.data)
  const [conflictNoteId,setConflictNoteId]=useState<string|null>(null),[conflictRefresh,setConflictRefresh]=useState(0)
  const conflicts=useConflictList(drafts.session,workspaceSync.busy,conflictRefresh)
  const [resolvedConflicts,setResolvedConflicts]=useState<string[]>([])
  const activeResolved=resolvedConflicts.filter(id=>conflicts.items.some(item=>item.noteId===id))
  if(activeResolved.length!==resolvedConflicts.length)setResolvedConflicts(activeResolved)
  const pendingConflicts=conflicts.items.filter(item=>!resolvedConflicts.includes(item.noteId))
  const conflictSignature=conflicts.items.map(item=>`${item.noteId}:${item.code}`).sort().join('|')
  const [observedConflicts,setObservedConflicts]=useState({signature:'',selected:folders.selectedNoteId,busy:workspaceSync.busy})
  // Adjust this component's presentation before committing a new conflict banner.
  // Closing the dialog alone does not reopen it; a new conflict/selection can.
  if(observedConflicts.signature!==conflictSignature||observedConflicts.selected!==folders.selectedNoteId||observedConflicts.busy!==workspaceSync.busy){
    setObservedConflicts({signature:conflictSignature,selected:folders.selectedNoteId,busy:workspaceSync.busy})
    if(!workspaceSync.busy&&!conflictNoteId&&pendingConflicts.length){
      const next=pendingConflicts.find(item=>item.noteId===folders.selectedNoteId)??pendingConflicts[0]
      setConflictNoteId(next.noteId)
    }
  }
  const status = folders.localNote && drafts.entry?.phase === 'saved' ? '로컬 저장됨 · 서버 미동기화' : localDraftStatus(drafts.entry, drafts.recovering, editorLoading, editorError)
  const [action, setAction] = useState<WorkspaceAction | null>(null)
  const [creationMessage, setCreationMessage] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const pendingEditorFocus = useRef(false)
  const createDocumentGate = useRef(false)
  const pendingCreatedFocus = useRef<{noteId:string;reached:boolean}|null>(null)
  const [createdFocusRequest,setCreatedFocusRequest] = useState<string|null>(null)
  const sidebarId = 'folders-sidebar'
  const onSidebarShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey
      || !(event.metaKey || event.ctrlKey) || !(event.key === '\\' || event.code === 'Backslash')) return
    event.preventDefault()
    event.stopPropagation()
    if (event.repeat || Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).some(dialog => dialog.id !== sidebarId)) return
    // Closing the desktop sidebar must not leave focus inside its inert subtree.
    // Radix restores mobile drawer focus through onCloseAutoFocus.
    if (sidebarOpen && !isMobile && document.getElementById(sidebarId)?.contains(document.activeElement)) toggleRef.current?.focus()
    setSidebarOpen(open => !open)
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onSidebarShortcut(event)
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [])

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

  useEffect(() => {
    const request = pendingCreatedFocus.current
    if (!request || request.noteId !== createdFocusRequest) return
    if (isMobile || request.reached && folders.selectedNoteId !== request.noteId) {
      pendingCreatedFocus.current = null
      return
    }
    if (folders.selectedNoteId !== request.noteId) return
    request.reached = true
    if (drafts.draft?.noteId === request.noteId && !drafts.recovering && titleRef.current && !titleRef.current.readOnly) {
      titleRef.current.focus()
      pendingCreatedFocus.current = null
    }
  }, [createdFocusRequest, folders.selectedNoteId, drafts.draft?.noteId, drafts.recovering, isMobile])

  function closeSidebar() {
    setSidebarOpen(false)
    // Modal focus restoration belongs to Radix's onCloseAutoFocus.
    if (!isMobile) toggleRef.current?.focus()
  }

  function selectNote(id: string) {
    pendingCreatedFocus.current = null
    folders.select(id)
    if (isMobile) {
      pendingEditorFocus.current = true
      setSidebarOpen(false)
    }
  }

  function showCreatedNote(noteId: string) {
    if (isMobile) return
    pendingCreatedFocus.current = {noteId,reached:false}
    setCreatedFocusRequest(noteId)
  }
  function create(kind: 'folder' | 'root-folder' | 'document') {
    if (folders.busy || folders.pendingFolder) return
    setCreationMessage('')
    if (kind === 'folder' || kind === 'root-folder') {
      folders.beginFolderCreation(kind === 'root-folder')
    } else {
      void createDocument()
    }
  }
  async function createDocument() {
    if (createDocumentGate.current || !folders.workspace.data) return
    createDocumentGate.current = true
    try {
      // Keep the selected destination; otherwise use the first root in existing display order.
      let parentId = folders.creationParentId ?? folders.tree.roots[0]?.folder.id
      if (!parentId) {
        parentId = crypto.randomUUID()
        if (!await folders.createFolder({id:parentId,parentId:null,name:'새 폴더'})) return
      }
      const createdId = await folders.createEmptyNote(parentId)
      if (createdId) showCreatedNote(createdId)
    } finally { createDocumentGate.current = false }
  }
  function folderAction(id: string, kind: FolderAction) {
    if (folders.busy || folders.pendingFolder) return
    const folder = folders.tree.folders.get(id)?.folder
    if (!folder) return
    setCreationMessage('')
    if (kind === 'add-folder') folders.beginFolderCreation(false, id)
    else if (kind === 'rename') folders.beginFolderRename(id)
    else if (kind === 'add-note') {
      void folders.createEmptyNote(id).then(success => { if (success) showCreatedNote(success) })
    } else {
      folders.resetMutationErrors()
      setAction({ kind: 'delete-folder', folder })
    }
  }
  function openCreateNote() { create('document') }
  const creationError = folders.createFolderMutation.error ?? folders.createNoteMutation.error
  async function retryCreation() {
    if (folders.createFolderMutation.isError && folders.createFolderMutation.variables) {
      await folders.createFolder(folders.createFolderMutation.variables)
    } else if (folders.createNoteMutation.isError && folders.createNoteMutation.variables) {
      const request = folders.createNoteMutation.variables
      const createdId = await folders.createEmptyNote(request.folderId, request.id ?? undefined)
      if (createdId) showCreatedNote(createdId)
    }
  }
  function openDeleteNote(id=folders.selectedNoteId) {
    if (!serverAvailable || folders.busy || !id||folders.localIds.includes(id)) return
    const node = folders.tree.notes.get(id)
    if (!node) return
    folders.resetMutationErrors()
    setAction({ kind: 'delete-note', note: {...node.note,title:drafts.draftTitles[id]??node.note.title} })
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

  const sidebar = <Sidebar onClose={closeSidebar} folders={folders} draftTitles={drafts.draftTitles} onSelectNote={selectNote}
    onCreate={create} onFolderAction={folderAction} onDeleteNote={openDeleteNote} canDeleteNote={id=>serverAvailable&&!folders.localIds.includes(id)} creationFeedback={isMobile ? creationFeedback : undefined} />

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
          online={online}
          sidebarOpen={sidebarOpen}
          isMobile={isMobile}
          sidebarId={sidebarId}
          onToggleSidebar={() => setSidebarOpen(open => !open)}
          toggleRef={toggleRef}
          status={status}
          workspaceSync={workspaceSync}
          hasConflict={conflicts.items.length>0}
          canDelete={serverAvailable&&!folders.busy&&!!folders.selectedNoteId&&!folders.localNote&&!folders.routeError&&folders.tree.notes.has(folders.selectedNoteId)} onDelete={()=>openDeleteNote()}
          path={folders.ancestors.map(item => item.name)}
        />
        <PwaStatus />
        {ManualSyncDelayPanel && <Suspense fallback={null}><ManualSyncDelayPanel noteId={folders.selectedNoteId}/></Suspense>}
        {creationSyncError&&<p role="alert" style={{padding:'8px 24px',fontSize:13}}>{creationSyncError}</p>}
        {conflicts.error&&<p role="alert">{conflicts.error}</p>}
        {(!online || folders.workspace.data?.localSnapshot && folders.workspace.data.localSnapshot.reason !== 'local-refresh') && <aside role="status" style={{ padding: '8px 24px', fontSize: 12 }}>
          {!online ? '오프라인 편집 · 변경사항은 이 브라우저에 로컬 저장됩니다.' : '저장된 로컬 목록을 표시합니다. 서버 변경사항을 아직 확인하지 못했습니다.'}
          <p>{folders.workspace.data?.localSnapshot?.warning ?? '이 브라우저에 본문이 로컬 저장된 원고만 열 수 있습니다.'}</p>
          <p>서버 반영·삭제는 온라인에서만 가능합니다. 생성과 원고 편집은 오프라인에서도 가능합니다. 브라우저 저장소 삭제·회수 시 로컬 데이터가 사라질 수 있습니다.</p>
        </aside>}
        {!drafts.recovering && !drafts.draft && offlineDetail && <p role="alert" style={{ padding: '8px 24px' }}>이 원고의 본문은 이 브라우저에 저장되어 있지 않아 오프라인에서 열 수 없습니다. 온라인에서 먼저 열어주세요.</p>}
        {(!isMobile || !sidebarOpen) && creationFeedback}
        {drafts.backgroundIssues.filter(id=>!conflicts.items.some(item=>item.noteId===id)).map(id => <div key={id} role="alert" style={{ padding: '8px 24px', fontSize: 13 }}>
          <p>다른 원고의 로컬 저장을 완료하지 못했습니다. 입력은 메모리에 유지됩니다.</p>
          <Link to={notePath(id)}>저장 실패 원고 확인</Link>
        </div>)}
        <Outlet context={{
          draft: drafts.draft, onEdit: drafts.edit,
          localEntry: drafts.entry, onRetryLocal: drafts.retryLocal, onCompareConflict:()=>{if(folders.selectedNoteId)setConflictNoteId(folders.selectedNoteId)},
          selectedNoteId: folders.selectedNoteId, titleRef,
          loading: editorLoading || drafts.recovering, error: editorError,
          canRetry: !folders.routeError || !!folders.selectedNoteId,
          busy: folders.busy, canCreate: true,
          canDelete: serverAvailable && !folders.localNote && !!folders.selectedNoteId && folders.tree.notes.has(folders.selectedNoteId) && !folders.routeError,
          onCreateNote: openCreateNote, onDeleteNote: ()=>openDeleteNote(),
          onRetry: () => { void (folders.routeError || folders.workspace.isError ? folders.workspace.refetch() : folders.noteQuery.refetch()) },
        } satisfies ComponentProps<typeof NoteEditor>} />
      </EditorArea>
      {conflictNoteId&&<Suspense fallback={<p role="status">원고 비교 화면 준비 중</p>}><ConflictDialog key={conflictNoteId} id={conflictNoteId} session={drafts.session}
        folders={[...folders.tree.folders.values()].map(node=>node.folder)} initialFolderId={folders.tree.notes.get(conflictNoteId)?.note.folderId??''}
        onClose={()=>setConflictNoteId(null)} onResolved={newId=>{
          if(conflictNoteId)setResolvedConflicts(ids=>[...ids,conflictNoteId])
          setConflictNoteId(null);setConflictRefresh(value=>value+1)
          void folders.workspace.refetch()
          if(newId)void navigate(notePath(newId))
        }}/></Suspense>}
      {folders.busy && <div role="status" style={{ position: 'fixed', bottom: 16, left: 24 }}>요청을 처리하는 중입니다.</div>}
      {action && <WorkspaceActionDialog key={action.kind} action={action} folders={folders} onClose={() => setAction(null)} />}
    </Shell>
  )
}
