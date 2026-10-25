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
    button: {
      cursor: 'pointer',
    },
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
    'input:focus-visible, textarea:focus-visible': {
      outlineOffset: theme.spacing.xxs,
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
