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
  read: async id => (await repository()).read(id),
  write: async (draft, revision, token, writerId) => (await repository()).write(draft, revision, token, writerId),
}

export const readLocalDraftTitles = async () => (await import('./draftDatabase')).draftRepository.readTitles()
