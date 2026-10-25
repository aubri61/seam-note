import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/client'

// One client per SPA, created outside React renders. No UI selection or draft state here.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // No retries for validation, missing resources, conflicts or malformed success responses.
      retry: (failureCount, error) => failureCount < 1 && error instanceof ApiError
        && (error.status === 0 || error.status >= 500),
    },
  },
})
