import { FolderCreationSave } from '@/features/manual-sync/FolderCreationSave'
import { useRef } from 'react'
import type { ReactNode } from 'react'
import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'
import { WorkspacePicker } from '@/features/workspaces/WorkspacePicker'
import { Eyebrow, IconButton } from '@/components/primitives'
import type { FolderAction } from '@/features/folders/FolderMenu'
import { FolderTree } from '@/features/folders/FolderTree'
import type { useFolders } from '@/features/folders/useFolders'

const Panel = styled.aside(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100%',
  height: '100%',
  padding: `${theme.spacing.lg} ${theme.spacing.md} ${theme.spacing.md}`,
  borderRight: `1px solid ${theme.colors.border}`,
  background: theme.colors.sidebar,
}))

const Brand = styled.header(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: theme.spacing.sm,
  padding: `0 ${theme.spacing.xxs} ${theme.spacing.lg}`,
  img: {
    flexShrink: 0,
    width: '42px',
    height: '42px',
    objectFit: 'contain',
  },
  div: {
    flex: 1,
    minWidth: 0,
    paddingTop: theme.spacing.xs,
  },
  h1: {
    fontSize: '21px',
    fontWeight: 650,
    letterSpacing: '-.7px',
  },
  p: {
    marginTop: theme.spacing.sm,
    fontSize: '11px',
    lineHeight: 1.7,
    color: theme.colors.mutedText,
  },
  button: {
    width: '30px',
    height: '32px',
    flexShrink: 0,
  },
}))

const Search = styled.label(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.sm,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  marginBottom: theme.spacing.lg,
  border: 0,
  borderRadius: theme.radii.pill,
  transition: `border-color ${theme.motion.duration[100]} ${theme.motion.easing.standard}, background ${theme.motion.duration[100]} ${theme.motion.easing.standard}`,
  '&:hover, &:focus-within': { background: theme.colors.surface },
  '&:focus-within': { outline: 'none' },
  color: theme.colors.mutedText,
  input: {
    width: '100%',
    minWidth: 0,
    padding: 0,
    border: 0,
    background: 'transparent',
    fontSize: '13px',
  },
  'input:focus-visible': { outline: 'none' },
  'input::placeholder': {
    color: theme.colors.mutedText,
  },
}))

const FolderHeading = styled.div(({ theme }) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: theme.spacing.md,
}))

const CreatePicker = styled.details(({ theme }) => ({
  position: 'relative',
  '> summary': {
    display: 'grid', placeItems: 'center', width: '32px', height: '32px',
    borderRadius: theme.radii.sm, listStyle: 'none', cursor: 'pointer',
    transition: `background ${theme.motion.duration[100]} ${theme.motion.easing.standard}`,
  },
  '> summary:hover, &[open] > summary': { background: theme.colors.selected },
  '> summary::-webkit-details-marker': { display: 'none' },
  '> div': {
    position: 'absolute', right: 0, top: `calc(100% + ${theme.spacing.xs})`, zIndex: 5,
    width: '160px', padding: theme.spacing.sm, border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md, background: theme.colors.surface, boxShadow: theme.shadow,
  },
  button: {
    display: 'flex', alignItems: 'center', gap: theme.spacing.md, width: '100%',
    padding: `${theme.spacing.sm} ${theme.spacing.md}`, minHeight: '40px', border: 0,
    borderRadius: theme.radii.sm, background: 'transparent', textAlign: 'left', fontSize: '13px',
    '&:hover': { background: theme.colors.selected },
  },
}))


const Footnote = styled.p(({ theme }) => ({
  marginTop: 'auto',
  padding: `${theme.spacing.xl} ${theme.spacing.md} 0`,
  fontSize: '10px',
  lineHeight: 1.8,
  color: theme.colors.mutedText,
}))

