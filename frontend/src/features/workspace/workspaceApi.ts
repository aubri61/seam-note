import { getJson } from '@/lib/api/client'
import type { RequestOptions } from '@/lib/api/client'
import type { WorkspaceTreeResponse } from '@/lib/api/types'

export function getWorkspaceTree(options?: RequestOptions): Promise<WorkspaceTreeResponse> {
  return getJson<WorkspaceTreeResponse>('/workspace/tree', options)
}
