// Server-only same-origin proxy. Caddy verifies the browser's Basic credentials.
// Do not inject a shared credential: an anonymous Vercel caller must remain anonymous.
const noStore = { 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store', 'Vercel-CDN-Cache-Control': 'no-store' }
const failure = (status, code) => Response.json({ code, message: '배포 API 연결 또는 검증용 접근 권한을 확인해주세요.', errors: [] }, { status, headers: noStore })

export async function proxy(request, env = process.env, send = fetch) {
  let upstream
  try {
    upstream = new URL(env.API_PUBLIC_URL)
    if (upstream.protocol !== 'https:' || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash) throw Error('Invalid origin')
    const frontend = new URL(env.FRONTEND_ORIGIN)
    if (frontend.protocol !== 'https:' || frontend.origin !== env.FRONTEND_ORIGIN) throw Error('Invalid frontend origin')
  } catch { return failure(503, 'DEPLOYMENT_NOT_CONFIGURED') }

  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/')) return failure(404, 'NOT_FOUND')
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return failure(405, 'METHOD_NOT_ALLOWED')
  // Reject cross-site browser writes; Caddy repeats this check on its public host.
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') && request.headers.get('origin') !== env.FRONTEND_ORIGIN) return failure(403, 'ORIGIN_FORBIDDEN')
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Basic ')) {
    const denied = failure(401, 'VALIDATION_ACCESS_REQUIRED')
    denied.headers.set('WWW-Authenticate', 'Basic realm="Seam Note validation", charset="UTF-8"')
    return denied
  }
  const headers = new Headers()
  for (const name of ['accept', 'content-type', 'authorization', 'idempotency-key', 'origin']) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name))
  }
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer()
  if (body && body.byteLength > 2 * 1024 * 1024) return failure(413, 'REQUEST_TOO_LARGE')
  // Assign path rather than resolving it: //evil.example must never change the host.
  upstream.pathname = url.pathname
  upstream.search = url.search
  try {
    const response = await send(upstream, { method: request.method, headers, body,
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(12_000) })
    if (response.status >= 300 && response.status < 400) return failure(502, 'UPSTREAM_REDIRECT')
    const output = new Headers(noStore)
    for (const name of ['content-type', 'idempotency-key', 'www-authenticate', 'location']) {
      if (response.headers.has(name)) output.set(name, response.headers.get(name))
    }
    return new Response(response.body, { status: response.status, headers: output })
  } catch { return failure(502, 'UPSTREAM_UNAVAILABLE') }
}

export default { fetch: request => proxy(request) }
