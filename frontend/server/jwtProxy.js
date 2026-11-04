// Same-origin transport only. Authentication and authorization remain in Spring Security.
const noStore = { 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
const failure = (status, code) => Response.json({ code, message: '인증 또는 API 연결을 확인해주세요.', errors: [] }, { status, headers: noStore })
const oauthStart = '/api/auth/oauth2/authorization/google'
const oauthCallback = '/api/auth/oauth2/callback/google'
const authPaths = new Set(['/api/auth/config', '/api/auth/csrf', '/api/auth/signup', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout', oauthStart, oauthCallback])
function allowedRedirect(path, destination, frontend) {
  try {
    const target = new URL(destination, frontend)
    if (target.username || target.password || target.hash) return false
    if (path === oauthStart) return target.origin === 'https://accounts.google.com' && target.pathname === '/o/oauth2/v2/auth'
    return path === oauthCallback && target.origin === frontend
      && (target.pathname === '/auth/complete' && !target.search || target.pathname === '/login' && target.search === '?oauth=failed')
  } catch { return false }
}
async function limitedBody(request) {
  if (!request.body) return undefined
  const reader = request.body.getReader(), chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 2 * 1024 * 1024) { await reader.cancel(); throw Error('body limit') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return body
}
export async function jwtProxy(request, env, send) {
  let upstream, frontend
  try {
    upstream = new URL(env.API_PUBLIC_URL)
    frontend = new URL(env.FRONTEND_ORIGIN)
    if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash
      || frontend.protocol !== 'https:' || frontend.origin !== env.FRONTEND_ORIGIN) throw Error('invalid config')
  } catch { return failure(503, 'DEPLOYMENT_NOT_CONFIGURED') }
  const url = new URL(request.url), auth = authPaths.has(url.pathname)
  if (!url.pathname.startsWith('/api/')) return failure(404, 'NOT_FOUND')
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return failure(405, 'METHOD_NOT_ALLOWED')
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') && request.headers.get('origin') !== frontend.origin) return failure(403, 'ORIGIN_FORBIDDEN')
  const headers = new Headers()
  for (const name of ['accept', 'content-type', 'idempotency-key', 'origin', 'x-csrf-token']) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name))
  }
  const bearer = request.headers.get('authorization')
  if (bearer?.startsWith('Bearer ')) headers.set('authorization', bearer)
  if (auth && request.headers.has('cookie')) {
    const cookies = request.headers.get('cookie').split(';').map(c => c.trim()).filter(c => /^(?:JSESSIONID|seam_refresh)=[A-Za-z0-9._-]{1,256}$/.test(c))
    if (cookies.length) headers.set('cookie', cookies.join('; '))
  }
  let body
  try { body = ['GET', 'HEAD'].includes(request.method) ? undefined : await limitedBody(request) }
  catch { return failure(413, 'REQUEST_TOO_LARGE') }
  upstream.pathname = url.pathname; upstream.search = url.search
  try {
    const response = await send(upstream, { method: request.method, headers, body, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(12_000) })
    const redirect = response.status >= 300 && response.status < 400
    const destination = response.headers.get('location')
    if (redirect && (!destination || !allowedRedirect(url.pathname, destination, frontend.origin))) return failure(502, 'UPSTREAM_REDIRECT')
    const output = new Headers(noStore)
    for (const name of ['content-type', 'idempotency-key', 'www-authenticate', 'retry-after']) {
      if (response.headers.has(name)) output.set(name, response.headers.get(name))
    }
    if (destination && (redirect || /^\/api\/(?:notes|folders)\/[0-9a-f-]+$/i.test(destination))) output.set('location', destination)
    if (auth) {
      for (const cookie of response.headers.getSetCookie()) {
        const expectedPath = cookie.startsWith('seam_refresh=') ? '/api/auth' : cookie.startsWith('JSESSIONID=') ? '/' : null
        const path = /;\s*Path=([^;]+)/i.exec(cookie)?.[1]
        if (expectedPath && path === expectedPath && !/;\s*Domain=/i.test(cookie)
          && /;\s*HttpOnly(?:;|$)/i.test(cookie) && /;\s*Secure(?:;|$)/i.test(cookie) && /;\s*SameSite=Lax(?:;|$)/i.test(cookie)) output.append('set-cookie', cookie)
      }
    }
    return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers: output })
  } catch { return failure(502, 'UPSTREAM_UNAVAILABLE') }
}
