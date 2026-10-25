/** Standard PostgreSQL/Java UUID text; accept all versions and canonicalize case. */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class NoteRouteError extends Error {
  readonly status: 400 | 404
  constructor(status: 400 | 404, message: string) { super(message); this.name = 'NoteRouteError'; this.status = status }
}
export function notePath(noteId: string): string {
  return `/notes/${encodeURIComponent(noteId)}`
}
export function resolveNoteRoute(pathname: string, parameter?: string) {
  if (pathname === '/') return { home: true, noteId: null, error: null }
  if (parameter === undefined) return { home: false, noteId: null, error: new NoteRouteError(404, '404 · 페이지를 찾을 수 없습니다.') }
  if (!uuid.test(parameter)) return { home: false, noteId: null, error: new NoteRouteError(400, '잘못된 원고 주소입니다. UUID 형식을 확인해주세요.') }
  return { home: false, noteId: parameter.toLowerCase(), error: null }
}
export function missingNoteError() {
  return new NoteRouteError(404, '404 · 원고를 찾을 수 없습니다. 삭제되었거나 현재 Workspace에 없는 원고입니다.')
}
