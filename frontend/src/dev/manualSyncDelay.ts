// Only imported through a compile-time DEV gate. Never stores manuscript text.
export type DelayMode = 'response' | 'ack'
const key = 'seam-note:lab-ack-delay'
export const eventName = 'seam-note:lab-delay-status'
export function report(message: string) {
  console.info('[Seam Note isolated sync lab]', message)
  window.dispatchEvent(new CustomEvent(eventName, { detail: message }))
}
export async function armDelay(noteId: string, mode: DelayMode) {
  sessionStorage.removeItem(key)
  const response = await fetch('/__sync-delay__/arm', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({noteId,mode})})
  if (!response.ok) throw new Error('격리 실험 서버에서만 지연 기능을 사용할 수 있습니다.')
  if (mode === 'ack') sessionStorage.setItem(key, noteId)
  report(mode === 'ack' ? '다음 1회: 검증된 서버 응답 후 ACK 직전 10초 대기' : '다음 1회: 서버 처리 후 응답 전달 전 10초 대기')
}
export async function beforeAck(noteId: string, operationId: string) {
  if (sessionStorage.getItem(key) !== noteId) return
  // Consume before waiting: relaunch/retry must use the original operation without delaying again.
  sessionStorage.removeItem(key)
  report(`ACK 직전 대기 중 · 10초 · operationId=${operationId}`)
  // This is before acceptServerAck and outside every IndexedDB transaction.
  await new Promise(resolve => setTimeout(resolve, 10_000))
  report(`ACK 대기 완료 · operationId=${operationId}`)
}
