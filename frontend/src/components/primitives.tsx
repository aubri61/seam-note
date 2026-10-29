import { forwardRef, type ComponentProps } from 'react'
import { Tooltip } from './Tooltip'
import styled from '@emotion/styled'

const Button = styled.button(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '40px',
  height: '40px',
  border: '1px solid transparent',
  borderRadius: theme.radii.sm,
  background: 'transparent',
  color: theme.colors.mutedText,
  transition: `background ${theme.motion.duration[100]} ${theme.motion.easing.standard}`,
  '&:not(:disabled):hover': {
    background: theme.colors.selected,
  },
}))

export const IconButton = forwardRef<HTMLButtonElement, ComponentProps<'button'>>(function IconButton({title,...props},ref) {
  return <Tooltip label={title ?? props['aria-label']}><Button {...props} ref={ref}/></Tooltip>
})

const EyebrowText = styled.p(({ theme }) => ({
  fontSize: '11px',
  fontWeight: 600,
  lineHeight: 1.5,
  letterSpacing: '1.4px',
  textTransform: 'uppercase',
  color: theme.colors.mutedText,
}))

export function Eyebrow(props: ComponentProps<'p'>) { return <EyebrowText {...props}/> }
