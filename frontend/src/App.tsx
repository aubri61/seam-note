import { AuthBoundary } from '@/features/auth/AuthBoundary'
import type { ComponentProps } from 'react'
import { Route, Routes, useOutletContext } from 'react-router-dom'
import { AppLayout } from '@/app/AppLayout'
import { NoteEditor } from '@/features/notes/NoteEditor'

function WorkspaceEditor() {
  const props = useOutletContext<ComponentProps<typeof NoteEditor>>()
  return <NoteEditor {...props} />
}

export default function App() {
  return <AuthBoundary><Routes>
    <Route path="/" element={<AppLayout />}>
      <Route index element={<WorkspaceEditor />} />
      <Route path="notes/:noteId" element={<WorkspaceEditor />} />
      <Route path="*" element={<WorkspaceEditor />} />
    </Route>
  </Routes></AuthBoundary>
}
