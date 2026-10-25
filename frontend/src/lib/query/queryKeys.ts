import type { UUID } from '@/lib/api/types'

export const folderKeys = {
  all: ['folders'] as const,
  roots: () => ['folders', 'roots'] as const,
  children: (parentId: UUID | null) => ['folders', 'children', parentId] as const,
  detail: (id: UUID | null) => ['folders', 'detail', id] as const,
}

export const noteKeys = {
  all: ['notes'] as const,
  lists: () => ['notes', 'list'] as const,
  byFolder: (folderId: UUID | null) => ['notes', 'list', 'folder', folderId] as const,
  detail: (id: UUID | null) => ['notes', 'detail', id] as const,
}

export const workspaceKeys = {
  all: ['workspace'] as const,
  tree: () => ['workspace', 'tree'] as const,
}
