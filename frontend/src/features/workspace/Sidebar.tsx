import { useRef } from 'react'
import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'
import { Eyebrow, IconButton } from '@/components/primitives'
import { previewNotes, selectedPreviewNote } from '@/features/notes/notes'
import { FolderSection } from '@/features/workspace/FolderSection'

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

const WorkspacePicker = styled.details(({ theme }) => ({
  position: 'relative',
  marginBottom: theme.spacing.md,
  '> summary': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: '64px',
    padding: theme.spacing.md,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    background: theme.colors.surface,
    cursor: 'pointer',
    listStyle: 'none',
    transition: `background ${theme.motion.duration[100]} ${theme.motion.easing.standard}`,
  },
  '> summary::-webkit-details-marker': {
    display: 'none',
  },
  '> summary:hover': {
    background: theme.colors.selected,
  },
  '> summary > div': {
    flex: 1,
    minWidth: 0,
  },
  strong: {
    display: 'block',
    marginTop: theme.spacing.xs,
    fontSize: '13px',
    fontWeight: 550,
  },
  '&[open] > summary': {
    background: theme.colors.selected,
  },
}))

const WorkspaceAvatar = styled.span(({ theme }) => ({
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
  width: '30px',
  height: '32px',
  borderRadius: theme.radii.sm,
  background: theme.colors.accent,
  fontSize: '13px',
  fontWeight: 600,
}))

const Dropdown = styled.div(({ theme }) => ({
  position: 'absolute',
  zIndex: 5,
  top: `calc(100% + ${theme.spacing.sm})`,
  left: 0,
  width: '100%',
  padding: `${theme.spacing.md} ${theme.spacing.sm} ${theme.spacing.sm}`,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.md,
  background: theme.colors.surface,
  boxShadow: '0 8px 28px rgba(36, 35, 32, .1)',
  h2: {
    padding: `0 ${theme.spacing.sm} ${theme.spacing.md}`,
    fontSize: '12px',
    fontWeight: 500,
    color: theme.colors.mutedText,
  },
  p: {
    padding: `${theme.spacing.sm} ${theme.spacing.sm} ${theme.spacing.xs}`,
    fontSize: '10px',
    color: theme.colors.mutedText,
    lineHeight: 1.6,
  },
}))

const WorkspaceOption = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.sm,
  padding: theme.spacing.sm,
  borderRadius: theme.radii.sm,
  background: theme.colors.selected,
  fontSize: '13px',
  '> span:nth-of-type(2)': {
    flex: 1,
  },
}))

const Search = styled.label(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.sm,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  marginBottom: theme.spacing.lg,
  color: theme.colors.mutedText,
  input: {
    width: '100%',
    minWidth: 0,
    padding: 0,
    border: 0,
    background: 'transparent',
    fontSize: '13px',
  },
  'input::placeholder': {
    color: theme.colors.mutedText,
  },
}))

const FolderTree = styled.nav(({ theme }) => ({
  ul: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  '> ul': {
    marginTop: theme.spacing.md,
  },

}))

const FolderLabel = styled(Eyebrow)(({ theme }) => ({
  paddingLeft: theme.spacing.md,
}))

const NoteRow = styled.div<{ selected?: boolean }>(({ theme, selected }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.sm,
  minHeight: '38px',
  margin: `${theme.spacing.xxs} 0`,
  padding: theme.spacing.sm,
  borderRadius: theme.radii.sm,
  background: selected ? theme.colors.selected : 'transparent',
  fontSize: '12px',
  color: selected ? theme.colors.text : theme.colors.mutedText,
  span: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
}))

const Footnote = styled.p(({ theme }) => ({
  marginTop: 'auto',
  padding: `${theme.spacing.xl} ${theme.spacing.md} 0`,
  fontSize: '10px',
  lineHeight: 1.8,
  color: theme.colors.mutedText,
}))

export interface SidebarNavigationState {
  notes: boolean
  work: boolean
  journal: boolean
}

export function Sidebar({ onClose, expandedFolders, onToggleFolder }: {
  onClose: () => void
  expandedFolders: SidebarNavigationState
  onToggleFolder: (folder: keyof SidebarNavigationState) => void
}) {
  const pickerRef = useRef<HTMLDetailsElement>(null)
  const summaryRef = useRef<HTMLElement>(null)

  return (
    <Panel aria-label="Workspace sidebar">
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

      <WorkspacePicker
        ref={pickerRef}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
        }}
        onKeyDown={event => {
          if (event.key === 'Escape' && event.currentTarget.open) {
            event.preventDefault()
            event.currentTarget.open = false
            summaryRef.current?.focus()
          }
        }}
      >
        <summary ref={summaryRef} aria-label="워크스페이스 선택: Personal">
          <WorkspaceAvatar>P</WorkspaceAvatar>
          <div><Eyebrow>워크스페이스</Eyebrow><strong>Personal</strong></div>
          <Icon name="chevrons" size={16} />
        </summary>
        <Dropdown>
          <h2>워크스페이스</h2>
          <WorkspaceOption aria-label="Personal — 현재 워크스페이스">
            <WorkspaceAvatar>P</WorkspaceAvatar><span>Personal</span><Icon name="check" size={16} />
          </WorkspaceOption>
          <p>현재 워크스페이스 · 전환 기능은 준비 중입니다.</p>
        </Dropdown>
      </WorkspacePicker>

      <Search>
        <Icon name="search" size={17} />
        <input aria-label="Search notes (preview only)" placeholder="Search notes" readOnly type="search" />
      </Search>

      <FolderTree aria-label="폴더와 노트">
        <FolderLabel>폴더</FolderLabel>
        <ul>
          <li>
            <FolderSection label="My notes" open={expandedFolders.notes} onToggle={() => onToggleFolder('notes')}>
              <ul>
                {previewNotes.map(note => (
                  <li key={note.id}>
                    <NoteRow selected={note.id === selectedPreviewNote.id} aria-current={note.id === selectedPreviewNote.id ? 'page' : undefined} title={note.title}>
                      <Icon name="note" size={16} /><span>{note.title}</span>
                    </NoteRow>
                  </li>
                ))}
              </ul>
            </FolderSection>
          </li>
          <li>
            <FolderSection label="Work" open={expandedFolders.work} onToggle={() => onToggleFolder('work')}>
              <ul><li><NoteRow><Icon name="note" size={16} /><span>Project ideas</span></NoteRow></li></ul>
            </FolderSection>
          </li>
          <li>
            <FolderSection label="Journal" open={expandedFolders.journal} onToggle={() => onToggleFolder('journal')}>
              <ul><li><NoteRow><Icon name="note" size={16} /><span>October reflections</span></NoteRow></li></ul>
            </FolderSection>
          </li>
        </ul>
      </FolderTree>
      <Footnote>A little room for everything on your mind.<br />UI preview · Sample notes only.</Footnote>
    </Panel>
  )
}
