import type { CSSObject } from '@emotion/react'
import type { AppTheme } from './theme'

export const controlFocus = (theme: AppTheme): CSSObject => ({
  outline: `2px solid ${theme.colors.mutedText}`,
  outlineOffset: theme.spacing.xxs,
})

// Apply locally to native controls. The editor's writing surface keeps its own styles.
export const actionStyle = (theme: AppTheme, variant: 'primary' | 'secondary' | 'ghost' = 'secondary', compact = false): CSSObject => ({
  minHeight: compact ? 32 : 44,
  maxWidth: '100%',
  padding: compact ? `${theme.spacing.xs} ${theme.spacing.control}` : `${theme.spacing.sm} ${theme.spacing.md}`,
  border: `1px solid ${variant === 'primary' ? theme.colors.text : variant === 'ghost' ? 'transparent' : theme.colors.border}`,
  borderRadius: variant === 'ghost' ? theme.radii.sm : theme.radii.md,
  background: variant === 'primary' ? theme.colors.text : variant === 'ghost' ? 'transparent' : theme.colors.surface,
  color: variant === 'primary' ? theme.colors.surface : variant === 'ghost' ? theme.colors.mutedText : theme.colors.text,
  fontSize: compact ? 13 : 14,
  lineHeight: 1.5,
  fontWeight: variant === 'primary' ? 600 : 500,
  overflowWrap: 'anywhere',
  '&:not(:disabled):hover': {
    background: variant === 'primary' ? theme.colors.text : theme.colors.selected,
    opacity: variant === 'primary' ? .9 : 1,
    filter: 'none',
    boxShadow: 'none',
  },
  '&:not(:disabled):active': { scale: 'none', filter: 'none' },
  '&:focus-visible': controlFocus(theme),
  '&:disabled': {
    background: theme.colors.sidebar, color: theme.colors.secondary, borderColor: theme.colors.border,
  },
  '@media (pointer: coarse)': { minHeight: 44 },
})

export const fieldStyle = (theme: AppTheme): CSSObject => ({
  maxWidth: '100%',
  minHeight: 44,
  padding: `${theme.spacing.sm} ${theme.spacing.control}`,
  border: `1px solid ${theme.colors.secondary}`,
  borderRadius: theme.radii.md,
  background: theme.colors.surface,
  color: theme.colors.text,
  fontFamily: 'inherit',
  fontSize: 16,
  lineHeight: 1.5,
  '&:focus': { border: `1px solid ${theme.colors.secondary}` },
  '&:focus-visible': controlFocus(theme),
  '&::placeholder': { color: theme.colors.mutedText, opacity: 1 },
  '&:disabled': { background: theme.colors.sidebar },
})
