import { createContext } from 'react'

export const WorkspaceAccount = createContext<{
  nickname: string
  busy: boolean
  message: string
  onLogout: () => void
  onRename: (nickname: string) => Promise<void>
} | null>(null)
