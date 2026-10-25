import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AxiosError } from 'axios'
import { MutationObserver, QueryClient, QueryObserver, onlineManager } from '@tanstack/react-query'
import { load } from './helpers/loadModules.mjs'
const { apiClient, ApiError } = await load('lib/api/client')
const { createFolder } = await load('features/folders/folderApi')
const { createNote, deleteNote } = await load('features/notes/noteApi')
const { createFolderMutationOptions, createNoteMutationOptions, deleteNoteMutationOptions } = await load('features/workspace/workspaceMutations')
const { noteQueries } = await load('features/notes/noteQueries')
const { workspaceTreeQuery } = await load('features/workspace/workspaceQueries')
const { workspaceKeys, folderKeys, noteKeys } = await load('lib/query/queryKeys')
const { buildWorkspaceTree } = await load('features/workspace/workspaceTree')
const { nextNoteAfterDeletion, folderChoices } = await load('features/workspace/workspaceActions')
const stamp = '2026-10-25T00:00:00Z'
const folder = { id: '00000000-0000-4000-8000-000000000001', parentId: null, name: '소설', sortOrder: 0, version: 0, createdAt: stamp, updatedAt: stamp }
const a = { id: '00000000-0000-4000-8000-000000000002', folderId: folder.id, title: 'A', content: 'A body', sortOrder: 0, version: 0, createdAt: stamp, updatedAt: stamp }
const b = { ...a, id: '00000000-0000-4000-8000-000000000003', title: 'B', content: 'B body', sortOrder: 1 }
const summary = ({ id, folderId, title, sortOrder, version, updatedAt }) => ({ id, folderId, title, sortOrder, version, updatedAt })
const seed = () => ({ folders: [folder], notes: [summary(a), summary(b)] })
function client(t) {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } } })
  t.after(() => value.clear())
  value.setQueryData(workspaceKeys.tree(), seed())
  return value
}
function stub(t, handle) {
  const original = apiClient.defaults.adapter
  apiClient.defaults.adapter = handle
  t.after(() => { apiClient.defaults.adapter = original })
}
function reply(config, data, status = 200) { return { config, data, status, statusText: '', headers: {} } }
function reject(config, status = 500) {
  throw new AxiosError('failed', AxiosError.ERR_BAD_RESPONSE, config, undefined,
    reply(config, { code: 'DATA_CONFLICT', message: '요청 실패', errors: [] }, status))
}
async function settle(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.fail('query did not settle')
}

test('POST Folder/Note and bodyless 204 DELETE use actual Axios contracts', async t => {
  const calls = []
  stub(t, async config => {
    const body = config.data ? JSON.parse(config.data) : undefined
    calls.push([config.method, apiClient.getUri(config), body])
    return reply(config, config.method === 'delete' ? '' : config.url === '/folders' ? folder : a, config.method === 'delete' ? 204 : 201)
  })
  const f = { id: folder.id, parentId: null, name: '소설' }
  const n = { id: a.id, folderId: folder.id, title: '', content: '' }
  assert.deepEqual(await createFolder(f), folder)
  assert.deepEqual(await createNote(n), a)
  assert.equal(await deleteNote(a.id), undefined)
  assert.deepEqual(calls, [['post', '/api/folders', f], ['post', '/api/notes', n], ['delete', '/api/notes/' + a.id, undefined]])
})

test('creation has no optimistic note, then seeds exact detail and refetches Infinity metadata', async t => {
  const qc = client(t)
  const created = { ...a, id: '00000000-0000-4000-8000-000000000004', title: '', content: '', sortOrder: 2 }
  let release, gets = 0, selected = null
  stub(t, async config => {
    if (config.method === 'post') return new Promise(resolve => { release = () => resolve(reply(config, created, 201)) })
    gets++
    return reply(config, { folders: [folder], notes: [...seed().notes, summary(created)] })
  })
  const query = new QueryObserver(qc, workspaceTreeQuery())
  const unsubscribe = query.subscribe(() => {})
  t.after(unsubscribe)
  const mutation = new MutationObserver(qc, createNoteMutationOptions(qc, note => {
    assert.deepEqual(qc.getQueryData(noteKeys.detail(note.id)), note)
    selected = note.id
  }))
  const pending = mutation.mutate({ id: created.id, folderId: folder.id, title: '', content: '' })
  await settle(() => !!release)
  assert.deepEqual(qc.getQueryData(workspaceKeys.tree()), seed())
  assert.equal(selected, null)
  release()
  await pending
  await settle(() => gets === 1 && !query.getCurrentResult().isFetching)
  assert.equal(selected, created.id)
  const cached = qc.getQueryData(workspaceKeys.tree()).notes.find(n => n.id === created.id)
  assert.deepEqual(cached, summary(created))
  assert.equal('content' in cached, false)
  assert.equal(mutation.getCurrentResult().isSuccess, true)
})

