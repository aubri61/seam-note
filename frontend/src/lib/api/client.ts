import axios from 'axios'
import type { ApiErrorResponse, ApiFieldError } from './types'

export interface RequestOptions {
  signal?: AbortSignal
  idempotencyKey?: string
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

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 15_000,
  headers: { Accept: 'application/json' },
})

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null) return false
  const payload = value as Record<string, unknown>
  return typeof payload.code === 'string' && typeof payload.message === 'string'
    && Array.isArray(payload.errors)
    && payload.errors.every(error => typeof error === 'object' && error !== null
      && typeof error.field === 'string' && typeof error.message === 'string')
}

async function request<T>(method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, data: unknown, { signal, idempotencyKey }: RequestOptions): Promise<{ data: T; status: number; operationId?: string }> {
  try {
    const response = await apiClient.request<T>({ method, url: path, data, signal,
      ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey }, timeout: 15_000 } : {}) })
    return { data: response.data, status: response.status,
      operationId: typeof response.headers['idempotency-key'] === 'string' ? response.headers['idempotency-key'] : undefined }
  } catch (cause) {
    if (axios.isCancel(cause) || signal?.aborted) throw cause
    if (!axios.isAxiosError(cause)) throw cause
    if (!cause.response) {
      throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'API 서버에 연결할 수 없습니다.', errors: [] }, undefined, cause)
    }
    const payload = isApiErrorResponse(cause.response.data) ? cause.response.data
      : { code: 'HTTP_ERROR', message: `API 요청에 실패했습니다. (HTTP ${cause.response.status})`, errors: [] }
    throw new ApiError(cause.response.status, payload, cause.response.data, cause)
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
