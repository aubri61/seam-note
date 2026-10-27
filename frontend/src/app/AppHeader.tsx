import type { Ref } from 'react'
import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/primitives'
import type { DraftStatus } from '@/features/notes/noteDrafts'
import type { useWorkspaceSync } from '@/features/manual-sync/useWorkspaceSync'
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
  workspaceSync: ReturnType<typeof useWorkspaceSync>
  sidebarOpen: boolean
  isMobile: boolean
  sidebarId: string
  onToggleSidebar: () => void
  toggleRef: Ref<HTMLButtonElement>
  path: string[]
  status: DraftStatus
}

export function AppHeader({ sidebarOpen, isMobile, sidebarId, onToggleSidebar, toggleRef, path, status, workspaceSync }: AppHeaderProps) {
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
        <IconButton type="button" disabled aria-label="More note options (coming later)" title="Note options are not connected">
          <Icon name="more" />
        </IconButton>
      </div>
      <section aria-label="Workspace 동기화" style={{flexBasis:'100%',minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <SaveButton type="button" disabled={workspaceSync.disabled} onClick={workspaceSync.onSync} aria-describedby="workspace-sync-feedback">
            {workspaceSync.busy ? '전체 동기화 중…' : '모든 변경사항 동기화'}
          </SaveButton>
          <span>{workspaceSync.summary}</span>
        </div>
        <div id="workspace-sync-feedback" aria-live="polite" style={{overflowWrap:'anywhere',lineHeight:1.7}}>
          {workspaceSync.message&&<p>{workspaceSync.message}</p>}
          {workspaceSync.error&&<p role="alert">{workspaceSync.error}</p>}
          {!!workspaceSync.details.length&&<details><summary>확인이 필요한 항목</summary><ul>{workspaceSync.details.map(item=><li key={item.id}>{item.label}: {item.message}</li>)}</ul></details>}
        </div>
      </section>
    </Header>
  )
}
