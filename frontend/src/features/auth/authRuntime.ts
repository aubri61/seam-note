import { accessTokenStore } from './accessTokenStore'

export interface AccountScope { id: string; issuer: string; audience: string; nickname: string }
export const ACTIVE_ACCOUNT = 'seam-note:active-account:v1'
export const LOGOUT_PENDING = 'seam-note:logout-pending:v1'
export const AUTH_FENCE = 'seam-note:auth-fence:v1'
export function parseAccount(raw: string | null): AccountScope | null {
  try {
    const value = JSON.parse(raw ?? 'null')
    return value && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value.id)
      && typeof value.issuer === 'string' && value.issuer.length > 0 && value.issuer.length <= 2048
      && typeof value.audience === 'string' && value.audience.length > 0 && value.audience.length <= 200
      && typeof value.nickname === 'string' && value.nickname.length <= 30 ? value : null
  } catch { return null }
}
export function readAccount(key = ACTIVE_ACCOUNT): AccountScope | null {
  try { return parseAccount(localStorage.getItem(key)) } catch { return null }
}
export function sameAccount(a: AccountScope | null, b: AccountScope | null) {
  return !!a && !!b && a.id === b.id && a.issuer === b.issuer && a.audience === b.audience
}
export function accountNamespace(base: string, account: AccountScope | null, origin = '') {
  return account ? `${base}:account:${encodeURIComponent(JSON.stringify([origin, account.issuer, account.audience, account.id]))}` : base
}
// Immutable for the lifetime of a document. Late ACKs can only touch the original account DB.
export const documentAccount = readAccount()
export const scopedName = (base: string) => accountNamespace(base, documentAccount, typeof location === 'undefined' ? '' : location.origin)
export function saveAccount(account: AccountScope) {
  const value = JSON.stringify({ id: account.id, issuer: account.issuer, audience: account.audience, nickname: account.nickname })
  localStorage.setItem(ACTIVE_ACCOUNT, value)
}
let allowed = true
const listeners = new Set<() => void>()
export const businessAccess = () => allowed
export function setBusinessAccess(value: boolean) { if (allowed !== value) { allowed = value; listeners.forEach(fn => fn()) } }
export function subscribeBusinessAccess(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
const flushers = new Set<() => Promise<void>>()
export function registerDraftFlush(flush: () => Promise<void>) { flushers.add(flush); return () => { flushers.delete(flush) } }
export async function flushAccountDrafts() { for (const flush of flushers) await flush() }
export async function prepareAuthChange() {
  const previous = businessAccess()
  setBusinessAccess(false)
  accessTokenStore.clear()
  try {
    localStorage.setItem(AUTH_FENCE, crypto.randomUUID())
    await flushAccountDrafts()
  } catch {
    setBusinessAccess(previous)
    throw new Error('로컬 저장을 확인하지 못해 요청을 중단했습니다. 현재 입력을 보관하고 다시 시도해주세요.')
  }
}
