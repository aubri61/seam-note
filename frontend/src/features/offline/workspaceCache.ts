import type { WorkspaceTreeResponse } from '@/lib/api/types'
import { ApiError } from '@/lib/api/client'
import { getWorkspaceTree } from '@/features/workspace/workspaceApi'
import type { RequestOptions } from '@/lib/api/client'

export interface WorkspaceRecord {
  key: 'current'
  data: WorkspaceTreeResponse
  cachedAt: number
  requestedAt: number
}
export type WorkspaceView = WorkspaceTreeResponse & { localSnapshot?: { cachedAt: number; warning: string } }
export function validateWorkspace(data: WorkspaceTreeResponse) {
  if (!data || !Array.isArray(data.folders) || !Array.isArray(data.notes)
    || !data.folders.every(f => typeof f.id === 'string' && typeof f.name === 'string' && (f.parentId === null || typeof f.parentId === 'string') && Number.isSafeInteger(f.sortOrder) && Number.isSafeInteger(f.version))
    || !data.notes.every(n => typeof n.id === 'string' && typeof n.folderId === 'string' && typeof n.title === 'string' && Number.isSafeInteger(n.version) && Number.isSafeInteger(n.sortOrder))) {
    throw new Error('Workspace 응답 형식을 확인하지 못했습니다. 기존 로컬 목록을 보존했습니다.')
  }
  // Store metadata only, even if a server accidentally includes content or extra response properties.
  return { folders: data.folders.map(({ id, parentId, name, sortOrder, version, createdAt, updatedAt }) => ({ id, parentId, name, sortOrder, version, createdAt, updatedAt })),
    notes: data.notes.map(({ id, folderId, title, sortOrder, version, updatedAt }) => ({ id, folderId, title, sortOrder, version, updatedAt })) }
}
const repository = async () => (await import('@/features/local-drafts/draftDatabase')).draftRepository
export const workspaceStorage = {
  read: async () => (await repository()).readWorkspace(),
  save: async (data: WorkspaceTreeResponse, requestedAt: number) => (await repository()).saveWorkspace(data, requestedAt),
}
interface Dependencies {
  online: () => boolean
  get: typeof getWorkspaceTree
  storage: typeof workspaceStorage
}
export async function loadWorkspace(options: RequestOptions = {}, dependencies: Dependencies = {
  online: () => typeof navigator === 'undefined' || navigator.onLine !== false, get: getWorkspaceTree, storage: workspaceStorage,
}): Promise<WorkspaceView> {
  const requestedAt = Date.now()
  let failure: unknown
  if (dependencies.online()) {
    let data: WorkspaceTreeResponse | undefined
    try { data = validateWorkspace(await dependencies.get(options)) }
    catch (error) {
      if (options.signal?.aborted) throw error
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error
      failure = error
    }
    if (data) {
      if (options.signal?.aborted) throw options.signal.reason
      try { await dependencies.storage.save(data, requestedAt) }
      catch { return { ...data, localSnapshot: { cachedAt: 0, warning: '현재 서버 목록은 표시하지만 오프라인 목록 저장에 실패했습니다.' } } }
      return data
    }
  }
  const cached = await dependencies.storage.read()
  if (options.signal?.aborted) throw options.signal.reason
  if (cached) return { ...validateWorkspace(cached.data), localSnapshot: { cachedAt: cached.cachedAt,
    warning: '마지막으로 저장한 폴더·원고 목록입니다. 이 브라우저에 본문이 저장된 원고만 오프라인에서 열 수 있습니다.' } }
  if (failure) throw failure
  throw new Error('오프라인 목록이 없습니다. 온라인에서 Workspace를 먼저 열어주세요.')
}
