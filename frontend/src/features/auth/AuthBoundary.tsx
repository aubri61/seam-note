import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import styled from '@emotion/styled'
import { ApiError, configureAuthRecovery } from '@/lib/api/client'
import { queryClient } from '@/lib/query/queryClient'
import { accessTokenStore } from './accessTokenStore'
import { loginWithPassword, logoutOnServer, refreshAuthentication, signupWithPassword } from './authApi'
import { withAuthLock } from './refreshCoordinator'
import { ACTIVE_ACCOUNT, AUTH_FENCE, LAST_ACCOUNT, LOGOUT_PENDING, documentAccount, flushAccountDrafts,
  prepareAuthChange, readAccount, sameAccount, saveAccount, setBusinessAccess } from './authRuntime'

// No business request is allowed before the bootstrap identity check.
setBusinessAccess(false)
const Card = styled.main({ maxWidth: 440, margin: '10vh auto', padding: 28, lineHeight: 1.7,
  '& form': { display: 'grid', gap: 14 }, '& label': { display: 'grid', gap: 4 },
  '& input, & button': { padding: '10px 12px', font: 'inherit' }, '& button': { cursor: 'pointer' },
  '& h1': { fontSize: 26, marginBottom: 12 }, '& p': { margin: '12px 0' } })
const Bar = styled.aside({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '8px 16px',
  borderBottom: '1px solid #ddd', fontSize: 13, '& button': { padding: '5px 9px' } })
const OFFLINE_OPEN = 'seam-note:open-offline:v1'