test('Folder creation supports root and child, updates cache only on success', async t => {
  const qc = client(t)
  qc.setQueryData(folderKeys.roots(), [folder])
  const child = { ...folder, id: '00000000-0000-4000-8000-000000000005', parentId: folder.id, name: '하위' }
  let result = child, selected
  stub(t, async config => reply(config, result, 201))
  const mutation = new MutationObserver(qc, createFolderMutationOptions(qc, value => { selected = value.id }))
  await mutation.mutate({ id: child.id, parentId: folder.id, name: '하위' })
  assert.equal(selected, child.id)
  assert.equal(qc.getQueryData(workspaceKeys.tree()).folders.length, 2)
  result = { ...child, id: '00000000-0000-4000-8000-000000000006', parentId: null }
  await mutation.mutate({ id: result.id, parentId: null, name: result.name })
  assert.equal(qc.getQueryState(folderKeys.roots()).isInvalidated, true)
  assert.deepEqual(qc.getQueryData(folderKeys.detail(result.id)), result)
})

test('failed creations retain metadata/selection and do not retry despite client defaults', async t => {
  const qc = client(t)
  let calls = 0, effects = 0
  stub(t, async config => { calls++; return reject(config) })
  for (const options of [createNoteMutationOptions(qc, () => effects++), createFolderMutationOptions(qc, () => effects++)]) {
    const mutation = new MutationObserver(qc, options)
    await assert.rejects(mutation.mutate({ id: a.id, folderId: folder.id, title: '', content: '', name: '폴더' }), error => error instanceof ApiError)
    assert.deepEqual(qc.getQueryData(workspaceKeys.tree()), seed())
  }
  assert.equal(calls, 2)
  assert.equal(effects, 0)
})

test('network-failed creation is attempted once and not queued as an offline write', async t => {
  const qc = client(t)
  let calls = 0
  stub(t, async () => { calls++; throw new AxiosError('network', AxiosError.ERR_NETWORK) })
  onlineManager.setOnline(false)
  try {
    const mutation = new MutationObserver(qc, createNoteMutationOptions(qc))
    await assert.rejects(mutation.mutate({ id: a.id, folderId: folder.id, title: '', content: '' }), error => error.code === 'NETWORK_ERROR')
    assert.equal(calls, 1)
    assert.equal(mutation.getCurrentResult().isPaused, false)
    assert.deepEqual(qc.getQueryData(workspaceKeys.tree()), seed())
  } finally { onlineManager.setOnline(true) }
})

test('DELETE success removes exact detail, preserves other notes, invalidates metadata and lists', async t => {
  const qc = client(t)
  qc.setQueryData(noteKeys.detail(a.id), a)
  qc.setQueryData(noteKeys.detail(b.id), b)
  qc.setQueryData(noteKeys.byFolder(folder.id), seed().notes)
  let before, deleted
  stub(t, async config => reply(config, '', 204))
  await new MutationObserver(qc, deleteNoteMutationOptions(qc, (id, data) => { deleted = id; before = data })).mutate(a.id)
  assert.equal(deleted, a.id)
  assert.deepEqual(before, seed())
  assert.equal(qc.getQueryData(noteKeys.detail(a.id)), undefined)
  assert.deepEqual(qc.getQueryData(noteKeys.detail(b.id)), b)
  assert.deepEqual(qc.getQueryData(workspaceKeys.tree()).notes, [summary(b)])
  assert.equal(qc.getQueryState(workspaceKeys.tree()).isInvalidated, true)
  assert.equal(qc.getQueryState(noteKeys.byFolder(folder.id)).isInvalidated, true)
})

test('failed DELETE does not clear cache or call selection recovery and never retries', async t => {
  const qc = client(t)
  qc.setQueryData(noteKeys.detail(a.id), a)
  let calls = 0, selection = a.id
  stub(t, async config => { calls++; return reject(config) })
  await assert.rejects(new MutationObserver(qc, deleteNoteMutationOptions(qc, () => { selection = b.id })).mutate(a.id))
  assert.equal(calls, 1)
  assert.equal(selection, a.id)
  assert.deepEqual(qc.getQueryData(workspaceKeys.tree()), seed())
  assert.deepEqual(qc.getQueryData(noteKeys.detail(a.id)), a)
})

test('successful write stays successful if subsequent metadata GET fails', async t => {
  const qc = client(t)
  qc.setQueryData(noteKeys.detail(a.id), a)
  stub(t, async config => config.method === 'delete' ? reply(config, '', 204) : reject(config))
  const query = new QueryObserver(qc, workspaceTreeQuery())
  const unsubscribe = query.subscribe(() => {})
  t.after(unsubscribe)
  const mutation = new MutationObserver(qc, deleteNoteMutationOptions(qc))
  await mutation.mutate(a.id)
  await settle(() => query.getCurrentResult().isError)
  assert.equal(mutation.getCurrentResult().isSuccess, true)
  assert.deepEqual(qc.getQueryData(workspaceKeys.tree()).notes, [summary(b)])
  assert.equal(qc.getQueryData(noteKeys.detail(a.id)), undefined)
})

