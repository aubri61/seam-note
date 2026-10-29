import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import axios, { AxiosError, CanceledError } from 'axios'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { load } from './helpers/loadModules.mjs'

const { ApiError, apiClient } = await load('lib/api/client')
const { getRootFolders, getChildFolders, getFolder } = await load('features/folders/folderApi')
const { getFolderNoteSummaries, getNote } = await load('features/notes/noteApi')
const { folderKeys, noteKeys } = await load('lib/query/queryKeys')
const { folderQueries } = await load('features/folders/folderQueries')
const { noteQueries } = await load('features/notes/noteQueries')
const { getWorkspaceTree } = await load('features/workspace/workspaceApi')
// Query contract tests isolate persistence; real IndexedDB is covered by PWA/browser tests.
const { workspaceStorage } = await load('features/offline/workspaceCache')
workspaceStorage.initialize = async () => {}
workspaceStorage.save = async () => {}
workspaceStorage.local = async () => ({entities:[],pendingIds:[]})
const { workspaceTreeQuery } = await load('features/workspace/workspaceQueries')
const { selectedNoteDetail } = await load('features/notes/notePresentation')
const { queryClient } = await load('lib/query/queryClient')
after(() => queryClient.clear())
const folderId = '00000000-0000-4000-8000-000000000001'
const noteId = '00000000-0000-4000-8000-000000000002'
const folder = { id: folderId, parentId: null, name: '소설', sortOrder: 0, version: 0, createdAt: '2026-10-25T00:00:00Z', updatedAt: '2026-10-25T00:00:00Z' }
const note = { id: noteId, folderId, title: '', content: '', sortOrder: 0, version: 2, createdAt: folder.createdAt, updatedAt: folder.updatedAt }
const summary = { id: note.id, folderId, title: '', sortOrder: 0, version: 2, updatedAt: note.updatedAt }
function stub(t, handler) {
  const original = apiClient.defaults.adapter
  apiClient.defaults.adapter = handler
  t.after(() => { apiClient.defaults.adapter = original })
}
function response(config, data, status = 200) {
  const result = { config, data, status, statusText: '', headers: {} }
  if (status >= 400) throw new AxiosError('HTTP failure', AxiosError.ERR_BAD_RESPONSE, config, undefined, result)
  return result
}

test('Axios instance and all six GET functions match controller routes', async t => {
  assert.equal(apiClient.defaults.baseURL, '/api')
  const workspace = { folders: [folder], notes: [summary] }
  let expectedUrl, expectedBody, calls = 0
  stub(t, async config => {
    calls++
    assert.equal(apiClient.getUri(config), expectedUrl)
    assert.equal(config.method, 'get')
    assert.equal(config.data, undefined)
    return response(config, expectedBody)
  })
  for (const [url, body, request] of [
    ['/api/folders?parentId=root', [folder], () => getRootFolders()],
    [`/api/folders/${folderId}/children`, [folder], () => getChildFolders(folderId)],
    [`/api/folders/${folderId}`, folder, () => getFolder(folderId)],
    [`/api/folders/${folderId}/notes`, [summary], () => getFolderNoteSummaries(folderId)],
    [`/api/notes/${noteId}`, note, () => getNote(noteId)],
    ['/api/workspace/tree', workspace, () => getWorkspaceTree()],
  ]) {
    expectedUrl = url; expectedBody = body
    assert.deepEqual(await request(), body)
  }
  assert.equal(calls, 6)
})

test('backend validation, missing resource and conflict errors retain the contract', async t => {
  let status, payload
  stub(t, async config => response(config, payload, status))
  for (const pair of [[400, 'INVALID_REQUEST'], [404, 'NOTE_NOT_FOUND'], [409, 'VERSION_CONFLICT']]) {
    status = pair[0]
    payload = { code: pair[1], message: '서버 메시지', errors: status === 400 ? [{ field: 'expectedVersion', message: '필수' }] : [] }
    await assert.rejects(getNote(noteId), error => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, status)
      assert.equal(error.code, payload.code)
      assert.equal(error.message, payload.message)
      assert.deepEqual(error.errors, payload.errors)
      assert.deepEqual(error.responseBody, payload)
      return true
    })
  }
})

test('non-JSON proxy errors retain HTTP status and raw body', async t => {
  stub(t, async config => response(config, '<html>Bad gateway</html>', 502))
  await assert.rejects(getRootFolders(), error => error instanceof ApiError && error.status === 502
    && error.code === 'HTTP_ERROR' && error.responseBody === '<html>Bad gateway</html>')
})

test('HTML/empty/null/primitive success cannot masquerade as DTO data', async t => {
  let body
  stub(t, async config => response(config, body))
  for (body of ['<html>Vite fallback</html>', '', null, true, 3, 'text']) {
    await assert.rejects(getRootFolders(), error => error instanceof ApiError && error.code === 'INVALID_RESPONSE')
  }
})

test('Axios connection failure is a NETWORK_ERROR with original cause', async t => {
  const cause = new AxiosError('connection refused', AxiosError.ERR_NETWORK)
  stub(t, async () => { throw cause })
  await assert.rejects(getRootFolders(), error => error instanceof ApiError && error.status === 0
    && error.code === 'NETWORK_ERROR' && error.cause === cause)
})

