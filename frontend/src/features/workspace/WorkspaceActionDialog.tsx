import { folderSubtree } from './workspaceActions'
import { useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import styled from '@emotion/styled'
import { ApiError } from '@/lib/api/client'
import type { Folder, NoteSummary } from '@/lib/api/types'
import type { useFolders } from '@/features/folders/useFolders'

export type WorkspaceAction = { kind: 'delete-note'; note: NoteSummary } | { kind: 'delete-folder'; folder: Folder }

const Overlay = styled(Dialog.Overlay)({ position: 'fixed', inset: 0, background: 'rgba(36,35,32,.25)', zIndex: 20 })
const Content = styled(Dialog.Content)(({ theme }) => ({
  position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 21,
  width: 'min(420px, calc(100vw - 32px))', maxHeight: '85svh', overflowY: 'auto',
  padding: theme.spacing.xl, borderRadius: theme.radii.panel, border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surface, boxShadow: theme.shadow, fontSize: '13px', lineHeight: 1.7,
  h2: { marginBottom: theme.spacing.md, fontSize: '18px' },
  button: { padding: `${theme.spacing.sm} ${theme.spacing.md}`, borderRadius: theme.radii.sm, border: `1px solid ${theme.colors.border}`, background: theme.colors.surface },
  'button[type="submit"]': { background: theme.colors.text, color: theme.colors.surface },
  'button:disabled': { opacity: .5, cursor: 'not-allowed' },
}))
const Buttons = styled.div(({ theme }) => ({ display: 'flex', justifyContent: 'flex-end', gap: theme.spacing.sm, marginTop: theme.spacing.lg }))

export function WorkspaceActionDialog({ action, folders, onClose }: {
  action: WorkspaceAction
  folders: ReturnType<typeof useFolders>
  onClose: () => void
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  const folder = action.kind === 'delete-folder'
  const error = folder ? folders.deleteFolderMutation.error : folders.deleteNoteMutation.error
  const removed = folder ? folderSubtree(folders.workspace.data,action.folder.id) : null
  const local = folder && folders.localIds.includes(action.folder.id)

  return <Dialog.Root open onOpenChange={open => { if (!open && !folders.busy) onClose() }}>
    <Dialog.Portal>
      <Overlay />
      <Content onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus() }}
        onEscapeKeyDown={event => { if (folders.busy) event.preventDefault() }}
        onPointerDownOutside={event => { if (folders.busy) event.preventDefault() }}>
        <Dialog.Title>{folder ? '폴더 삭제' : '원고 영구 삭제'}</Dialog.Title>
        <Dialog.Description>
          {folder ? `“${action.folder.name}” 폴더를 ${local ? '로컬에서 삭제하고 생성 대기를 취소' : '서버에서 영구 삭제'}합니다. 안의 모든 하위 폴더와 원고도 함께 영구 삭제되며 복구할 수 없습니다.`
            : `“${action.note.title || '제목 없는 문서'}”를 서버에서 영구 삭제합니다. 이 브라우저의 로컬 원고와 대기 작업도 함께 삭제되며 복구할 수 없습니다.`}
        </Dialog.Description>
        <form onSubmit={async event => {
          event.preventDefault()
          if (folders.busy) return
          if (await (folder ? folders.deleteFolder(action.folder.id) : folders.deleteNote(action.note.id))) onClose()
        }}>
          {removed && <p role="alert">하위 폴더 {Math.max(0,removed.folderIds.length-1)}개와 원고 {removed.noteIds.length}개를 포함해 모두 삭제합니다. 미동기화된 로컬 원고와 대기 작업도 삭제됩니다.</p>}
          {error && <div role="alert">
            <p>요청을 완료하지 못했습니다: {error.message}</p>
            {error instanceof ApiError && error.status === 0 && <p>서버에 반영됐지만 응답만 유실됐을 수 있습니다. 재요청 전 목록을 새로고침해 확인해주세요.</p>}
            <button type="button" disabled={folders.busy} onClick={() => void folders.workspace.refetch()}>목록 새로고침</button>
          </div>}
          {folders.busy && <p role="status">요청을 처리하는 중입니다.</p>}
          <Buttons>
            <button ref={cancel} type="button" disabled={folders.busy} onClick={onClose}>취소</button>
            <button type="submit" disabled={folders.busy}>영구 삭제</button>
          </Buttons>
        </form>
      </Content>
    </Dialog.Portal>
  </Dialog.Root>
}
