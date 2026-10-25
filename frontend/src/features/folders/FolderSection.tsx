import { useId } from 'react'
import type { ReactNode } from 'react'
import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'

const Toggle = styled.button(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.sm,
  width: '100%',
  minHeight: '40px',
  padding: theme.spacing.sm,
  border: 0,
  borderRadius: theme.radii.sm,
  background: 'transparent',
  textAlign: 'left',
  fontSize: '13px',
  '&:hover': { background: theme.colors.selected },
  '> svg:first-of-type': {
    color: theme.colors.secondary,
    transition: `transform ${theme.motion.duration[200]} ${theme.motion.easing.standard}`,
  },
  '&[aria-expanded="true"] > svg:first-of-type': { transform: 'rotate(90deg)' },
}))

const Content = styled.div(({ theme }) => ({
  display: 'grid',
  gridTemplateRows: '0fr',
  opacity: 0,
  visibility: 'hidden',
  transition: `grid-template-rows ${theme.motion.duration[200]} ${theme.motion.easing.standard}, opacity ${theme.motion.duration[200]} ${theme.motion.easing.standard}, visibility 0s linear ${theme.motion.duration[200]}`,
  '&[data-open="true"]': {
    gridTemplateRows: '1fr',
    opacity: 1,
    visibility: 'visible',
    transitionDelay: '0s',
  },
  '> div': { minHeight: 0, overflow: 'hidden' },
  '> div > ul': {
    margin: `${theme.spacing.xxs} 0 ${theme.spacing.sm} ${theme.spacing.lg}`,
    paddingLeft: theme.spacing.sm,
    borderLeft: `1px solid ${theme.colors.border}`,
  },
}))

export function FolderSection({ label, open, onToggle, children }: {
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const contentId = useId()

  return (
    <div>
      <Toggle type="button" aria-expanded={open} aria-controls={contentId} onClick={onToggle}>
        <Icon name="chevron" size={13} />
        <Icon name="folder" size={17} />
        {label}
      </Toggle>
      <Content id={contentId} data-open={open} aria-hidden={!open} inert={!open}>
        <div>{children}</div>
      </Content>
    </div>
  )
}
