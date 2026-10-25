import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'

const Badge = styled.span<{ synced: boolean }>(({ theme, synced }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing.sm,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  borderRadius: theme.radii.pill,
  background: synced ? theme.colors.selected : theme.colors.background,
  color: synced ? theme.colors.success : theme.colors.mutedText,
  fontSize: '12px',
  whiteSpace: 'nowrap',
}))

/** The manuscript body remains read-only; create/delete are separate actions. */
export function SyncStatus() {
  return <Badge synced={false} role="status" title="본문은 읽기 전용이며 생성·삭제는 별도 버튼으로 처리합니다">
    <Icon name="note" size={18} />읽기 전용
  </Badge>
}
