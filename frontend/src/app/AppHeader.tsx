import type { Ref } from 'react'
import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/primitives'
import type { DraftStatus } from '@/features/notes/noteDrafts'
import type { useManualSync } from '@/features/manual-sync/useManualSync'
import { SyncStatus } from '@/features/sync/SyncStatus'

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

const SaveButton = styled.button(({ theme }) => ({
  border: `1px solid ${theme.colors.border}`, borderRadius: theme.radii.pill,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`, background: theme.colors.surface,
  color: theme.colors.text, font: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  '&:disabled': { opacity: .5, cursor: 'not-allowed' },
}))

interface AppHeaderProps {
  manualSync: ReturnType<typeof useManualSync>
  sidebarOpen: boolean
  isMobile: boolean
  sidebarId: string
  onToggleSidebar: () => void
  toggleRef: Ref<HTMLButtonElement>
  path: string[]
  status: DraftStatus
}

export function AppHeader({ sidebarOpen, isMobile, sidebarId, onToggleSidebar, toggleRef, path, status, manualSync }: AppHeaderProps) {
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
        <SyncStatus status={status} />
        <SaveButton type="button" disabled={manualSync.disabled} onClick={manualSync.onSync}
          title={manualSync.summary} aria-describedby="server-save-feedback">서버에 저장</SaveButton>
        <IconButton type="button" disabled aria-label="More note options (coming later)" title="Note options are not connected">
          <Icon name="more" />
        </IconButton>
      </div>
      <section id="server-save-feedback" aria-live="polite" style={{ flexBasis: '100%', textAlign: 'right', overflowWrap: 'anywhere' }}>
        <span>{manualSync.summary}{manualSync.remaining !== undefined ? ` · 남은 Outbox 작업 ${manualSync.remaining}개` : ''}</span>
        {manualSync.message && <p role={manualSync.error ? 'alert' : 'status'} style={{ justifyContent: 'flex-end', margin: '4px 0 0' }}>{manualSync.message}</p>}
      </section>
    </Header>
  )
}
