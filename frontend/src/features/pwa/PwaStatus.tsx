import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** Never skipWaiting or reload an open editor. Close every app window to activate an update. */
export function PwaStatus() {
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    let active = true
    registerSW({
      onNeedRefresh: () => { if (active) setStatus('update') },
      onRegisterError: () => { if (active) setStatus('failed') },
    })
    return () => { active = false }
  }, [])
  if (!status) return null
  return <aside role="status" style={{ padding: '8px 24px', fontSize: 12 }}>
    {status === 'update' ? '새 버전이 준비됐습니다. Seam Note 창을 모두 닫고 다시 열어주세요.' : '오프라인 준비에 실패했습니다. 온라인에서 다시 실행해주세요.'}
  </aside>
}
