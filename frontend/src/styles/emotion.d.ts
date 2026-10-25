import '@emotion/react'
import type { AppTheme } from '@/styles/theme'

declare module '@emotion/react' {
  export interface Theme {
    colors: AppTheme['colors']
    spacing: AppTheme['spacing']
    radii: AppTheme['radii']
    shadow: AppTheme['shadow']
    motion: AppTheme['motion']
    breakpoints: AppTheme['breakpoints']
  }
}
