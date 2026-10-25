import type { ReactNode, RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { keyframes } from '@emotion/react'
import styled from '@emotion/styled'

const slideIn = keyframes({ from: { transform: 'translateX(-110%)' }, to: { transform: 'translateX(0)' } })
const slideOut = keyframes({ from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-110%)' } })
const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })
const fadeOut = keyframes({ from: { opacity: 1 }, to: { opacity: 0 } })

const Overlay = styled(Dialog.Overlay)(({ theme }) => ({
  position: 'fixed',
  zIndex: 10,
  inset: 0,
  background: 'rgba(36, 35, 32, .16)',
  '&[data-state="open"]': { animation: `${fadeIn} ${theme.motion.duration[300]} ${theme.motion.easing.enter}` },
  '&[data-state="closed"]': { animation: `${fadeOut} ${theme.motion.duration[300]} ${theme.motion.easing.exit}` },
}))

const Content = styled(Dialog.Content)(({ theme }) => ({
  position: 'fixed',
  zIndex: 20,
  inset: `${theme.spacing.xs} auto ${theme.spacing.xs} ${theme.spacing.xs}`,
  width: `min(280px, calc(100vw - ${theme.spacing.xxl}))`,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.panel,
  background: theme.colors.sidebar,
  overflow: 'auto',
  boxShadow: '12px 0 40px rgba(36, 35, 32, .12)',
  '> aside': { width: '100%' },
  '&[data-state="open"]': { animation: `${slideIn} ${theme.motion.duration[300]} ${theme.motion.easing.enter}` },
  '&[data-state="closed"]': { animation: `${slideOut} ${theme.motion.duration[300]} ${theme.motion.easing.exit}` },
}))

const Title = styled(Dialog.Title)(() => ({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
} as const))

interface SidebarDrawerProps {
  id: string
  open: boolean
  onOpenChange: (open: boolean) => void
  toggleRef: RefObject<HTMLButtonElement | null>
  children: ReactNode
  onAfterClose?: () => void
}

export function SidebarDrawer({ id, open, onOpenChange, toggleRef, children, onAfterClose }: SidebarDrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Overlay data-testid="sidebar-overlay" />
        <Content
          id={id}
          aria-describedby={undefined}
          onCloseAutoFocus={event => {
            // The opener lives in AppHeader rather than Dialog.Trigger.
            event.preventDefault()
            toggleRef.current?.focus()
            onAfterClose?.()
          }}
        >
          <Title>폴더 사이드바</Title>
          {children}
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
