import type { Note, UUID } from '@/lib/api/types'

/** Never let cached/late detail for a different ID reach the editor. */
export function selectedNoteDetail(selectedId: UUID | null, detail: Note | undefined): Note | null {
  return selectedId && detail?.id === selectedId ? detail : null
}
