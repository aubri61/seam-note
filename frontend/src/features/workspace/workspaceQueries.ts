import { queryOptions, useQuery } from '@tanstack/react-query'
import { workspaceKeys } from '@/lib/query/queryKeys'
import { loadWorkspace } from '@/features/offline/workspaceCache'

export const workspaceTreeQuery = () => queryOptions({
  queryKey: workspaceKeys.tree(),
  queryFn: ({ signal }) => loadWorkspace({ signal }),
  // Metadata is reused until a successful mutation explicitly invalidates this key.
  networkMode: 'always',
  staleTime: query => query.state.data?.localSnapshot ? 0 : Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
})

export function useWorkspaceTreeQuery() {
  return useQuery(workspaceTreeQuery())
}
