import axios from 'axios'
import type { ApiErrorResponse, ApiFieldError } from './types'
import { accessTokenStore } from '@/features/auth/accessTokenStore'
import { businessAccess } from '@/features/auth/authRuntime'

export interface RequestOptions {
  signal?: AbortSignal
  idempotencyKey?: string
  csrfToken?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly errors: ApiFieldError[]
  readonly responseBody: unknown

  constructor(status: number, payload: ApiErrorResponse, responseBody: unknown = payload, cause?: unknown) {
    super(payload.message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.code = payload.code
    this.errors = payload.errors
    this.responseBody = responseBody
  }
}

let recoverAuthentication: (() => Promise<void>) | undefined
export function configureAuthRecovery(recover: (() => Promise<void>) | undefined) { recoverAuthentication = recover }

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 15_000,
  headers: { Accept: 'application/json' },
})

apiClient.interceptors.request.use(config => {
  const path = config.url ?? ''
  // Never attach a credential to an absolute URL, another baseURL, or protocol-relative URL.
  const localApi = config.baseURL === '/api' && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
  const publicAuth = /^\/auth\/(?:csrf|signup|login|refresh|logout)(?:\?|$)/.test(path)
  const token = accessTokenStore.get()
  if (localApi && !publicAuth && token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
}, undefined, { synchronous: true })

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) return false
  const payload = value as Record<string, unknown>
  return typeof payload.code === 'string' && typeof payload.message === 'string'
    && Array.isArray(payload.errors)
    && payload.errors.every(error => typeof error === 'object' && error !== null
      && typeof error.field === 'string' && typeof error.message === 'string')
}

async function request<T>(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, data: unknown, { signal, idempotencyKey, csrfToken }: RequestOptions, retry = true): Promise<{ data: T; status: number; operationId?: string }> {
  if (!path.startsWith('/auth/') && !businessAccess()) throw new ApiError(0, { code: 'AUTH_OFFLINE', message: '인증을 확인하기 전에는 서버 동기화를 중단합니다. 로컬 원고는 유지됩니다.', errors: [] })
  const generation = accessTokenStore.generation()
  const sentToken = accessTokenStore.get()
  try {
    const response = await apiClient.request<T>({ method, url: path, data, signal,
      headers: { ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...(csrfToken ? { 'X-CSRF-TOKEN': csrfToken } : {}) } })
    if (!path.startsWith('/auth/') && generation !== accessTokenStore.generation()) throw new ApiError(401, { code: 'AUTH_ACCOUNT_CHANGED', message: '이전 계정의 응답을 적용하지 않았습니다.', errors: [] })
    return { data: response.data, status: response.status,
      operationId: typeof response.headers['idempotency-key'] === 'string' ? response.headers['idempotency-key'] : undefined }
  } catch (cause) {
    if (axios.isCancel(cause) || signal?.aborted) throw new axios.CanceledError('요청이 취소되었습니다.')
    if (!axios.isAxiosError(cause)) throw cause
    if (!cause.response) {
      // AxiosError retains request headers/body: never keep it as an error cause.
      throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'API 서버에 연결할 수 없습니다.', errors: [] })
    }
    if (cause.response.status === 401 && retry && recoverAuthentication && !path.startsWith('/auth/')
      && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
      && generation === accessTokenStore.generation()) {
      if (!accessTokenStore.get() || accessTokenStore.get() === sentToken) await recoverAuthentication()
      if (generation !== accessTokenStore.generation()) throw new ApiError(401, { code: 'AUTHENTICATION_REQUIRED', message: '계정이 변경되었습니다.', errors: [] })
      if (signal?.aborted) throw new axios.CanceledError('요청이 취소되었습니다.')
      return request<T>(method, path, data, { signal, idempotencyKey, csrfToken }, false)
    }
    const payload = isApiErrorResponse(cause.response.data) ? cause.response.data
      : { code: 'HTTP_ERROR', message: `API 요청에 실패했습니다. (HTTP ${cause.response.status})`, errors: [] }
    throw new ApiError(cause.response.status, payload, cause.response.data)
  }
}

function jsonBody<T>(response: { data: T; status: number }): T {
  if (response.data === null || typeof response.data !== 'object') {
    throw new ApiError(response.status, { code: 'INVALID_RESPONSE', message: 'API 응답 JSON 형식을 확인해주세요.', errors: [] }, response.data)
  }
  return response.data
}

export async function getJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return jsonBody(await request<T>('get', path, undefined, options))
}

export async function postJson<T>(path: string, data: unknown, options: RequestOptions = {}): Promise<T> {
  return jsonBody(await request<T>('post', path, data, options))
}

export async function deleteResource(path: string, options: RequestOptions = {}): Promise<void> {
  // DELETE endpoints return 204, so there is no JSON body to parse.
  await request<void>('delete', path, undefined, options)
}

export async function patchJson<T>(path: string, data: unknown): Promise<T> {
  return jsonBody(await request<T>('patch', path, data, {}))
}

export async function putJsonWithOperation<T>(path: string, data: unknown, operationId: string) {
  const response = await request<T>('put', path, data, { idempotencyKey: operationId })
  if (response.status !== 200) throw new ApiError(response.status, { code: 'INVALID_RESPONSE', message: '수정 성공 응답 상태를 확인해주세요.', errors: [] }, undefined)
  return { body: jsonBody(response), operationId: response.operationId }
}

export async function postJsonWithOperation<T>(path: string, data: unknown, operationId: string) {
  const response = await request<T>('post', path, data, { idempotencyKey: operationId })
  if(response.status!==201)throw new ApiError(response.status,{code:'INVALID_RESPONSE',message:'생성 응답 상태를 확인하지 못했습니다.',errors:[]})
  return {body:jsonBody(response),operationId:response.operationId}
}

export async function postEmpty(path: string, data: unknown, options: RequestOptions = {}): Promise<void> {
  await request<void>('post', path, data, options)
}
