import { ApiError } from '@/lib/api/client'
import { deleteFolder } from './folderApi'

export async function deleteFolderTree(id: string): Promise<void> {
  if (!navigator.locks) throw new Error('탭 간 잠금을 사용할 수 없어 폴더 삭제를 중단했습니다.')
  await navigator.locks.request('seam-note:creation-sync', { mode: 'exclusive', ifAvailable: true }, async lock => {
    if (!lock) throw new Error('다른 탭에서 생성 또는 서버 반영 중입니다. 완료 후 다시 시도해주세요.')
    const { draftRepository } = await import('@/features/local-drafts/draftDatabase')
    // A purely pending local folder is atomically canceled without any HTTP call.
    // Do not cancel an uncertain inFlight operation: its UUID may already exist on the server.
    const local = await draftRepository.localEntity(id)
    if ((!local || local.confirmed) && !navigator.onLine) throw new Error('서버 폴더 삭제는 온라인에서만 가능합니다.')
    const target = await draftRepository.prepareFolderDeletion(id)
    if (target === 'local') {draftRepository.notifyDeleted();return}
    if(!navigator.onLine)throw new Error('서버 폴더 삭제는 온라인에서만 가능합니다.')
    try{await deleteFolder(id)}catch(error){if(!(error instanceof ApiError&&error.status===404&&error.code==='FOLDER_NOT_FOUND'))throw error}
    try { await draftRepository.finishFolderDeletion(id);draftRepository.notifyDeleted() }
    catch (cause) { throw new Error('서버에서 삭제됐지만 로컬 목록 정리를 확인하지 못했습니다. 목록을 다시 확인해주세요.', { cause }) }
  })
}
