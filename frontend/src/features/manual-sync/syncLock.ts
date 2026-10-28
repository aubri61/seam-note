// The existing creation/deletion lock is also the workspace/manual-sync gate.
export async function withSyncLock<T>(action: () => Promise<T>, locks: LockManager | undefined = navigator.locks): Promise<T> {
  if (!locks || typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('온라인 및 탭 간 잠금을 확인한 뒤 동기화해주세요.')
  return locks.request('seam-note:creation-sync', { mode: 'exclusive', ifAvailable: true }, lock => {
    if (!lock) throw new Error('다른 탭 또는 저장 작업이 동기화 중입니다. 완료 후 다시 시도해주세요.')
    return action()
  })
}