async function finishPendingLogout() {
  if (localStorage.getItem(LOGOUT_PENDING)) {
    await logoutOnServer()
    localStorage.removeItem(LOGOUT_PENDING)
  }
}
export function AuthBoundary({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'checking' | 'login' | 'workspace'>('checking')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [signup, setSignup] = useState(false)
  const [frozen, setFrozen] = useState(false)
  useEffect(() => {
    let active = true
    configureAuthRecovery(async () => {
      try {
        await finishPendingLogout()
        await refreshAuthentication()
      } catch (error) {
        setBusinessAccess(false)
        if (active) setMessage('인증을 다시 확인해주세요. 로컬 원고와 미전송 작업은 유지됩니다.')
        throw error
      }
    })
    const changed = (event: StorageEvent) => {
      if (![ACTIVE_ACCOUNT, AUTH_FENCE, LOGOUT_PENDING].includes(event.key ?? '')) return
      setBusinessAccess(false); accessTokenStore.clear()
      void queryClient.cancelQueries()
      setFrozen(true)
      setMessage('다른 탭에서 로그인 상태를 변경했습니다. 이 탭의 원고와 전송 작업은 기존 계정에 보존합니다.')
      void flushAccountDrafts().catch(() => setMessage('다른 탭의 계정 변경으로 전송을 중단했습니다. 저장되지 않은 입력이 있어 이 탭을 닫지 말고 원고를 확인해주세요.'))
    }
    window.addEventListener('storage', changed)
    const bootstrap = async () => {
      if (location.pathname === '/login') { if (active) setMode('login'); return }
      if (sessionStorage.getItem(OFFLINE_OPEN) && documentAccount) {
        sessionStorage.removeItem(OFFLINE_OPEN)
        if (active) { setMode('workspace'); setMessage('이 기기에 저장된 원고를 열었습니다. 서버 전송은 로그인 확인 전까지 중단됩니다.') }
        return
      }
      try {
        await finishPendingLogout()
        const user = await refreshAuthentication()
        if (!active) return
        if (!documentAccount) { saveAccount(user); location.replace('/'); return }
        if (!sameAccount(documentAccount, user)) throw new Error('계정 또는 서버 환경이 변경되었습니다.')
        setBusinessAccess(true); setMode('workspace')
      } catch (error) {
        if (!active) return
        setBusinessAccess(false); setMode('login')
        setMessage(error instanceof ApiError && error.status === 401 ? '로그인해주세요. 기존 로컬 원고는 유지됩니다.' : '서버 연결 또는 로그인 상태를 확인해주세요. 기존 로컬 원고는 유지됩니다.')
      }
    }
    void bootstrap()
    return () => { active = false; configureAuthRecovery(undefined); window.removeEventListener('storage', changed) }
  }, [])
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : '요청을 완료하지 못했습니다.') }
    finally { setBusy(false) }
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? ''), password = String(form.get('password') ?? '')
    // Clear password fields immediately; never put the password into app state/storage.
    event.currentTarget.reset()
    void act(async () => {
      await prepareAuthChange()
      await finishPendingLogout()
      if (signup) {
        await signupWithPassword({ email, password, nickname: String(form.get('nickname') ?? '') })
        setSignup(false); setMessage('가입 요청을 처리했습니다. 이메일과 비밀번호로 로그인해주세요.'); return
      }
      const user = await withAuthLock(() => loginWithPassword({ email, password }))
      saveAccount(user)
      location.replace('/')
    })
  }
  const loginPage = () => void act(async () => { await prepareAuthChange(); location.assign('/login') })
  const logout = () => void act(async () => {
    await prepareAuthChange()
    // Persist before contacting the server: offline logout must survive reload.
    localStorage.setItem(LOGOUT_PENDING, '1')
    localStorage.removeItem(ACTIVE_ACCOUNT)
    try { await finishPendingLogout() } catch { /* pending marker blocks future silent refresh */ }
    location.replace('/login')
  })
  const offline = () => void act(async () => {
    const account = readAccount(LAST_ACCOUNT)
    if (!account) throw new Error('이 브라우저에서 확인된 계정의 로컬 원고가 없습니다.')
    setBusinessAccess(false)
    if (sameAccount(documentAccount, account)) { setMode('workspace'); setFrozen(false); setMessage('로컬 원고를 열었습니다. 서버 전송은 중단됩니다.'); return }
    saveAccount(account); sessionStorage.setItem(OFFLINE_OPEN, '1'); location.replace('/')
  })
  if (mode === 'checking') return <Card><p role="status">로그인 상태 확인 중…</p></Card>
  if (mode === 'login') return <Card>
    <h1>Seam Note</h1><p>{signup ? '이메일로 가입하기' : '로그인하고 이어 쓰기'}</p>
    <form onSubmit={submit}>
      <label>이메일<input name="email" type="email" autoComplete="username" required maxLength={254} disabled={busy}/></label>
      {signup && <label>닉네임<input name="nickname" autoComplete="nickname" minLength={2} maxLength={30} required disabled={busy}/></label>}
      <label>비밀번호<input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} minLength={15} required disabled={busy}/></label>
      <p>비밀번호는 15자 이상, UTF-8 기준 72바이트 이내로 입력해주세요.</p>
      <button type="submit" disabled={busy}>{busy ? '처리 중…' : signup ? '가입 요청' : '로그인'}</button>
    </form>
    <p><button type="button" disabled={busy} onClick={() => setSignup(value => !value)}>{signup ? '로그인으로 돌아가기' : '이메일로 가입하기'}</button></p>
    {readAccount(LAST_ACCOUNT) && <button type="button" onClick={offline} disabled={busy}>이 기기의 로컬 원고 열기</button>}
    <p>로컬 원고는 기기에 평문으로 보관됩니다. 공유 기기에서는 다른 사용자가 접근할 수 있습니다.</p>
    {message && <p role="status">{message}</p>}
  </Card>
  return <>
    <Bar aria-label="계정 상태"><span>{documentAccount?.nickname} · 개인 공간</span>
      <button type="button" onClick={loginPage} disabled={busy}>로그인 / 계정 전환</button>
      <button type="button" onClick={logout} disabled={busy}>로그아웃</button>
      {message && <span role="status">{message}</span>}
      {frozen && <button type="button" onClick={() => { setFrozen(false); setBusinessAccess(false) }}>이 탭의 로컬 원고 확인 · 전송 중단</button>}
    </Bar>
    <div hidden={frozen} inert={frozen || busy}>{children}</div>
  </>
}
