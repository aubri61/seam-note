import type { ReactNode } from 'react'
import styled from '@emotion/styled'

const Slot = styled.div(({ theme }) => ({
  flex: '0 0 auto',
  width: 0,
  overflow: 'hidden',
  visibility: 'hidden',
  transition: `width ${theme.motion.duration[300]} ${theme.motion.easing.standard}, visibility 0s linear ${theme.motion.duration[300]}`,
  '> aside': { width: '280px' },
  '&[data-open="true"]': {
    width: '280px',
    visibility: 'visible',
    transitionDelay: '0s',
  },
}))

export function DesktopSidebar({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return <Slot id={id} data-open={open} inert={!open} aria-hidden={!open}>{children}</Slot>
}