test('Axios transport failure without a response is distinct from HTTP errors', async t => {
  stub(t, async () => { throw new AxiosError('response interrupted', AxiosError.ERR_BAD_RESPONSE) })
  await assert.rejects(getRootFolders(), error => error instanceof ApiError && error.status === 0 && error.code === 'NETWORK_ERROR')
})

test('AbortSignal reaches Axios and cancellation is not an ApiError', async t => {
  const controller = new AbortController()
  stub(t, async config => {
    assert.equal(config.signal, controller.signal)
    return new Promise((_, reject) => config.signal.addEventListener('abort', () => reject(new CanceledError('cancelled', config)), { once: true }))
  })
  const pending = getNote(noteId, { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, error => axios.isCancel(error) && !(error instanceof ApiError))
})

test('cache separates roots/children/details and summaries/full notes', async () => {
  const client = new QueryClient()
  try {
    client.setQueryData(folderKeys.roots(), [folder])
    client.setQueryData(folderKeys.children(folderId), [])
    client.setQueryData(folderKeys.detail(folderId), folder)
    client.setQueryData(noteKeys.byFolder(folderId), [summary])
    client.setQueryData(noteKeys.detail(noteId), note)
    assert.equal(client.getQueryCache().getAll().length, 5)
    await client.invalidateQueries({ queryKey: folderKeys.all })
    assert.equal(client.getQueryState(folderKeys.detail(folderId)).isInvalidated, true)
    assert.equal(client.getQueryState(noteKeys.detail(noteId)).isInvalidated, false)
    assert.deepEqual(client.getQueryData(noteKeys.byFolder(folderId)), [summary])
    assert.deepEqual(client.getQueryData(noteKeys.detail(noteId)), note)
  } finally { client.clear() }
})

test('workspace Query reuses a single cached metadata request', async t => {
  queryClient.clear()
  const body = { folders: [folder], notes: [summary] }
  let calls = 0
  stub(t, async config => {
    calls++
    assert.ok(config.signal instanceof AbortSignal)
    return response(config, body)
  })
  assert.deepEqual(await queryClient.fetchQuery(workspaceTreeQuery()), body)
  assert.deepEqual(await queryClient.fetchQuery(workspaceTreeQuery()), body)
  assert.equal(calls, 1)
  queryClient.clear()
})

test('parameterized queries remain idle without IDs', async t => {
  let calls = 0
  stub(t, async () => { calls++; throw new Error('must not request') })
  const client = new QueryClient()
  try {
    for (const options of [folderQueries.children(null), folderQueries.detail(undefined), noteQueries.byFolder(null), noteQueries.detail(undefined)]) {
      const observer = new QueryObserver(client, options)
      const unsubscribe = observer.subscribe(() => {})
      assert.equal(observer.getCurrentResult().fetchStatus, 'idle')
      unsubscribe()
    }
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(calls, 0)
  } finally { client.clear() }
})

test('cancelQueries aborts the actual Axios request', async t => {
  let signal
  stub(t, async config => {
    signal = config.signal
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new CanceledError('cancelled', config)), { once: true }))
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    const pending = client.fetchQuery(noteQueries.detail(noteId))
    const rejected = assert.rejects(pending)
    await client.cancelQueries({ queryKey: noteKeys.detail(noteId) })
    await rejected
    assert.equal(signal.aborted, true)
    assert.equal(client.getQueryData(noteKeys.detail(noteId)), undefined)
  } finally { client.clear() }
})

test('late A response cannot replace selected B data', async t => {
  const releases = new Map()
  stub(t, config => new Promise(resolve => releases.set(config.url, data => resolve(response(config, data)))))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const aId = 'note-A', bId = 'note-B'
  try {
    const observer = new QueryObserver(client, noteQueries.detail(aId))
    const seen = []
    let selected = aId
    const unsubscribe = observer.subscribe(result => seen.push(selectedNoteDetail(selected, result.data)?.id ?? null))
    selected = bId
    observer.setOptions(noteQueries.detail(bId))
    const b = { ...note, id: bId, title: 'B', content: 'B body' }
    releases.get('/notes/' + bId)(b)
    await new Promise(resolve => setImmediate(resolve))
    releases.get('/notes/' + aId)({ ...note, id: aId, title: 'A', content: 'A body' })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(observer.getCurrentResult().data.id, bId)
    assert.ok(seen.includes(bId))
    assert.ok(seen.every(id => id === null || id === bId))
    assert.equal(selectedNoteDetail(bId, { ...note, id: aId }), null)
    unsubscribe()
  } finally { client.clear() }
})

test('retry excludes 4xx/invalid responses and bounds transient retries', () => {
  const retry = queryClient.getDefaultOptions().queries.retry
  const error = status => new ApiError(status, { code: 'TEST', message: 'test', errors: [] })
  for (const status of [400, 404, 409, 200]) assert.equal(retry(0, error(status)), false)
  assert.equal(retry(0, error(0)), true)
  assert.equal(retry(0, error(503)), true)
  assert.equal(retry(1, error(503)), false)
})
