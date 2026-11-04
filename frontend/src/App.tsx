import { AuthBoundary } from '@/features/auth/AuthBoundary'
import type { ComponentProps } from 'react'
import { Navigate, Route, Routes, useLocation, useOutletContext } from 'react-router-dom'
import { AppLayout } from '@/app/AppLayout'
import { workspacePath } from '@/app/routing/noteRoutes'
import { NoteEditor } from '@/features/notes/NoteEditor'

function WorkspaceEditor() {
  const props = useOutletContext<ComponentProps<typeof NoteEditor>>()
  return <NoteEditor {...props} />
}

export default function App() {
  const { pathname, search, hash } = useLocation()
  if (pathname.startsWith('/notes/')) {
    return <Navigate replace to={{ pathname: workspacePath + pathname, search, hash }} />
  }
  return <AuthBoundary><Routes>
    <Route path={workspacePath} element={<AppLayout />}>
      <Route index element={<WorkspaceEditor />} />
      <Route path="notes/:noteId" element={<WorkspaceEditor />} />
      <Route path="*" element={<WorkspaceEditor />} />
    </Route>
    <Route element={<AppLayout />}><Route path="*" element={<WorkspaceEditor />} /></Route>
  </Routes></AuthBoundary>
}
