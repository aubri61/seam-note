import { queryOptions, skipToken, useQuery } from '@tanstack/react-query'
import { getChildFolders, getFolder, getRootFolders } from './folderApi'
import { folderKeys } from '@/lib/query/queryKeys'
import type { UUID } from '@/lib/api/types'

export const folderQueries = {
  roots: () => queryOptions({
    queryKey: folderKeys.roots(),
    queryFn: ({ signal }) => getRootFolders({ signal }),
  }),
  children: (parentId: UUID | null | undefined) => queryOptions({
    queryKey: folderKeys.children(parentId ?? null),
    queryFn: parentId ? ({ signal }) => getChildFolders(parentId, { signal }) : skipToken,
  }),
  detail: (id: UUID | null | undefined) => queryOptions({
    queryKey: folderKeys.detail(id ?? null),
    queryFn: id ? ({ signal }) => getFolder(id, { signal }) : skipToken,
  }),
}

export function useRootFoldersQuery() {
  return useQuery(folderQueries.roots())
}

export function useChildFoldersQuery(parentId: UUID | null | undefined) {
  return useQuery(folderQueries.children(parentId))
}

export function useFolderQuery(id: UUID | null | undefined) {
  return useQuery(folderQueries.detail(id))
}
