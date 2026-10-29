import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import styled from '@emotion/styled'
import { Link } from 'react-router-dom'
import { notePath } from '@/app/routing/noteRoutes'
import { FolderMenu } from './FolderMenu'
import type { FolderAction } from './FolderMenu'
import { Icon } from '@/components/Icon'
import { nodeLabel, visibleWorkspaceRows } from '@/features/workspace/workspaceTree'
import type { WorkspaceTreeModel } from '@/features/workspace/workspaceTree'

const Frame = styled.div(({ theme }) => ({
  marginTop: theme.spacing.md, maxHeight: '480px', minHeight: '160px', overflowY: 'auto',
  '> p': { padding: theme.spacing.md, color: theme.colors.mutedText, fontSize: '12px' },
  '[role="tree"]:focus-visible': { outlineOffset: 0 },
  '[role="treeitem"]:focus-visible': { outlineOffset: '-2px', borderRadius: theme.radii.sm },
}))
const Row = styled.div<{ selected: boolean; to?: string }>(({ theme, selected }) => ({
  position:'relative',display: 'flex', alignItems: 'center', gap: theme.spacing.sm,
  height: '40px', width: '100%', border: 0, textAlign: 'left', paddingRight: theme.spacing.sm, borderRadius: theme.radii.sm,
  background: selected ? theme.colors.selected : 'transparent',
  color: selected ? theme.colors.text : theme.colors.mutedText,
  fontSize: '12px', cursor: 'pointer', textDecoration: 'none',
  transition: `background ${theme.motion.duration[100]} ${theme.motion.easing.standard}`,
  '&:hover': { background: selected ? theme.colors.selected : theme.colors.background },
  '> span': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  'input:focus, input:focus-visible': { border: 0, outline: 'none', boxShadow: 'none' },
  input: { minWidth: 0, width: '100%', border: 0, outline: 'none', boxShadow: 'none', borderRadius: theme.radii.sm, background: 'transparent', padding: theme.spacing.xs },
}))
const Chevron = styled.span(({ theme }) => ({
  display: 'flex', flex: '0 0 13px',
  transition: `transform ${theme.motion.duration[200]} ${theme.motion.easing.standard}`,
  '&[data-open="true"]': { transform: 'rotate(90deg)' },
}))


interface FolderTreeProps {
  localIds?: string[]
  actionsBusy: boolean
  onFolderAction: (id: string, action: FolderAction) => void
  onDeleteNote: (id:string)=>void
  canDeleteNote: (id:string)=>boolean
  tree: WorkspaceTreeModel
  draftTitles: Readonly<Partial<Record<string, string>>>
  selectedNoteId: string | null
  selectedFolderId: string | null
  creatingFolderId: string | null
  editingFolderId: string | null
  onFolderName: (id: string, name: string) => Promise<boolean | null>
  onCancelFolderName: () => void
  namingBusy: boolean
  namingError?: string
  onFolderSelect: (id: string) => void
  search: string
  openFolders: Record<string, boolean>
  onFolderOpen: (id: string, open: boolean) => void
  onSelect: (id: string) => void
}

