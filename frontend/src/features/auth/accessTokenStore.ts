/** Memory only. This is not JWT verification or the account-specific draft lifecycle (Phase 5). */
export function createAccessTokenStore(now: () => number = Date.now) {
  let generation = 0
  let current: { token: string; expiresAt: number } | undefined
  return {
    begin() { current = undefined; return ++generation },
    clear() { current = undefined; generation++ },
    complete(expectedGeneration: number, token: string, expiresIn: number) {
      if (expectedGeneration !== generation) throw new Error('이전 로그인 응답을 적용하지 않았습니다.')
      if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || token.length > 8192
        || !Number.isSafeInteger(expiresIn) || expiresIn < 1 || expiresIn > 900) {
        throw new Error('인증 응답 형식을 확인해주세요.')
      }
      current = { token, expiresAt: now() + expiresIn * 1000 }
    },
    get() {
      if (current && current.expiresAt <= now()) current = undefined
      return current?.token
    },
  }
}
export const accessTokenStore = createAccessTokenStore()
