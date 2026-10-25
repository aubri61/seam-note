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

/** Editing status only: no server or local persistence is implemented. */
export function SyncStatus({ status }: { status: DraftStatus }) {
  return <Badge role="status" title="편집 내용은 현재 브라우저 메모리에만 있습니다" aria-live="polite">
    <Icon name="note" size={18} />{status}
  </Badge>
}
