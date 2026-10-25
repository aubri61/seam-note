import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'

export type SyncStatusValue = 'synced' | 'saving-locally'

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

/** Visual preview only; no synchronization is observed or performed. */
export function SyncStatus({ status }: { status: SyncStatusValue }) {
  const synced = status === 'synced'

  return (
    <Badge synced={synced} role="status" aria-live="polite" aria-atomic="true" title="저장·동기화 상태 UI 미리보기">
      <Icon name={synced ? 'cloudCheck' : 'disk'} size={18} />
      {synced ? 'Synced' : '로컬 저장 중'}
    </Badge>
  )
}