export function Sidebar({ onClose, folders, draftTitles, onSelectNote, onCreate, onFolderAction, creationFeedback }: {
  onClose: () => void
  folders: ReturnType<typeof useFolders>
  draftTitles: Readonly<Partial<Record<string, string>>>
  onSelectNote: (id: string) => void
  onCreate: (kind: 'folder' | 'root-folder' | 'document') => void
  onFolderAction: (id: string, action: FolderAction) => void
  creationFeedback?: ReactNode
}) {
  const createRef = useRef<HTMLDetailsElement>(null)

  return (
    <Panel aria-label="폴더 사이드바">
      <Brand>
        <img src="/seam-note-icon.png" alt="" width={42} height={42} />
        <div>
          <h1>seam note</h1>
          <p>당신의 생각이 끊기지 않도록</p>
        </div>
        <IconButton type="button" aria-label="사이드바 닫기" title="사이드바 접기" onClick={onClose}>
          <Icon name="collapse" size={17} />
        </IconButton>
      </Brand>

      <WorkspacePicker />

      <Search>
        <Icon name="search" size={17} />
        <input aria-label="노트 검색" placeholder="Search notes" value={folders.search} onChange={event => folders.setSearch(event.target.value)} type="search" />
      </Search>

      <nav aria-label="폴더 탐색">
        <FolderHeading>
          <Eyebrow>폴더</Eyebrow>
          <CreatePicker ref={createRef}
            onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false }}
            onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() } }}>
            <summary aria-label="폴더 또는 문서 추가"><Icon name="plus" size={17} /></summary>
            <div aria-label="추가할 항목">
              <button type="button" disabled={folders.busy || !!folders.pendingFolder || !folders.workspace.data} onClick={() => { if (createRef.current) createRef.current.open = false; onCreate('folder') }}><Icon name="folder" size={17} />새 폴더</button>
              <button type="button" disabled={folders.busy || !!folders.pendingFolder || !folders.workspace.data} onClick={() => { if (createRef.current) createRef.current.open = false; onCreate('root-folder') }}><Icon name="folder" size={17} />새 최상위 폴더</button>
              <button type="button" disabled={folders.busy || !!folders.pendingFolder || !folders.workspace.data} onClick={() => { if (createRef.current) createRef.current.open = false; onCreate('document') }}><Icon name="note" size={17} />새 문서</button>
            </div>
          </CreatePicker>
        </FolderHeading>
        <FolderCreationSave id={folders.selectedFolderId} pending={!!folders.selectedFolderId && folders.localIds.includes(folders.selectedFolderId)} />
        {creationFeedback}
        {folders.workspace.isPending && <p role="status">폴더와 원고를 불러오는 중입니다.</p>}
        {folders.workspace.isError && <div role="alert">
          <p>{folders.workspace.data ? '목록 갱신에 실패했습니다' : '목록을 불러오지 못했습니다'}: {folders.workspace.error.message}</p>
          <button type="button" onClick={() => void folders.workspace.refetch()}>다시 시도</button>
        </div>}
        {folders.workspace.data && <FolderTree
          actionsBusy={folders.busy || !!folders.pendingFolder} onFolderAction={onFolderAction}
          tree={folders.tree} localIds={folders.localIds} draftTitles={draftTitles} selectedNoteId={folders.selectedNoteId}
          creatingFolderId={folders.pendingFolder?.id ?? null} editingFolderId={folders.editingFolderId} onFolderName={folders.renameCreatedFolder}
          onCancelFolderName={folders.cancelFolderName} namingBusy={folders.busy} namingError={(folders.pendingFolder ? folders.createFolderMutation.error : folders.renameFolderMutation.error)?.message}
          selectedFolderId={folders.selectedFolderId} onFolderSelect={folders.selectFolder} search={folders.search}
          openFolders={folders.openFolders} onFolderOpen={folders.setFolderOpen} onSelect={onSelectNote}
        />}
      </nav>
      <Footnote>A little room for everything on your mind.<br />로컬 저장과 서버 동기화는 별개입니다.</Footnote>
    </Panel>
  )
}
