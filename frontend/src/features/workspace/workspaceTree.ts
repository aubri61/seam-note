import type { Folder, NoteSummary, UUID, WorkspaceTreeResponse } from '@/lib/api/types'

export interface WorkspaceFolderNode {
  kind: 'folder'
  key: string
  folder: Folder
  children: WorkspaceNode[]
}
export interface WorkspaceNoteNode {
  kind: 'note'
  key: string
  note: NoteSummary
}
export type WorkspaceNode = WorkspaceFolderNode | WorkspaceNoteNode
export interface WorkspaceTreeModel {
  roots: WorkspaceFolderNode[]
  folders: Map<UUID, WorkspaceFolderNode>
  notes: Map<UUID, WorkspaceNoteNode>
  parents: Map<UUID, UUID | null>
  issues: string[]
}
export interface WorkspaceRow {
  node: WorkspaceNode
  depth: number
  parentKey: string | null
}

function identity(node: WorkspaceNode) {
  return node.kind === 'folder' ? node.folder : node.note
}
function compare(a: WorkspaceNode, b: WorkspaceNode) {
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
  const x = identity(a), y = identity(b)
  return x.sortOrder - y.sortOrder || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
}
export function nodeLabel(node: WorkspaceNode) {
  return node.kind === 'folder' ? node.folder.name : node.note.title || '제목 없는 문서'
}

/** New view nodes only; never sort or change the response arrays/DTOs in place. */
export function buildWorkspaceTree(data: WorkspaceTreeResponse): WorkspaceTreeModel {
  const model: WorkspaceTreeModel = { roots: [], folders: new Map(), notes: new Map(), parents: new Map(), issues: [] }
  for (const folder of data.folders) {
    if (model.folders.has(folder.id)) { model.issues.push('중복 폴더 ID'); continue }
    model.folders.set(folder.id, { kind: 'folder', key: `folder:${folder.id}`, folder, children: [] })
  }
  for (const { folder } of model.folders.values()) {
    const missing = folder.parentId !== null && !model.folders.has(folder.parentId)
    model.parents.set(folder.id, missing ? null : folder.parentId)
    if (missing) model.issues.push('없는 부모 폴더: 최상위에 표시')
  }
  // Functional graph walk: break each cycle at its smallest ID, with no recursive stack.
  const done = new Set<UUID>()
  for (const start of model.folders.keys()) {
    const path: UUID[] = [], positions = new Map<UUID, number>()
    let id: UUID | null = start
    while (id !== null && !done.has(id)) {
      if (positions.has(id)) {
        const cycle = path.slice(positions.get(id))
        const cut = cycle.reduce((smallest, current) => current < smallest ? current : smallest)
        model.parents.set(cut, null)
        model.issues.push('폴더 순환: 한 연결을 끊어 표시')
        break
      }
      positions.set(id, path.length)
      path.push(id)
      id = model.parents.get(id) ?? null
    }
    for (const visited of path) done.add(visited)
  }
  for (const [id, node] of model.folders) {
    const parentId = model.parents.get(id)
    if (parentId == null) model.roots.push(node)
    else model.folders.get(parentId)!.children.push(node)
  }
  for (const note of data.notes) {
    const parent = model.folders.get(note.folderId)
    if (!parent) { model.issues.push('없는 폴더의 원고: 표시 제외'); continue }
    if (model.notes.has(note.id)) { model.issues.push('중복 원고 ID'); continue }
    const node: WorkspaceNoteNode = { kind: 'note', key: `note:${note.id}`, note }
    model.notes.set(note.id, node)
    parent.children.push(node)
  }
  model.roots.sort(compare)
  for (const node of model.folders.values()) node.children.sort(compare)
  return model
}

export function firstNoteId(model: WorkspaceTreeModel): UUID | null {
  const stack: WorkspaceNode[] = [...model.roots].reverse()
  while (stack.length) {
    const node = stack.pop()!
    if (node.kind === 'note') return node.note.id
    for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i])
  }
  return null
}

export function noteAncestors(model: WorkspaceTreeModel, noteId: UUID | null): Folder[] {
  const path: Folder[] = []
  let folderId = noteId ? model.notes.get(noteId)?.note.folderId : null
  while (folderId) {
    path.push(model.folders.get(folderId)!.folder)
    folderId = model.parents.get(folderId)
  }
  return path.reverse()
}

export function visibleWorkspaceRows(model: WorkspaceTreeModel, open: Record<string, boolean>, search = ''): WorkspaceRow[] {
  const query = search.trim().toLocaleLowerCase()
  const rows: WorkspaceRow[] = []
  const stack: WorkspaceRow[] = model.roots.map(node => ({ node, depth: 0, parentKey: null })).reverse()
  while (stack.length) {
    const row = stack.pop()!
    rows.push(row)
    if (row.node.kind === 'folder' && (query || open[row.node.folder.id])) {
      for (let i = row.node.children.length - 1; i >= 0; i--) {
        stack.push({ node: row.node.children[i], depth: row.depth + 1, parentKey: row.node.key })
      }
    }
  }
  if (!query) return rows
  const included = new Set<string>()
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (included.has(row.node.key) || nodeLabel(row.node).toLocaleLowerCase().includes(query)) {
      included.add(row.node.key)
      if (row.parentKey) included.add(row.parentKey)
    }
  }
  return rows.filter(row => included.has(row.node.key))
}
