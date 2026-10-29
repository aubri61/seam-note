import { MissingDraftRecoveryBlocked } from './localDraftTypes'
import type { DraftRepository } from './localDraftTypes'

// Load Dexie on first recovery. Do not include its runtime in the initial UI chunk.
let connection: Promise<DraftRepository> | undefined
async function repository() {
  connection ??= import('./draftDatabase').then(module => module.draftRepository).catch(error => {
    connection = undefined
    throw error
  })
  return connection
}
export const localDraftRepository: DraftRepository = {
  restoreMissing: async (draft, revision, checkpoint, writerId) => {
    const storage = await repository()
    if (!storage.restoreMissing) throw new MissingDraftRecoveryBlocked()
    return storage.restoreMissing(draft, revision, checkpoint, writerId)
  },
  read: async (id, options) => (await repository()).read(id, options),
  write: async (draft, revision, token, writerId) => (await repository()).write(draft, revision, token, writerId),
}

export const readLocalDraftTitles = async () => (await import('./draftDatabase')).draftRepository.readTitles()
