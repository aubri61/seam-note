import { documentAccount, scopedName } from '@/features/auth/authRuntime'
const scope = documentAccount ? [scopedName('query')] : []
import type { UUID } from '@/lib/api/types'

export const folderKeys = {
  all: [...scope, 'folders'] as const,
  roots: () => [...scope, 'folders', 'roots'] as const,
  children: (parentId: UUID | null) => [...scope, 'folders', 'children', parentId] as const,
  detail: (id: UUID | null) => [...scope, 'folders', 'detail', id] as const,
}

export const noteKeys = {
  all: [...scope, 'notes'] as const,
  lists: () => [...scope, 'notes', 'list'] as const,
  byFolder: (folderId: UUID | null) => [...scope, 'notes', 'list', 'folder', folderId] as const,
  detail: (id: UUID | null) => [...scope, 'notes', 'detail', id] as const,
}

export const workspaceKeys = {
  all: [...scope, 'workspace'] as const,
  tree: () => [...scope, 'workspace', 'tree'] as const,
}
