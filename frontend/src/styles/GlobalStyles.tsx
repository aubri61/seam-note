import { Global, useTheme } from '@emotion/react'

export function GlobalStyles() {
  const theme = useTheme()
  return <Global styles={{
    '*': {
      boxSizing: 'border-box',
    },
    ':root': {
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: theme.colors.text,
      background: theme.colors.background,
      fontSynthesis: 'none',
      textRendering: 'optimizeLegibility',
      WebkitFontSmoothing: 'antialiased',
      colorScheme: 'light',
    },
    body: {
      margin: 0,
      minWidth: '320px',
    },
    'button, input, textarea': {
      font: 'inherit',
      color: 'inherit',
    },
    'input, textarea': {
      border: 0,
      outline: 'none',
      boxShadow: 'none',
    },
    'button:not(:disabled):hover, summary:hover': { filter: 'brightness(.96)', boxShadow:'inset 0 0 0 100vmax rgba(40,35,25,.035)' },
    'button:not(:disabled):active, summary:active': { filter:'brightness(.91)', scale:'.97' },
    'button:not(:disabled), summary': { transition:'filter 160ms ease, scale 120ms ease, background-color 160ms ease, box-shadow 160ms ease',cursor:'pointer' },
    '@keyframes seam-sync-spin': { to: {transform:'rotate(360deg)'} },
    'button[data-workspace-sync][aria-busy="true"] svg': {animation:'seam-sync-spin 900ms linear infinite'},
    'button:disabled': {
      cursor: 'not-allowed',
    },
    'button, input, textarea, a': {
      WebkitTapHighlightColor: 'transparent',
    },
    ':focus-visible': {
      outline: `2px solid ${theme.colors.mutedText}`,
      outlineOffset: theme.spacing.xs,
    },
    'input:focus, input:focus-visible, textarea:focus, textarea:focus-visible': {
      border: 0, outline: 'none', boxShadow: 'none',
    },
    '::selection': {
      background: theme.colors.accent,
    },
    'h1, h2, h3, p': {
      margin: 0,
    },
    a: {
      color: 'inherit',
    },
    svg: {
      flexShrink: 0,
    },
    '@media (prefers-reduced-motion: reduce)': {
      '*, *::before, *::after': {
        transition: 'none !important',
        animation: 'none !important',
        scrollBehavior: 'auto',
      },
    },
  }} />
}