test('deletion selection uses next, previous, and empty in full sorted display order', () => {
  const tree = buildWorkspaceTree(seed())
  assert.equal(nextNoteAfterDeletion(tree, a.id), b.id)
  assert.equal(nextNoteAfterDeletion(tree, b.id), a.id)
  assert.equal(nextNoteAfterDeletion(buildWorkspaceTree({ folders: [folder], notes: [summary(a)] }), a.id), null)
  assert.equal(nextNoteAfterDeletion(buildWorkspaceTree({ folders: [], notes: [] }), a.id), null)
  assert.deepEqual(folderChoices(tree), [{ id: folder.id, label: folder.name }])
})


test('DELETE cancels a pending detail so its late completion cannot restore the removed cache', async t => {
  const qc = client(t)
  let release
  stub(t, async config => {
    if (config.method === 'delete') return reply(config, '', 204)
    if (config.url === '/notes/' + a.id) return new Promise(resolve => { release = () => resolve(reply(config, a)) })
    return reply(config, b)
  })
  const observer = new QueryObserver(qc, noteQueries.detail(a.id))
  const unsubscribe = observer.subscribe(() => {})
  t.after(unsubscribe)
  await settle(() => !!release)
  await new MutationObserver(qc, deleteNoteMutationOptions(qc, () => observer.setOptions(noteQueries.detail(b.id)))).mutate(a.id)
  release()
  await settle(() => observer.getCurrentResult().data?.id === b.id)
  assert.equal(qc.getQueryData(noteKeys.detail(a.id)), undefined)
  assert.deepEqual(observer.getCurrentResult().data, b)
})

test('same UUID retry after an accepted but lost POST returns duplicate conflict, not idempotent success', async t => {
  let accepted = false, requests = 0, created = 0
  const payload = { id: a.id, folderId: folder.id, title: '', content: '' }
  stub(t, async config => {
    requests++
    assert.deepEqual(JSON.parse(config.data), payload)
    if (!accepted) {
      accepted = true; created++
      throw new AxiosError('response lost', AxiosError.ERR_NETWORK)
    }
    throw new AxiosError('duplicate', AxiosError.ERR_BAD_REQUEST, config, undefined,
      reply(config, { code: 'DUPLICATE_ENTITY_ID', message: '이미 사용 중인 ID', errors: [] }, 409))
  })
  await assert.rejects(createNote(payload), error => error.code === 'NETWORK_ERROR')
  await assert.rejects(createNote(payload), error => error.status === 409 && error.code === 'DUPLICATE_ENTITY_ID')
  assert.equal(requests, 2)
  assert.equal(created, 1)
})

test('creation destination restores selected folder / selected note / active fallback rules', async () => {
  const { creationParent } = await load('features/workspace/workspaceActions')
  const child = { ...folder, id: 'child', parentId: folder.id }
  const tree = buildWorkspaceTree({ folders: [folder, child], notes: [summary(a)] })
  assert.equal(creationParent(tree, null, a.id), folder.id)
  assert.equal(creationParent(tree, { kind: 'folder', id: child.id }, a.id), child.id)
  assert.equal(creationParent(tree, { kind: 'note', id: a.id }, a.id), folder.id)
  assert.equal(creationParent(tree, { kind: 'folder', id: 'missing' }, a.id), folder.id)
  assert.equal(creationParent(buildWorkspaceTree({ folders: [], notes: [] }), null, null), null)
})

test('inline folder rename PATCH updates confirmed metadata, detail and invalidation only on success', async t => {
  const { renameFolderMutationOptions } = await load('features/workspace/workspaceMutations')
  const qc = client(t), calls = []
  let fail = true
  stub(t, async config => {
    calls.push([config.method, apiClient.getUri(config), JSON.parse(config.data)])
    if (fail) return reject(config)
    return reply(config, { ...folder, name: '작성 폴더', version: 1 })
  })
  const mutation = new MutationObserver(qc, renameFolderMutationOptions(qc))
  const variables = { id: folder.id, name: '작성 폴더' }
  await assert.rejects(mutation.mutate(variables), ApiError)
  assert.deepEqual(qc.getQueryData(workspaceKeys.tree()), seed())
  assert.equal(calls.length, 1)
  fail = false
  await mutation.mutate(variables)
  assert.equal(qc.getQueryData(workspaceKeys.tree()).folders[0].name, '작성 폴더')
  assert.equal(qc.getQueryData(folderKeys.detail(folder.id)).version, 1)
  assert.equal(qc.getQueryState(workspaceKeys.tree()).isInvalidated, true)
  assert.deepEqual(calls[1], ['patch', '/api/folders/' + folder.id, { name: '작성 폴더' }])
})
