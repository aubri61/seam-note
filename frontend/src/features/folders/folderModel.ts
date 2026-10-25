export interface FolderItem {
  id: string
  parentId: string | null
  kind: 'folder' | 'document'
  title: string
  content: string
}

export interface FolderTreeNode extends FolderItem {
  name: string
  children?: FolderTreeNode[]
}

export function matchesSearch(item: FolderItem, query: string): boolean {
  return `${item.title || '제목 없는 문서'} ${item.content}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
}

export function buildTree(items: FolderItem[], parentId: string | null = null): FolderTreeNode[] {
  return items.filter(item => item.parentId === parentId).map(item => ({
    ...item,
    name: item.title || '제목 없는 문서',
    ...(item.kind === 'folder' ? { children: buildTree(items, item.id) } : {}),
  }))
}

export function getAncestors(items: FolderItem[], id: string): FolderItem[] {
  const ancestors: FolderItem[] = []
  let parentId = items.find(item => item.id === id)?.parentId
  const visited = new Set<string>([id])
  while (parentId) {
    if (visited.has(parentId)) break
    visited.add(parentId)
    const parent = items.find(item => item.id === parentId)
    if (!parent) break
    ancestors.unshift(parent)
    parentId = parent.parentId
  }
  return ancestors
}

/** Prefer the tree selection: create inside a folder or beside a selected document. */
export function getCreationParent(items: FolderItem[], selectedId: string, activeId = selectedId): string | null {
  const selected = items.find(item => item.id === selectedId) ?? items.find(item => item.id === activeId)
  return selected?.kind === 'folder' ? selected.id : selected?.parentId ?? null
}

/** Arborist indices include the dragged rows in their original sibling positions. */
export function moveItems(items: FolderItem[], dragIds: string[], parentId: string | null, index: number): FolderItem[] {
  const dragged = items.filter(item => dragIds.includes(item.id))
  if (!dragged.length) return items
  if (parentId !== null && items.find(item => item.id === parentId)?.kind !== 'folder') return items
  if (parentId && dragged.some(item => item.id === parentId || getAncestors(items, parentId).some(parent => parent.id === item.id))) return items
  // Never detach a descendant separately when its ancestor is part of the same move.
  if (dragged.some(item => getAncestors(items, item.id).some(parent => dragIds.includes(parent.id)))) return items

  const siblings = items.filter(item => item.parentId === parentId)
  const adjustedIndex = Math.max(0, index - siblings.slice(0, index).filter(item => dragIds.includes(item.id)).length)
  const rest = items.filter(item => !dragIds.includes(item.id))
  const targetSiblings = rest.filter(item => item.parentId === parentId)
  const anchor = targetSiblings[adjustedIndex]
  const insertionIndex = anchor ? rest.findIndex(item => item.id === anchor.id) : rest.length
  const result = [...rest]
  result.splice(insertionIndex, 0, ...dragged.map(item => ({ ...item, parentId })))
  return result
}
