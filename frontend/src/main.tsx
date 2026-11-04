import { BrowserRouter } from 'react-router-dom'
import { StrictMode } from 'react'
import { onlineManager, QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query/queryClient'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@emotion/react'
import { theme } from '@/styles/theme'
import { GlobalStyles } from '@/styles/GlobalStyles'
import App from '@/App.tsx'
import { startAppUpdates } from '@/features/pwa/appUpdate'

// Cold offline launches may happen before any native offline event reaches TanStack Query.
onlineManager.setOnline(navigator.onLine !== false)
if (import.meta.env.PROD) startAppUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <GlobalStyles />
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
