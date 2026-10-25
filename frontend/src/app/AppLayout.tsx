import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@emotion/react'
import styled from '@emotion/styled'
import { AppHeader } from '@/app/AppHeader'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Sidebar } from '@/features/workspace/Sidebar'
import type { SidebarNavigationState } from '@/features/workspace/Sidebar'
import { DesktopSidebar } from '@/features/workspace/DesktopSidebar'
import { SidebarDrawer } from '@/features/workspace/SidebarDrawer'
import { NoteEditor } from '@/features/notes/NoteEditor'

const Shell = styled.div(({ theme }) => ({
  display: 'flex',
  width: `calc(100% - ${theme.spacing.xs})`,
  minHeight: `calc(100svh - ${theme.spacing.sm})`,
  margin: theme.spacing.xs,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.panel,
  overflow: 'clip',
  background: theme.colors.surface,
}))

const EditorArea = styled.main(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  minHeight: `calc(100svh - ${theme.spacing.xs} * 2 - 2px)`,
}))

export function AppLayout() {
  const theme = useTheme()
  const isMobile = useMediaQuery(`(max-width: ${theme.breakpoints.tablet})`)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [previousMode, setPreviousMode] = useState(isMobile)
  const previousFocusMode = useRef(isMobile)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const [expandedFolders, setExpandedFolders] = useState<SidebarNavigationState>({ notes: true, work: false, journal: false })
  const sidebarId = 'workspace-sidebar'

  // Reset before rendering the new presentation so an open desktop sidebar
  // cannot briefly mount an open modal (or the reverse) during a breakpoint change.
  if (previousMode !== isMobile) {
    setPreviousMode(isMobile)
    setSidebarOpen(false)
  }

  useEffect(() => {
    if (previousFocusMode.current !== isMobile) {
      previousFocusMode.current = isMobile
      // Preserve editor focus; only repair focus lost with an unmounted sidebar.
      if (document.activeElement === document.body) toggleRef.current?.focus()
    }
  }, [isMobile])

  function closeSidebar() {
    setSidebarOpen(false)
    // Modal focus restoration belongs to Radix's onCloseAutoFocus.
    if (!isMobile) toggleRef.current?.focus()
  }

  const sidebar = (
    <Sidebar
      onClose={closeSidebar}
      expandedFolders={expandedFolders}
      onToggleFolder={folder => setExpandedFolders(current => ({ ...current, [folder]: !current[folder] }))}
    />
  )

  return (
    <Shell>
      {isMobile ? (
        <SidebarDrawer id={sidebarId} open={sidebarOpen} onOpenChange={setSidebarOpen} toggleRef={toggleRef}>
          {sidebar}
        </SidebarDrawer>
      ) : (
        <DesktopSidebar id={sidebarId} open={sidebarOpen}>{sidebar}</DesktopSidebar>
      )}
      <EditorArea aria-label="Note workspace">
        <AppHeader
          sidebarOpen={sidebarOpen}
          isMobile={isMobile}
          sidebarId={sidebarId}
          onToggleSidebar={() => setSidebarOpen(open => !open)}
          toggleRef={toggleRef}
        />
        <NoteEditor />
      </EditorArea>
    </Shell>
  )
}
