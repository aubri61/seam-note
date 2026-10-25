import type { Ref } from 'react'
import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/primitives'
import { SyncStatus } from '@/features/sync/SyncStatus'
import type { SyncStatusValue } from '@/features/sync/SyncStatus'

const Header = styled.header(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: theme.spacing.sm,
  minHeight: '68px',
  padding: `${theme.spacing.md} ${theme.spacing.lg}`,
  borderBottom: `1px solid ${theme.colors.border}`,
  color: theme.colors.mutedText,
  fontSize: '12px',
  '> div': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.md,
    minWidth: 0,
  },
  p: { display: 'flex', alignItems: 'center', gap: theme.spacing.sm },
  [`@media (max-width: ${theme.breakpoints.mobile})`]: {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    '> div': { gap: theme.spacing.sm },
  },
}))

interface AppHeaderProps {
  sidebarOpen: boolean
  isMobile: boolean
  sidebarId: string
  onToggleSidebar: () => void
  toggleRef: Ref<HTMLButtonElement>
  path: string[]
  syncStatus?: SyncStatusValue
}

export function AppHeader({ sidebarOpen, isMobile, sidebarId, onToggleSidebar, toggleRef, path, syncStatus = 'saving-locally' }: AppHeaderProps) {
  return (
    <Header>
      <div>
        <IconButton
          ref={toggleRef}
          type="button"
          aria-label={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'}
          aria-expanded={sidebarOpen}
          aria-controls={sidebarId}
          aria-haspopup={isMobile ? 'dialog' : undefined}
          title={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'}
          onClick={onToggleSidebar}
        >
          <Icon name="sidebar" size={19} />
        </IconButton>
        <p>Personal{path.map((name, index) => <span key={index} style={{ display: 'contents' }}><Icon name="chevron" size={12} />{name}</span>)}</p>
      </div>
      <div>
        <SyncStatus status={syncStatus} />
        <IconButton type="button" disabled aria-label="More note options (coming later)" title="Note options are not connected">
          <Icon name="more" />
        </IconButton>
      </div>
    </Header>
  )
}
