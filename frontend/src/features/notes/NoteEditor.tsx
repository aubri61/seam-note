import type { RefObject } from 'react'
import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/primitives'
import type { DraftEntry } from '@/features/local-drafts/draftSession'
import type { DraftPatch, NoteDraft } from './noteDrafts'

const Panel = styled.section(({ theme }) => ({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  background: theme.colors.surface,
}))

const Document = styled.div(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  width: '100%',
  padding: `${theme.spacing.xxxl} clamp(${theme.spacing.lg}, 7vw, calc(${theme.spacing.xxl} * 3)) ${theme.spacing.xl}`,
  [`@media (max-width: ${theme.breakpoints.mobile})`]: {
    padding: `${theme.spacing.xl} ${theme.spacing.lg} ${theme.spacing.lg}`,
  },
}))

const Title = styled.input(({ theme }) => ({
  width: '100%',
  minWidth: 0,
  padding: `${theme.spacing.xs} 0`,
  border: 0,
  background: 'transparent',
  fontSize: 'clamp(23px, 2.4vw, 36px)',
  fontWeight: 600,
  letterSpacing: '-1.2px',
  '&::placeholder': { color: theme.colors.secondary, opacity: 1 },
  '&:focus, &:focus-visible': { outline: 'none', boxShadow: 'none' },
}))

const Toolbar = styled.div(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing.xs,
  padding: `${theme.spacing.lg} 0 ${theme.spacing.lg}`,
  borderBottom: `1px solid ${theme.colors.border}`,
}))

const Writing = styled.div(({ theme }) => ({
  flex: 1,
  paddingTop: theme.spacing.xl,
  p: {
    color: theme.colors.mutedText,
    fontSize: '16px',
    lineHeight: 1.9,
  },
  textarea: {
    display: 'block',
    width: '100%',
    minHeight: '300px',
    resize: 'vertical',
    marginTop: theme.spacing.md,
    padding: `${theme.spacing.xs} 0`,
    border: 0,
    background: 'transparent',
    fontSize: '15px',
    lineHeight: 1.9,
    color: theme.colors.mutedText,
  },
  'textarea::placeholder': {
    color: theme.colors.mutedText,
    opacity: 1,
  },
  'textarea:focus, textarea:focus-visible': { outline: 'none', boxShadow: 'none' },
}))

const Footer = styled.footer(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: theme.spacing.md,
  paddingTop: theme.spacing.xxl,
  paddingBottom: theme.spacing.xxxl,
  fontSize: '11px',
  lineHeight: 1.7,
  color: theme.colors.mutedText,
  span: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
}))

const NewDocumentButton = styled.button(({ theme }) => ({
  position: 'fixed', right: theme.spacing.xl, bottom: theme.spacing.xl, zIndex: 2,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: '56px', height: '56px', padding: 0,
  border: `1px solid ${theme.colors.text}`, borderRadius: theme.radii.pill,
  background: theme.colors.text, color: theme.colors.surface, boxShadow: theme.shadow,
  fontSize: '13px', fontWeight: 600,
  transition: `opacity ${theme.motion.duration[100]} ${theme.motion.easing.standard}`,
  '&:hover': { opacity: .85 },
  '&:disabled': { opacity: .4, cursor: 'not-allowed' },
  [`@media (max-width: ${theme.breakpoints.mobile})`]: { right: theme.spacing.md, bottom: theme.spacing.md },
}))

export function NoteEditor({ draft, onEdit, localEntry, onRetryLocal, selectedNoteId, titleRef, loading, error, onRetry, canRetry, busy, canCreate, canDelete, onCreateNote, onDeleteNote }: {
  draft: NoteDraft | null
  localEntry?: DraftEntry
  onRetryLocal: () => void
  onEdit: (noteId: string, patch: DraftPatch) => void
  selectedNoteId: string | null
  titleRef: RefObject<HTMLInputElement | null>
  loading: boolean
  error: Error | null
  onRetry: () => void
  canRetry: boolean
  busy: boolean
  canCreate: boolean
  canDelete: boolean
  onCreateNote: () => void
  onDeleteNote: () => void
}) {
  const visible = draft?.noteId === selectedNoteId ? draft : null
  return (
    <Panel aria-label="노트 편집기" data-note-id={visible?.noteId ?? undefined} aria-busy={loading}>
      <Document>
        {loading && <p role="status">원고 로딩 중</p>}
        {error && <div role="alert"><p>원고 조회 실패: {error.message}</p>{canRetry && <button type="button" onClick={onRetry}>다시 시도</button>}</div>}
        {!loading && !error && !visible && <p role="status">{selectedNoteId ? '원고를 선택해주세요.' : '표시할 원고가 없습니다.'}</p>}
        {localEntry?.error && <div role="alert">
          <p>{localEntry.error}</p>
          <button type="button" onClick={onRetryLocal}>{localEntry.phase === 'conflict' ? '로컬 저장 상태 다시 확인' : '로컬 저장 다시 시도'}</button>
        </div>}
        <Title ref={titleRef} aria-label="문서 제목" placeholder={visible ? '제목 없음' : ''} value={visible?.title ?? ''} maxLength={200}
          readOnly={!visible} onChange={event => { if (visible) onEdit(visible.noteId, { title: event.target.value }) }} />
        <Toolbar role="group" aria-label="Formatting preview (not connected)">
          <IconButton type="button" disabled aria-label="Bold (coming later)" title="Formatting is not connected">
            <strong style={{ fontSize: 18 }}>B</strong>
          </IconButton>
          <IconButton type="button" disabled aria-label="Italic (coming later)" title="Formatting is not connected">
            <i style={{ fontFamily: 'Georgia, serif', fontSize: 20 }}>I</i>
          </IconButton>
          <IconButton type="button" disabled aria-label="Bullet list (coming later)" title="Formatting is not connected">
            <Icon name="list" size={19} />
          </IconButton>
          <IconButton type="button" disabled aria-label="Numbered list (coming later)" title="Formatting is not connected">
            <Icon name="ordered" size={19} />
          </IconButton>
          <IconButton type="button" aria-label="원고 삭제" title="원고 삭제" disabled={busy || !canDelete} onClick={onDeleteNote} style={{ marginLeft: 'auto' }}><Icon name="trash" size={18} /></IconButton>
        </Toolbar>
        <Writing>
          <textarea aria-label="문서 내용" placeholder="" value={visible?.content ?? ''} readOnly={!visible}
            onChange={event => { if (visible) onEdit(visible.noteId, { content: event.target.value }) }} />
        </Writing>
        <Footer>
          <span>원고는 이 브라우저에 로컬 저장되며 자동으로 서버에 전송되지 않습니다. 저장 완료 전 종료하면 최신 입력이 유실될 수 있고, 브라우저 저장소 삭제·회수 시 로컬 원고도 사라질 수 있습니다.</span>
        </Footer>
      </Document>
      <NewDocumentButton type="button" disabled={busy || !canCreate} onClick={onCreateNote} aria-label="새 문서" title="빈 원고 생성"><Icon name="pencil" size={24} /></NewDocumentButton>
    </Panel>
  )
}
