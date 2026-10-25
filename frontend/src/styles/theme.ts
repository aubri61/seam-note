export const theme = {
  colors: {
    background: '#FCFBF8', surface: '#FFFFFF', sidebar: '#FAF9F6',
    border: '#E7E5E0', text: '#242320', secondary: '#827C72',
    accent: '#F3DE9E', selected: '#EEEADD', mutedText: '#6F695F', success: '#59654C',
  },
  // Shared spacing scale; use these tokens for margins, padding, gaps, and offsets.
  spacing: { xxs: '2px', xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px', xxl: '48px', xxxl: '64px' },
  radii: { sm: '8px', md: '12px', panel: '16px', lg: '20px', pill: '999px' },
  shadow: '0 4px 24px rgba(36, 35, 32, 0.025)',
  motion: {
    duration: { 100: '120ms', 200: '200ms', 300: '320ms', 400: '480ms' },
    easing: {
      standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
      enter: 'cubic-bezier(0, 0, 0.2, 1)',
      exit: 'cubic-bezier(0.4, 0, 1, 1)',
    },
  },
  breakpoints: { mobile: '760px', tablet: '1100px' },
} as const

export type AppTheme = typeof theme
