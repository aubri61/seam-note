import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import axios, { AxiosError, CanceledError } from 'axios'
import { load } from './helpers/loadModules.mjs'
const { createAccessTokenStore, accessTokenStore } = await load('features/auth/accessTokenStore')
const { apiClient, getJson, ApiError } = await load('lib/api/client')
const { loginWithPassword, getCurrentUser } = await load('features/auth/authApi')
const adapter = apiClient.defaults.adapter
const user = { id: '00000000-0000-4000-8000-000000000001', email: 'test@example.test', nickname: '테스트', emailVerified: false }
const token = 'testHeader.testPayload.testSignature'
const reply = (config, data) => ({ config, data, status: 200, statusText: '', headers: {} })
afterEach(() => { apiClient.defaults.adapter = adapter; accessTokenStore.clear() })
test('memory token expires and stale login cannot overwrite a newer generation', () => {
  let now = 100
  const store = createAccessTokenStore(() => now)
  const first = store.begin(); store.complete(first, token, 5)
  assert.equal(store.get(), token)
  now = 5100; assert.equal(store.get(), undefined)
  const second = store.begin(); store.complete(second, token, 5)
  assert.throws(() => store.complete(first, 'oldHeader.oldPayload.oldSignature', 5))
  assert.equal(store.get(), token)
  store.clear(); assert.equal(store.get(), undefined)
  assert.throws(() => store.complete(second, token, 5))
})
test('Bearer attaches only to our relative API and never public login or another origin', async () => {
  accessTokenStore.complete(accessTokenStore.begin(), token, 300)
  apiClient.defaults.adapter = async config => reply(config, { authorization: config.headers.get('Authorization') })
  assert.equal((await getJson('/auth/me')).authorization, `Bearer ${token}`)
  for (const url of ['/auth/csrf', '/auth/login', '/auth/signup', 'https://other.example/private', '//other.example/private', '/\\other.example/private']) {
    const response = await apiClient.get(url)
    assert.equal(response.data.authorization, undefined, url)
  }
  assert.equal((await apiClient.get('/auth/me', { baseURL: 'https://other.example' })).data.authorization, undefined)
})
test('login sends CSRF, stores token only in memory and retrieves protected profile', async () => {
  const calls = []
  apiClient.defaults.adapter = async config => {
    calls.push(config.url)
    if (config.url === '/auth/csrf') return reply(config, { headerName: 'X-CSRF-TOKEN', token: 'csrf-value' })
    if (config.url === '/auth/login') {
      assert.equal(config.headers.get('X-CSRF-TOKEN'), 'csrf-value')
      assert.equal(config.headers.get('Authorization'), undefined)
      return reply(config, { user, accessToken: token, tokenType: 'Bearer', expiresIn: 300 })
    }
    assert.equal(config.headers.get('Authorization'), `Bearer ${token}`)
    return reply(config, user)
  }
  assert.deepEqual(await loginWithPassword({ email: user.email, password: 'test-only-password' }), user)
  assert.deepEqual(await getCurrentUser(), user)
  assert.deepEqual(calls, ['/auth/csrf', '/auth/login', '/auth/me'])
})
test('401 is returned once without refresh recursion or erasing newer credentials', async () => {
  accessTokenStore.complete(accessTokenStore.begin(), token, 300)
  let calls = 0
  apiClient.defaults.adapter = async config => {
    calls++
    throw new AxiosError('HTTP failure', AxiosError.ERR_BAD_RESPONSE, config, undefined,
      { config, data: { code: 'AUTHENTICATION_REQUIRED', message: '인증이 필요합니다.', errors: [] }, status: 401, headers: {} })
  }
  await assert.rejects(getCurrentUser(), e => e instanceof ApiError && e.status === 401 && e.cause === undefined)
  assert.equal(calls, 1); assert.equal(accessTokenStore.get(), token)
})
test('network errors do not retain Axios config containing the Bearer', async () => {
  accessTokenStore.complete(accessTokenStore.begin(), token, 300)
  apiClient.defaults.adapter = async config => { throw new AxiosError('connection failed', 'ERR_NETWORK', config) }
  await assert.rejects(getCurrentUser(), error => {
    assert.equal(error.cause, undefined)
    assert.equal(JSON.stringify(error).includes(token), false)
    return error instanceof ApiError && error.code === 'NETWORK_ERROR'
  })
})
test('cancellation remains recognizable without retaining credential-bearing config', async () => {
  accessTokenStore.complete(accessTokenStore.begin(), token, 300)
  apiClient.defaults.adapter = async config => { throw new CanceledError('cancelled', config) }
  await assert.rejects(getCurrentUser(), error => axios.isCancel(error) && error.config === undefined)
})
test('malformed login response is rejected without retaining token in error details', async () => {
  apiClient.defaults.adapter = async config => config.url === '/auth/csrf'
    ? reply(config, { headerName: 'X-CSRF-TOKEN', token: 'csrf-value' })
    : reply(config, { user: null, accessToken: token, tokenType: 'Bearer', expiresIn: 300 })
  await assert.rejects(loginWithPassword({ email: user.email, password: 'test-only-password' }), error => {
    assert.equal(JSON.stringify(error).includes(token), false)
    return error instanceof ApiError && error.code === 'INVALID_RESPONSE'
  })
  assert.equal(accessTokenStore.get(), undefined)
})
test('late login success cannot restore credentials after local clear', async () => {
  let resolveLogin
  const sent = new Promise(resolve => {
    apiClient.defaults.adapter = async config => {
      if (config.url === '/auth/csrf') return reply(config, { headerName: 'X-CSRF-TOKEN', token: 'csrf-value' })
      return new Promise(finish => { resolveLogin = () => finish(reply(config, { user, accessToken: token, tokenType: 'Bearer', expiresIn: 300 })); resolve() })
    }
  })
  const pending = loginWithPassword({ email: user.email, password: 'test-only-password' })
  await sent; accessTokenStore.clear(); resolveLogin()
  await assert.rejects(pending)
  assert.equal(accessTokenStore.get(), undefined)
})
