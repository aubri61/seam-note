import type { DexieDraftRepository } from '@/features/local-drafts/draftDatabase'
export type WorkspaceSyncSnapshot = Awaited<ReturnType<DexieDraftRepository['workspaceSyncSnapshot']>>
export const workspaceSyncStorage = {
  count: async () => (await import('@/features/local-drafts/draftDatabase')).draftRepository.workspaceSyncCount(),
  read: async (): Promise<WorkspaceSyncSnapshot> => (await import('@/features/local-drafts/draftDatabase')).draftRepository.workspaceSyncSnapshot(),
}
