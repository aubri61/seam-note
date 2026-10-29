import { visibleWorkspaceRows } from './workspaceTree'
import type { WorkspaceTreeModel } from './workspaceTree'
import type { UUID } from '@/lib/api/types'

export function folderChoices(tree: WorkspaceTreeModel) {
  const open = Object.fromEntries([...tree.folders.keys()].map(id => [id, true]))
  return visibleWorkspaceRows(tree, open).flatMap(({ node, depth }) => node.kind === 'folder'
    ? [{ id: node.folder.id, label: `${'　'.repeat(depth)}${node.folder.name}` }] : [])
}

/** Next note in full sorted display order, otherwise the previous note. */
export function nextNoteAfterDeletion(tree: WorkspaceTreeModel, id: UUID): UUID | null {
  const open = Object.fromEntries([...tree.folders.keys()].map(folder => [folder, true]))
  const ids = visibleWorkspaceRows(tree, open).flatMap(row => row.node.kind === 'note' ? [row.node.note.id] : [])
  const index = ids.indexOf(id)
  return index < 0 ? ids[0] ?? null : ids[index + 1] ?? ids[index - 1] ?? null
}

export function folderPath(tree: WorkspaceTreeModel, id: UUID): UUID[] {
  const ids: UUID[] = []
  let current: UUID | null = id
  while (current && tree.folders.has(current)) {
    ids.push(current)
    current = tree.parents.get(current) ?? null
  }
  return ids.reverse()
}

export type TreeSelection = { kind: 'folder' | 'note'; id: UUID }

/** Original rule: inside a selected folder, beside a selected/active note. */
export function creationParent(tree: WorkspaceTreeModel, selection: TreeSelection | null, activeNoteId: UUID | null): UUID | null {
  if (selection?.kind === 'folder' && tree.folders.has(selection.id)) return selection.id
  const note = selection?.kind === 'note' ? tree.notes.get(selection.id) : undefined
  return (note ?? (activeNoteId ? tree.notes.get(activeNoteId) : undefined))?.note.folderId ?? null
}

export function folderSubtree(data: import('@/lib/api/types').WorkspaceTreeResponse | undefined, id: string) {
  const folders=new Set([id]),children=new Map<string,string[]>()
  for(const folder of data?.folders??[])if(folder.parentId){const ids=children.get(folder.parentId)??[];ids.push(folder.id);children.set(folder.parentId,ids)}
  const stack=[id]
  while(stack.length){for(const child of children.get(stack.pop()!)??[])if(!folders.has(child)){folders.add(child);stack.push(child)}}
  return {folderIds:[...folders],noteIds:(data?.notes??[]).filter(n=>n.folderId&&folders.has(n.folderId)).map(n=>n.id)}
}
