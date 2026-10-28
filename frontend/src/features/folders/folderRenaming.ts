import { renameFolder } from './folderApi'
import type { UUID } from '@/lib/api/types'

export async function renameFolderEntry(request: {id: UUID; name: string}) {
  const name=request.name.trim()
  if (!name || name.length>200) throw new Error('폴더 이름은 공백이 아닌 1~200자로 입력해주세요.')
  if (!navigator.locks) throw new Error('탭 간 잠금을 사용할 수 없어 이름 변경을 중단했습니다.')
  return navigator.locks.request('seam-note:creation-sync',{mode:'exclusive',ifAvailable:true},async lock=>{
    if (!lock) throw new Error('생성·동기화 작업이 진행 중입니다. 완료 후 다시 시도해주세요.')
    const {draftRepository}=await import('@/features/local-drafts/draftDatabase')
    const local=await draftRepository.localEntity(request.id)
    if (local&&!local.confirmed) return {folder:await draftRepository.renamePendingFolder(request.id,name),localOnly:true}
    if (!navigator.onLine) throw new Error('서버 폴더의 이름 변경은 온라인에서만 가능합니다.')
    const folder=await renameFolder({id:request.id,name})
    try {await draftRepository.confirmFolderRename(folder)}
    catch(cause){throw new Error('서버 이름은 변경됐지만 로컬 확인을 완료하지 못했습니다. 목록을 다시 확인해주세요.',{cause})}
    return {folder,localOnly:false}
  })
}
