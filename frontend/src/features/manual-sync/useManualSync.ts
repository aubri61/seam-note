import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Note } from '@/lib/api/types'
import { ApiError } from '@/lib/api/client'
import type { DraftEntry, DraftSession } from '@/features/local-drafts/draftSession'
import type { NoteUpdateOperation } from '@/features/outbox/outboxModel'
import { noteKeys, workspaceKeys } from '@/lib/query/queryKeys'
import { sendNoteSnapshot, syncOneNote } from './manualSync'
import { outboxRepository } from '@/features/outbox/outboxRepository'
import { creationStorage } from '@/features/outbox/creationStorage'
import { syncLocalNote, manualOperations } from './creationSync'
import { isManualSyncNote, manualSaveState } from './syncContract'

export function useManualSync(noteId: string | null, session: DraftSession, entry: DraftEntry | undefined, available: boolean) {
  const running = useRef(false)
  const [state, setState] = useState({ noteId: '', busy: false, message: '', error: false, revision: -1, missing: false })
  const [outbox, setOutbox] = useState<{ noteId: string | null; entry?: DraftEntry; busy: boolean; operations?: {status:NoteUpdateOperation['status']}[]; error: boolean }>({ noteId: null, busy: false, error: false })
  const client = useQueryClient()
  const context = useRef({ noteId, available })
  useEffect(() => { context.current = { noteId, available } }, [noteId, available])
  useEffect(() => {
    if (!isManualSyncNote(noteId)) return
    let disposed = false, sequence = 0
    const read = () => {
      const request = ++sequence
      void manualOperations(noteId!).then(operations => {
        if (!disposed && request === sequence) setOutbox({ noteId, entry, busy: state.busy, operations, error: false })
      }).catch(() => {
        if (!disposed && request === sequence) setOutbox({ noteId, entry, busy: state.busy, error: true })
      })
    }
    read()
    window.addEventListener('focus', read)
    document.addEventListener('visibilitychange', read)
    return () => { disposed = true; window.removeEventListener('focus', read); document.removeEventListener('visibilitychange', read) }
  }, [noteId, entry, state.busy, state.message])
  const current = outbox.noteId === noteId && outbox.entry === entry && outbox.busy === state.busy
  const missing = state.noteId === noteId && state.missing
  const view = manualSaveState(noteId, entry, available && !missing, current ? outbox.operations : undefined, current && outbox.error, state.busy)
  async function sync() {
    if (view.disabled || !noteId || running.current) return
    const id = noteId
    running.current = true; setState({ noteId: id, busy: true, message: '최신 로컬 저장을 확인하고 있습니다.', error: false, revision: -1, missing: false })
    let creationUnconfirmed=false
    try {
      const local=await creationStorage.local(id)
      creationUnconfirmed=!!local&&!local.confirmed
      const created = await syncLocalNote(id, session, () => context.current.noteId === id && context.current.available)
      creationUnconfirmed=false
      const updated = await syncOneNote(id, session, {
        storage: outboxRepository, send: sendNoteSnapshot, locks: navigator.locks,
        canSend: () => context.current.noteId === id && context.current.available,
      })
      const result = updated.kind === 'unchanged' && created ? {kind:'synced' as const,note:created,hasNewerChanges:false} : updated
      if (result.kind === 'synced') {
        client.setQueryData<Note>(noteKeys.detail(id), current => current && current.version > result.note.version ? current : result.note)
        void client.invalidateQueries({ queryKey: workspaceKeys.tree() })
      }
      setState({ noteId: id, busy: false, error: false, missing: false, revision: session.getSnapshot()[id]?.revision ?? -1,
        message: result.kind === 'unchanged' ? '서버에 전송할 변경사항이 없습니다.' : `전송한 원고의 서버 저장과 로컬 확인이 완료됐습니다.${result.hasNewerChanges ? ' 새 입력은 아직 서버에 저장되지 않았습니다.' : ''}` })
    } catch (error) {
      let cause: unknown = error, notFound = false
      for (let depth = 0; cause instanceof Error && depth < 5; depth++, cause = cause.cause) {
        if (cause instanceof ApiError && cause.status === 404) notFound = true
      }
      if(creationUnconfirmed)notFound=false
      if (notFound) {
        void client.invalidateQueries({ queryKey: workspaceKeys.tree() })
        void client.invalidateQueries({ queryKey: noteKeys.detail(id) })
      }
      setState({ noteId: id, busy: false, error: true, revision: -1, missing: notFound,
        message: notFound ? '서버에서 원고를 찾을 수 없습니다. 로컬 원고와 작업을 보존하고 전송을 차단했습니다.'
          : error instanceof Error ? error.message : '서버 저장을 중단했습니다.' })
    } finally { running.current = false }
  }
  const showResult = state.noteId === noteId && (state.busy || state.error || state.revision === entry?.revision)
  return { disabled: view.disabled, busy: state.busy, summary: view.summary, remaining: view.remaining,
    message: showResult ? state.message : '', error: showResult && state.error, onSync: () => { void sync() } }
}
