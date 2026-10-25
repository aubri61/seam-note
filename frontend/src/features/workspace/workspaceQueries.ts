import { queryOptions, useQuery } from '@tanstack/react-query'
import { workspaceKeys } from '@/lib/query/queryKeys'
import { getWorkspaceTree } from './workspaceApi'

export const workspaceTreeQuery = () => queryOptions({
  queryKey: workspaceKeys.tree(),
  queryFn: ({ signal }) => getWorkspaceTree({ signal }),
  // Metadata is reused until a successful mutation explicitly invalidates this key.
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
})

export function useWorkspaceTreeQuery() {
  return useQuery(workspaceTreeQuery())
}
