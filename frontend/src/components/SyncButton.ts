import styled from '@emotion/styled'

export const SyncButton = styled.button(({ theme }) => ({
  display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8,
  border: `1px solid ${theme.colors.border}`, borderRadius: theme.radii.pill,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`, background: theme.colors.surface,
  color: theme.colors.text, font: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
  '&:disabled': { opacity: .5, cursor: 'not-allowed' },
}))

