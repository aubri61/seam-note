import { localDraftRepository } from '@/features/local-drafts/localDraftRepository'
import { queryOptions, skipToken, useQuery } from '@tanstack/react-query'
import { creationStorage } from '@/features/outbox/creationStorage'
import { ApiError } from '@/lib/api/client'
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
    networkMode: 'always',
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: id ? async ({ signal }) => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiError(0, { code: 'OFFLINE_NOTE', message: '오프라인입니다. 본문이 이 브라우저에 저장된 원고만 열 수 있습니다.', errors: [] })
      if(typeof indexedDB!=='undefined'){
        await localDraftRepository.read(id)
        let local
        try { local=await creationStorage.local(id) } catch { /* Recovery reports storage errors; keep server reads available. */ }
        if(local&&!local.confirmed)throw new ApiError(0,{code:'LOCAL_UNPUBLISHED',message:'이 원고는 아직 로컬에만 있습니다. 온라인 연결 후 자동으로 서버에 반영됩니다.',errors:[]})
      }
      return getNote(id, { signal })
    } : skipToken,
    retry: (count, error) => (typeof navigator === 'undefined' || navigator.onLine !== false) && count < 1 && error instanceof ApiError && (error.status === 0 || error.status >= 500),
  }),
}

export function useFolderNotesQuery(folderId: UUID | null | undefined) {
  return useQuery(noteQueries.byFolder(folderId))
}

export function useNoteQuery(id: UUID | null | undefined) {
  return useQuery(noteQueries.detail(id))
}
