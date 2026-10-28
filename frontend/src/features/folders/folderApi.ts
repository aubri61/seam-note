import { getJson, postJson, patchJson, deleteResource } from '@/lib/api/client'
import type { RequestOptions } from '@/lib/api/client'
import type { CreateFolderRequest, Folder, UUID, UpdateFolderRequest } from '@/lib/api/types'

export function getRootFolders(options?: RequestOptions): Promise<Folder[]> {
  return getJson<Folder[]>('/folders?parentId=root', options)
}

/** Only immediate child folders; does not fetch descendants or notes. */
export function getChildFolders(parentId: UUID, options?: RequestOptions): Promise<Folder[]> {
  return getJson<Folder[]>(`/folders/${encodeURIComponent(parentId)}/children`, options)
}

export function getFolder(id: UUID, options?: RequestOptions): Promise<Folder> {
  return getJson<Folder>(`/folders/${encodeURIComponent(id)}`, options)
}

export function createFolder(request: CreateFolderRequest): Promise<Folder> {
  return postJson<Folder>('/folders', request)
}

export function renameFolder({ id, ...request }: UpdateFolderRequest & { id: UUID }): Promise<Folder> {
  return patchJson<Folder>(`/folders/${encodeURIComponent(id)}`, request)
}

export function deleteFolder(id: UUID): Promise<void> {
  return deleteResource(`/folders/${encodeURIComponent(id)}`)
}
