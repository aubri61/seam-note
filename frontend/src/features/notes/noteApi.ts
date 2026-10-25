import { deleteResource, getJson, postJson } from '@/lib/api/client'
import type { RequestOptions } from '@/lib/api/client'
import type { CreateNoteRequest, Note, NoteSummary, UUID } from '@/lib/api/types'

export function getFolderNoteSummaries(folderId: UUID, options?: RequestOptions): Promise<NoteSummary[]> {
  return getJson<NoteSummary[]>(`/folders/${encodeURIComponent(folderId)}/notes`, options)
}

export function getNote(id: UUID, options?: RequestOptions): Promise<Note> {
  return getJson<Note>(`/notes/${encodeURIComponent(id)}`, options)
}

export function createNote(request: CreateNoteRequest): Promise<Note> {
  return postJson<Note>('/notes', request)
}

export function deleteNote(id: UUID): Promise<void> {
  return deleteResource(`/notes/${encodeURIComponent(id)}`)
}
