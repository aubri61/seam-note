/** Serialize the shared HttpOnly cookie across tabs; never broadcast credential values. */
export async function withAuthLock<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('안전한 로그인 처리를 위해 지원되는 브라우저에서 다시 로그인해주세요.')
  return navigator.locks.request('seam-note:auth-cookie', { mode: 'exclusive' }, action)
}
export function createRefreshCoordinator<T>(action: () => Promise<T>, lock: (action: () => Promise<T>) => Promise<T> = withAuthLock) {
  let pending: Promise<T> | undefined
  return () => {
    if (!pending) {
      pending = lock(action).finally(() => { pending = undefined })
    }
    return pending
  }
}
