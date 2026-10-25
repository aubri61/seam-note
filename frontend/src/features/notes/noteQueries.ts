import { queryOptions, skipToken, useQuery } from '@tanstack/react-query'
import { getFolderNoteSummaries, getNote } from './noteApi'
import { noteKeys } from '@/lib/query/queryKeys'
import type { UUID } from '@/lib/api/types'

export const noteQueries = {
  byFolder: (folderId: UUID | null | undefined) => queryOptions({
    queryKey: noteKeys.byFolder(folderId ?? null),
    queryFn: folderId ? ({ signal }) => getFolderNoteSummaries(folderId, { signal }) : skipToken,
  }),
  detail: (id: UUID | null | undefined) => queryOptions({
    queryKey: noteKeys.detail(id ?? null),
    queryFn: id ? ({ signal }) => getNote(id, { signal }) : skipToken,
  }),
}

export function useFolderNotesQuery(folderId: UUID | null | undefined) {
  return useQuery(noteQueries.byFolder(folderId))
}

export function useNoteQuery(id: UUID | null | undefined) {
  return useQuery(noteQueries.detail(id))
}
