/** The browser decides whether to show a dialog; custom warning text is unsupported. */
export function protectUnsavedDrafts(target: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void {
  function beforeUnload(event: BeforeUnloadEvent) {
    event.preventDefault()
    event.returnValue = ''
  }
  target.addEventListener('beforeunload', beforeUnload)
  return () => target.removeEventListener('beforeunload', beforeUnload)
}
