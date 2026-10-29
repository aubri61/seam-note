import test from 'node:test'
import assert from 'node:assert/strict'
import { proxy } from '../api/[...path].js'
const env = { API_PUBLIC_URL: 'https://api.example.com', FRONTEND_ORIGIN: 'https://seam.example.com' }
const auth = 'Basic ' + Buffer.from('synthetic:synthetic-only').toString('base64')
const request = (method = 'GET', extra = {}) => new Request('https://seam.example.com/api/notes?parentId=root', {
  method, headers: { authorization: auth, ...extra }, ...(method === 'PUT' ? { body: '{"expectedVersion":0}' } : {}),
})
test('proxy fails closed without HTTPS upstream or browser credentials', async () => {
  const never = () => assert.fail('unauthorized request reached upstream')
  for (const bad of [{}, { ...env, API_PUBLIC_URL: 'http://api.example.com' }, { ...env, API_PUBLIC_URL: 'https://user:secret@api.example.com' }, { ...env, FRONTEND_ORIGIN: 'http://seam.example.com' }]) {
    assert.equal((await proxy(request(), bad, never)).status, 503)
  }
  const response = await proxy(new Request('https://seam.example.com/api/notes'), env, never)
  assert.equal(response.status, 401)
  assert.match(response.headers.get('www-authenticate'), /^Basic /)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})
test('proxy preserves path, body, conflicts and ACK but drops cookies and cache headers', async () => {
  const body = '{"expectedVersion":0}'
  const response = await proxy(request('PUT', { 'idempotency-key': 'synthetic-operation', cookie: 'private=never-forward', origin: env.FRONTEND_ORIGIN }), env, async (url, options) => {
    assert.equal(String(url), 'https://api.example.com/api/notes?parentId=root')
    assert.equal(Buffer.from(options.body).toString(), body)
    assert.equal(options.headers.get('authorization'), auth)
    assert.equal(options.headers.get('idempotency-key'), 'synthetic-operation')
    assert.equal(options.headers.get('cookie'), null)
    assert.equal(options.redirect, 'manual')
    return new Response('{"code":"VERSION_CONFLICT"}', { status: 409, headers: { 'Idempotency-Key': 'synthetic-operation', 'Cache-Control': 'public,max-age=600', 'Set-Cookie': 'bad=1' } })
  })
  assert.equal(response.status, 409)
  assert.equal(response.headers.get('idempotency-key'), 'synthetic-operation')
  assert.equal(response.headers.get('set-cookie'), null)
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { code: 'VERSION_CONFLICT' })
})
test('cross-origin mutations, redirects and upstream failure cannot bypass the boundary', async () => {
  assert.equal((await proxy(request('PUT', { origin: 'https://attacker.example' }), env, () => assert.fail())).status, 403)
  assert.equal((await proxy(request(), env, async () => new Response(null, { status: 302, headers: { location: 'https://attacker.example' } }))).status, 502)
  assert.equal((await proxy(request(), env, async () => { throw Error('synthetic failure') })).status, 502)
  const denied = await proxy(request(), env, async () => new Response(null, { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Caddy"' } }))
  assert.equal(denied.status, 401)
  assert.equal(denied.headers.get('www-authenticate'), 'Basic realm="Caddy"')
})
test('successful empty DELETE keeps 204 and requests never follow redirects', async () => {
  assert.equal((await proxy(request('DELETE'), env, async () => new Response(null, { status: 204 }))).status, 204)
})
