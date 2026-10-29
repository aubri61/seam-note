import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'
import type { DraftStatus } from '@/features/notes/noteDrafts'

const Badge = styled.span(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing.sm,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  borderRadius: theme.radii.pill,
  background: theme.colors.background,
  color: theme.colors.mutedText,
  fontSize: '12px',
  whiteSpace: 'nowrap',
}))

/** Local persistence status. The adjacent server label reports automatic/manual synchronization. */
export function SyncStatus({ status }: { status: DraftStatus }) {
  return <Badge role="status" title="로컬 저장 상태이며 서버 동기화 완료를 뜻하지 않습니다" aria-live="polite">
    <Icon name="note" size={18} />{status}
  </Badge>
}
