/** UUIDs and ISO-8601 Instants stay strings at the HTTP boundary. */
export type UUID = string
export type Instant = string

export interface Folder {
  id: UUID
  parentId: UUID | null
  name: string
  sortOrder: number
  version: number
  createdAt: Instant
  updatedAt: Instant
}

export interface Note {
  id: UUID
  folderId: UUID | null
  title: string
  content: string
  sortOrder: number
  version: number
  createdAt: Instant
  updatedAt: Instant
}

export type NoteSummary = Pick<Note, 'id' | 'folderId' | 'title' | 'sortOrder' | 'version' | 'updatedAt'>

export interface CreateFolderRequest {
  id?: UUID | null
  parentId?: UUID | null
  /** Required, non-blank, at most 200 characters; server strips surrounding whitespace. */
  name: string
}

export interface UpdateFolderRequest {
  name: string
}

export interface MoveFolderRequest {
  /** Required property; null explicitly moves the folder to the root. */
  targetParentId: UUID | null
}

export interface CreateNoteRequest {
  id?: UUID | null
  folderId: UUID | null
  /** Empty string is allowed; at most 200 characters. */
  title: string
  content: string
}

export interface UpdateNoteRequest {
  title: string
  content: string
  /** Required non-negative integer from the last server response. */
  expectedVersion: number
}

export interface MoveNoteRequest {
  targetFolderId: UUID | null
}

export interface ApiFieldError {
  field: string
  message: string
}

export interface ApiErrorResponse {
  code: string
  message: string
  errors: ApiFieldError[]
}

export interface WorkspaceTreeResponse {
  folders: Folder[]
  notes: NoteSummary[]
}
