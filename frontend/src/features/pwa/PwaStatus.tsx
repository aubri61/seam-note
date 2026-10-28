import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** Never skipWaiting or reload an open editor. Close every app window to activate an update. */
export function PwaStatus() {
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    let active = true
    registerSW({
      onOfflineReady: () => { if (active) setStatus('ready') },
      onNeedRefresh: () => { if (active) setStatus('update') },
      onRegisterError: () => { if (active) setStatus('failed') },
    })
    return () => { active = false }
  }, [])
  if (!status) return null
  return <aside role="status" style={{ padding: '8px 24px', fontSize: 12 }}>
    {status === 'update' ? '새 앱 버전이 준비됐습니다. 로컬 저장 상태를 확인한 후 모든 Seam Note 창을 닫고 다시 열면 적용됩니다. 편집 화면은 자동으로 새로고침하지 않습니다.' : status === 'failed' ? '앱 오프라인 캐시를 준비하지 못했습니다. 온라인에서 다시 실행해주세요.'
      : '오프라인 앱 파일 준비됨 · 본문이 로컬 저장된 원고만 인터넷 없이 열 수 있습니다.'}
  </aside>
}
