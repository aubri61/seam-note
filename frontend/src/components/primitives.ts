import styled from '@emotion/styled'

export const IconButton = styled.button(({ theme }) => ({
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
  '&:hover': {
    background: theme.colors.selected,
  },
}))

export const Eyebrow = styled.p(({ theme }) => ({
  fontSize: '11px',
  fontWeight: 600,
  lineHeight: 1.5,
  letterSpacing: '1.4px',
  textTransform: 'uppercase',
  color: theme.colors.mutedText,
}))
