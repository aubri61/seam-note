import { useEffect, useMemo, useRef } from 'react'
import { useTheme } from '@emotion/react'
import styled from '@emotion/styled'
import { Tree } from 'react-arborist'
import type { CursorProps, NodeRendererProps, TreeApi } from 'react-arborist'
import { Icon } from '@/components/Icon'
import { buildTree, matchesSearch } from '@/features/folders/folderModel'
import type { FolderItem, FolderTreeNode } from '@/features/folders/folderModel'

const Frame = styled.div(({ theme }) => ({
  marginTop: theme.spacing.md,
  '> p': { padding: theme.spacing.md, color: theme.colors.mutedText, fontSize: '12px' },
  '[role="tree"]:focus-visible': { outlineOffset: 0 },
  '[role="treeitem"]:focus-visible': { outlineOffset: '-2px', borderRadius: theme.radii.sm },
}))
const Row = styled.div<{ selected: boolean; dropping: boolean }>(({ theme, selected, dropping }) => ({
  display: 'flex', alignItems: 'center', gap: theme.spacing.sm,
  height: '100%', paddingRight: theme.spacing.sm, borderRadius: theme.radii.sm,
  background: dropping ? theme.colors.accent : selected ? theme.colors.selected : 'transparent',
  color: selected ? theme.colors.text : theme.colors.mutedText,
  fontSize: '12px', cursor: 'pointer',
  transition: `background ${theme.motion.duration[100]} ${theme.motion.easing.standard}`,
  '&:hover': { background: selected ? theme.colors.selected : theme.colors.background },
  '> span': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  input: { minWidth: 0, width: '100%', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radii.sm, background: theme.colors.surface, padding: theme.spacing.xs },
}))
const Chevron = styled.span(({ theme }) => ({
  display: 'flex', flex: '0 0 13px',
  transition: `transform ${theme.motion.duration[200]} ${theme.motion.easing.standard}`,
  '&[data-open="true"]': { transform: 'rotate(90deg)' },
}))

const DropLine = styled.div(({ theme }) => ({
  position: 'absolute', right: 0, height: '2px',
  pointerEvents: 'none', zIndex: 1,
  background: theme.colors.border, borderRadius: theme.radii.pill,
  '&::before': {
    content: '""', position: 'absolute', left: '-2px', top: '-1px',
    width: '4px', height: '4px', borderRadius: theme.radii.pill,
    background: theme.colors.border,
  },
}))

function DropCursor({ top, left, indent }: CursorProps) {
  return <DropLine aria-hidden="true" style={{ top: top - 1, left, right: indent }} />
}

function Node({ node, style, dragHandle, tree }: NodeRendererProps<FolderTreeNode>) {
  const theme = useTheme()
  const expandOnHover = node.isInternal && !node.isOpen && node.willReceiveDrop

  useEffect(() => {
    if (!expandOnHover) return
    const timer = window.setTimeout(() => tree.open(node.id), Number.parseInt(theme.motion.duration[200], 10))
    return () => window.clearTimeout(timer)
  }, [expandOnHover, node.id, tree, theme.motion.duration])

  return (
    <Row
      ref={dragHandle}
      style={style}
      selected={node.isSelected}
      dropping={node.willReceiveDrop}
      title={node.data.name}
      onClick={event => {
        node.handleClick(event)
        if (node.isInternal) node.toggle()
      }}
    >
      <Chevron data-open={node.isOpen}>{node.isInternal && <Icon name="chevron" size={13} />}</Chevron>
      <Icon name={node.isInternal ? 'folder' : 'note'} size={16} />
      {node.isEditing ? (
        <input
          autoFocus aria-label="이름 변경" defaultValue={node.data.title}
          onClick={event => event.stopPropagation()}
          onFocus={event => event.currentTarget.select()}
          onBlur={() => node.reset()}
          onKeyDown={event => {
            event.stopPropagation()
            if (event.key === 'Enter') node.submit(event.currentTarget.value.trim() || (node.isInternal ? '새 폴더' : '제목 없는 문서'))
            if (event.key === 'Escape') node.reset()
          }}
        />
      ) : <span>{node.data.name}</span>}
    </Row>
  )
}

interface FolderTreeProps {
  items: FolderItem[]
  selectedId: string
  createdId: string | null
  movedId: string | null
  search: string
  openFolders: Record<string, boolean>
  onFolderOpen: (id: string, open: boolean) => void
  onSelectionHandled: () => void
  onSelect: (id: string) => void
  onTreeSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onMove: (ids: string[], parentId: string | null, index: number) => void
}

export function FolderTree({ items, selectedId, createdId, movedId, search, openFolders, onFolderOpen, onSelectionHandled, onSelect, onTreeSelect, onRename, onMove }: FolderTreeProps) {
  const treeRef = useRef<TreeApi<FolderTreeNode>>(null)
  const data = useMemo(() => buildTree(items), [items])

  useEffect(() => {
    const id = createdId ?? movedId
    if (!id) return
    const tree = treeRef.current
    tree?.openParents(id)
    // Opening ancestors rebuilds Arborist's visible-node index on the next render.
    // Select/edit only after the new row is visible, rather than reselecting its parent.
    const frame = window.requestAnimationFrame(() => {
      const rename = !!createdId && tree?.get(id)?.isInternal
      tree?.select(id, { focus: !!rename || !!movedId })
      if (rename) void tree?.edit(id)
      onSelectionHandled()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [createdId, movedId, onSelectionHandled])

  return (
    <Frame onKeyDownCapture={event => {
      if ((event.target as HTMLElement).tagName === 'INPUT') return
      const focused = treeRef.current?.focusedNode
      if (!focused || (event.key !== 'Enter' && event.key !== 'F2')) return
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'F2') void focused.edit()
      else if (focused.isInternal) focused.toggle()
      else focused.activate()
    }}>
      <Tree<FolderTreeNode>
        ref={treeRef} data={data} width="100%" height={Math.min(480, Math.max(160, items.length * 40))}
        rowHeight={40} indent={20} padding={2} openByDefault={false}
        renderCursor={DropCursor}
        initialOpenState={openFolders} selection={selectedId}
        disableMultiSelection disableDeselectOnClick
        searchTerm={search.trim()}
        searchMatch={(node, term) => matchesSearch(node.data, term)}
        disableDrag={!!search.trim()}
        disableDrop={({ parentNode }) => !!search.trim() || (!parentNode.isRoot && parentNode.isLeaf)}
        onToggle={id => { if (!search.trim()) onFolderOpen(id, treeRef.current?.isOpen(id) ?? false) }}
        onActivate={node => { if (node.isLeaf) onSelect(node.id) }}
        onSelect={nodes => { if (!createdId && !movedId && nodes[0]) onTreeSelect(nodes[0].id) }}
        onRename={({ id, name }) => onRename(id, name)}
        onMove={({ dragIds, parentId, index }) => onMove(dragIds, parentId, index)}
        aria-label="폴더와 문서"
      >{Node}</Tree>
      {search.trim() && !items.some(item => matchesSearch(item, search)) && <p role="status">검색 결과가 없습니다.</p>}
    </Frame>
  )
}