export function FolderTree({ creatingFolderId, actionsBusy, onFolderAction, onDeleteNote, canDeleteNote, localIds = [], tree, draftTitles, selectedNoteId, selectedFolderId, onFolderSelect, search, openFolders, onFolderOpen, onSelect, editingFolderId, onFolderName, onCancelFolderName, namingBusy, namingError }: FolderTreeProps) {
  const rows = useMemo(() => visibleWorkspaceRows(tree, openFolders, search), [tree, openFolders, search])
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const selectedKey = selectedFolderId ? `folder:${selectedFolderId}` : selectedNoteId ? `note:${selectedNoteId}` : null
  const tabKey = rows.some(row => row.node.key === focusedKey) ? focusedKey
    : rows.some(row => row.node.key === selectedKey) ? selectedKey : rows[0]?.node.key

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-node-key]'))
    const index = buttons.findIndex(button => button === event.target)
    if (index < 0) return
    const row = rows[index]
    let target = index
    if (event.key === 'ArrowDown') target = Math.min(index + 1, rows.length - 1)
    else if (event.key === 'ArrowUp') target = Math.max(index - 1, 0)
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = rows.length - 1
    else if (event.key === 'ArrowRight' && row.node.kind === 'folder') {
      if (!openFolders[row.node.folder.id] && !search.trim()) onFolderOpen(row.node.folder.id, true)
      else if (rows[index + 1]?.parentKey === row.node.key) target = index + 1
    } else if (event.key === 'ArrowLeft') {
      if (row.node.kind === 'folder' && openFolders[row.node.folder.id] && !search.trim()) onFolderOpen(row.node.folder.id, false)
      else target = rows.findIndex(parent => parent.node.key === row.parentKey)
    } else return
    event.preventDefault()
    if (target >= 0) buttons[target]?.focus()
  }

  return (
    <Frame>
      {/* Tree selection and keyboard navigation preserve the original creation position. */}
      <div role="tree" aria-label="폴더와 문서" onKeyDown={navigate}>
        {rows.map(({ node, depth }) => {
          const folder = node.kind === 'folder'
          const label = folder ? nodeLabel(node) : (draftTitles[node.note.id] ?? node.note.title) || '제목 없음'
          const expanded = folder && (!!search.trim() || !!openFolders[node.folder.id])
          return <Row
            key={node.key} aria-label={label} role="treeitem" aria-level={depth + 1}
            tabIndex={node.key === tabKey ? 0 : -1} onFocus={() => setFocusedKey(node.key)}
            aria-selected={node.key === selectedKey}
            selected={node.key === selectedKey}
            style={{ paddingLeft: 2 + depth * 20, ...(folder && node.folder.id === editingFolderId ? { height: 'auto', minHeight: 40 } : {}) }} title={label}
            aria-expanded={folder ? expanded : undefined}
            aria-current={!folder && node.note.id === selectedNoteId ? 'page' : undefined}
            data-node-key={node.key}
            data-creation-target={folder && node.folder.id === selectedFolderId || undefined}
            onKeyDown={event => {
              if (event.target === event.currentTarget && event.shiftKey && event.key === 'F10') {
                event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>('[data-folder-menu]')?.click(); return
              }
              if (event.target === event.currentTarget && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault(); event.currentTarget.click()
              }
            }}
            onClick={event => {
              if (event.target instanceof HTMLElement && event.target.closest('input,button')) return
              if (!folder && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return
              if (folder) { onFolderSelect(node.folder.id); onFolderOpen(node.folder.id, !expanded) }
              else onSelect(node.note.id)
            }}
          >
            {!folder&&<Link to={notePath(node.note.id)} aria-label={label} tabIndex={-1} style={{position:'absolute',inset:0,zIndex:1,borderRadius:'inherit'}} onClick={event=>{
              event.stopPropagation()
              if(event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onSelect(node.note.id)}
            }}/>}
            <Chevron data-open={expanded}>{folder && <Icon name="chevron" size={13} />}</Chevron>
            <Icon name={folder ? 'folder' : 'note'} size={16} />
            {folder && node.folder.id === editingFolderId ? <FolderName key={node.folder.id} name={node.folder.name} creating={node.folder.id === creatingFolderId}
              busy={namingBusy} error={namingError} onSave={name => onFolderName(node.folder.id, name)} onCancel={onCancelFolderName} />
              : <span>{label}</span>}
            {localIds.includes(folder ? node.folder.id : node.note.id) && <small aria-label="서버 미반영" style={{fontSize:10,opacity:.7}}>로컬</small>}
            {folder && node.folder.id !== editingFolderId && <FolderMenu name={label} tabIndex={node.key === tabKey ? 0 : -1}
              disabled={actionsBusy} onAction={action => onFolderAction(node.folder.id, action)} />}
            {!folder&&<FolderMenu kind="note" name={label} tabIndex={node.key===tabKey?0:-1}
              disabled={actionsBusy||!canDeleteNote(node.note.id)} onAction={()=>onDeleteNote(node.note.id)}/>}
          </Row>
        })}
      </div>
      {!tree.roots.length && !tree.rootNotes.length && <p role="status">폴더가 없습니다.</p>}
      {!!(tree.roots.length+tree.rootNotes.length) && !rows.length && <p role="status">검색 결과가 없습니다.</p>}
      {!!tree.issues.length && <p role="status">일부 항목의 폴더 관계가 올바르지 않습니다.</p>}
    </Frame>
  )
}

function FolderName({ name, creating, busy, error, onSave, onCancel }: {
  name: string; creating: boolean; busy: boolean; error?: string
  onSave: (name: string) => Promise<boolean | null>; onCancel: () => void
}) {
  const [value, setValue] = useState(name)
  const [validation, setValidation] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const cancelled = useRef(false)
  useEffect(() => { input.current?.focus(); input.current?.select(); input.current?.scrollIntoView({ block: 'nearest' }) }, [])
  async function save() {
    if (busy || submitting.current || cancelled.current) return
    const next = value.trim()
    if (!next || next.length > 200) { setValidation('폴더 이름은 공백이 아닌 1~200자로 입력해주세요.'); return }
    setValidation('')
    submitting.current = true
    try { await onSave(next) } finally { submitting.current = false }
  }
  return <span style={{ flex: 1 }}>
    <input ref={input} aria-label={creating ? '새 폴더 이름' : '폴더 이름'} aria-invalid={!!(validation || error)} value={value} maxLength={200} readOnly={busy}
      onChange={event => setValue(event.target.value)} onBlur={() => void save()}
      onKeyDown={event => {
        event.stopPropagation()
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void save() }
        if (event.key === 'Escape' && !busy) { event.preventDefault(); cancelled.current = true; onCancel() }
      }} />
    {(validation || error) && <span role="alert" style={{ display: 'block', whiteSpace: 'normal', fontSize: 11 }}>{validation || error}</span>}
  </span>
}
