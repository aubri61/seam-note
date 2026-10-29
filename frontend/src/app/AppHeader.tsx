import { shortcutLabel } from '@/lib/keyboard/shortcutLabel'
import type { Ref } from 'react'
import styled from '@emotion/styled'
import { Tooltip } from '@/components/Tooltip'
import { SyncButton as SaveButton } from '@/components/SyncButton'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/primitives'
import type { DraftStatus } from '@/features/notes/noteDrafts'
import type { useWorkspaceSync } from '@/features/manual-sync/useWorkspaceSync'
import { FolderMenu } from '@/features/folders/FolderMenu'
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


const OfflineStatus = styled.span({
  color: '#B42318',
  fontWeight: 600,
})

interface AppHeaderProps {
  online: boolean
  canDelete:boolean
  onDelete:()=>void
  hasConflict: boolean
  workspaceSync: ReturnType<typeof useWorkspaceSync>
  sidebarOpen: boolean
  isMobile: boolean
  sidebarId: string
  onToggleSidebar: () => void
  toggleRef: Ref<HTMLButtonElement>
  path: string[]
  status: DraftStatus
}

export function AppHeader({ online, sidebarOpen, isMobile, sidebarId, onToggleSidebar, toggleRef, path, status, workspaceSync, hasConflict, canDelete, onDelete }: AppHeaderProps) {
  return (
    <Header>
      <div>
        <IconButton
          ref={toggleRef}
          aria-keyshortcuts={'Meta+\\ Control+\\'}
          type="button"
          aria-label={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'}
          aria-expanded={sidebarOpen}
          aria-controls={sidebarId}
          aria-haspopup={isMobile ? 'dialog' : undefined}
          title={shortcutLabel(sidebarOpen ? '사이드바 접기' : '사이드바 펼치기', '\\')}
          onClick={onToggleSidebar}
        >
          <Icon name="sidebar" size={19} />
        </IconButton>
        <p>Personal{path.map((name, index) => <span key={index} style={{ display: 'contents' }}><Icon name="chevron" size={12} />{name}</span>)}</p>
      </div>
      <div style={{flexWrap:'wrap'}}>
        {!hasConflict && <SyncStatus status={status} />}

        {online ? <Tooltip label={shortcutLabel('동기화', 'S')}><SaveButton data-workspace-sync aria-keyshortcuts="Meta+S Control+S" aria-label="모든 변경사항 동기화" aria-busy={workspaceSync.busy} type="button" disabled={workspaceSync.disabled} onClick={workspaceSync.onSync} aria-describedby="workspace-sync-feedback">
          <Icon name="sync" size={16}/>{workspaceSync.busy?'동기화 중…':'동기화'}
        </SaveButton></Tooltip> : <OfflineStatus role="status">현재 오프라인 작업 중</OfflineStatus>}
        <span role="status" aria-live="polite" style={{fontSize:11,whiteSpace:'nowrap'}}>{workspaceSync.stateLabel}</span>
        <FolderMenu kind="note" name="현재" tabIndex={0} disabled={!canDelete} onAction={onDelete}/>

      </div>
      {!hasConflict && workspaceSync.error && <section aria-label="Workspace 동기화" style={{flexBasis:'100%',minWidth:0}}>
        <div id="workspace-sync-feedback" aria-live="polite" style={{overflowWrap:'anywhere',lineHeight:1.7}}>
          {!hasConflict&&workspaceSync.error&&<p role="alert">{workspaceSync.error}</p>}
        </div>
      </section>}
    </Header>
  )
}
