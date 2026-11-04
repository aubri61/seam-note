import { ApiError, getJson, patchJson, postJson, postEmpty } from '@/lib/api/client'
import { accessTokenStore } from './accessTokenStore'
import { createRefreshCoordinator, withAuthLock } from './refreshCoordinator'
import { documentAccount, sameAccount } from './authRuntime'

export interface AuthUser { id: string; email: string; nickname: string; emailVerified: boolean; issuer: string; audience: string }
interface LoginResponse { user: AuthUser; accessToken: string; tokenType: 'Bearer'; expiresIn: number }
function validUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false
  const user = value as Record<string, unknown>
  return typeof user.id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(user.id)
    && typeof user.issuer === 'string' && user.issuer.length > 0 && typeof user.audience === 'string' && user.audience.length > 0
    && typeof user.email === 'string' && typeof user.nickname === 'string' && typeof user.emailVerified === 'boolean'
}
function invalidResponse(): ApiError {
  return new ApiError(200, { code: 'INVALID_RESPONSE', message: '인증 응답 형식을 확인해주세요.', errors: [] })
}
async function csrfToken(): Promise<string> {
  const response = await getJson<{ headerName: string; token: string }>('/auth/csrf')
  if (response.headerName !== 'X-CSRF-TOKEN' || typeof response.token !== 'string'
    || !response.token || response.token.length > 1024) throw invalidResponse()
  return response.token
}
export async function signupWithPassword(input: { email: string; password: string; nickname: string }): Promise<void> {
  await postJson('/auth/signup', input, { csrfToken: await csrfToken() })
}
export async function loginWithPassword(input: { email: string; password: string }): Promise<AuthUser> {
  const attempt = accessTokenStore.begin()
  try {
    const result = await postJson<LoginResponse>('/auth/login', input, { csrfToken: await csrfToken() })
    if (result.tokenType !== 'Bearer' || typeof result.accessToken !== 'string' || !validUser(result.user)) throw invalidResponse()
    accessTokenStore.complete(attempt, result.accessToken, result.expiresIn)
    return result.user
  } catch (error) {
    // Do not retain a malformed success body's token in ApiError.responseBody/cause.
    if (error instanceof ApiError) throw new ApiError(error.status, { code: error.code, message: error.message, errors: error.errors })
    throw error
  }
}
export async function getCurrentUser(): Promise<AuthUser> {
  const user = await getJson<unknown>('/auth/me')
  if (!validUser(user)) throw invalidResponse()
  return user
}

export const refreshAuthentication = createRefreshCoordinator(async (): Promise<AuthUser> => {
  const generation = accessTokenStore.generation()
  const result = await postJson<LoginResponse>('/auth/refresh', {}, { csrfToken: await csrfToken() })
  if (result.tokenType !== 'Bearer' || typeof result.accessToken !== 'string' || !validUser(result.user)) throw invalidResponse()
  if (documentAccount && !sameAccount(documentAccount, result.user)) {
    accessTokenStore.clear()
    throw new ApiError(401, { code: 'AUTH_ACCOUNT_CHANGED', message: '계정 또는 서버 환경이 변경되었습니다. 원고를 보존하고 다시 로그인해주세요.', errors: [] })
  }
  accessTokenStore.complete(generation, result.accessToken, result.expiresIn)
  return result.user
})
export async function renameProfile(nickname: string): Promise<AuthUser> {
  const generation = accessTokenStore.generation()
  const requireSameSession = () => {
    if (generation !== accessTokenStore.generation()) throw new Error('계정이 변경되었습니다. 다시 로그인해주세요.')
  }
  if (!accessTokenStore.get()) await refreshAuthentication()
  requireSameSession()
  const user = await patchJson<unknown>('/auth/me', { nickname })
  requireSameSession()
  if (!validUser(user) || !sameAccount(documentAccount, user)) throw invalidResponse()
  return user
}

export async function logoutOnServer(): Promise<void> {
  accessTokenStore.clear()
  await withAuthLock(async () => {
    // Logout returns 204; use the API's no-body helper.
    await logoutRequest(await csrfToken())
  })
}
async function logoutRequest(csrf: string): Promise<void> {
  await postEmpty('/auth/logout', {}, { csrfToken: csrf })
}
