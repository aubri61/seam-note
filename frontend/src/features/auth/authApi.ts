import { ApiError, getJson, postJson } from '@/lib/api/client'
import { accessTokenStore } from './accessTokenStore'

export interface AuthUser { id: string; email: string; nickname: string; emailVerified: boolean }
interface LoginResponse { user: AuthUser; accessToken: string; tokenType: 'Bearer'; expiresIn: number }
function validUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false
  const user = value as Record<string, unknown>
  return typeof user.id === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(user.id)
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
