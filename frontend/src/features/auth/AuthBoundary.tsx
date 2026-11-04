import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import styled from '@emotion/styled'
import { actionStyle, fieldStyle } from '@/styles/controls'
import { ApiError, configureAuthRecovery, getJson } from '@/lib/api/client'
import { queryClient } from '@/lib/query/queryClient'
import { accessTokenStore } from './accessTokenStore'
import { loginWithPassword, logoutOnServer, refreshAuthentication, signupWithPassword } from './authApi'
import { withAuthLock } from './refreshCoordinator'
import { ACTIVE_ACCOUNT, AUTH_FENCE, LAST_ACCOUNT, LOGOUT_PENDING, documentAccount, flushAccountDrafts,
  prepareAuthChange, readAccount, sameAccount, saveAccount, setBusinessAccess } from './authRuntime'

// No business request is allowed before the bootstrap identity check.
setBusinessAccess(false)
const Card = styled.main(({ theme }) => ({
  width: `calc(100% - ${theme.spacing.xl})`,
  maxWidth: 440,
  margin: `clamp(${theme.spacing.lg}, 8vh, ${theme.spacing.xxxl}) auto`,
  padding: theme.spacing.xl,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.panel,
  background: theme.colors.surface,
  boxShadow: theme.shadow,
  lineHeight: 1.7,
  '& form, & .auth-options': { display: 'grid', gap: theme.spacing.md, marginTop: theme.spacing.lg },
  '& label': { display: 'grid', gap: theme.spacing.sm, fontSize: 13, fontWeight: 500, minWidth: 0 },
  '& input': { ...fieldStyle(theme), width: '100%', minWidth: 0, fontWeight: 400 },
  '& button': actionStyle(theme),
  '& button[type="submit"]': actionStyle(theme, 'primary'),
  '& a[data-quiet]': {
    ...actionStyle(theme, 'ghost'), display: 'grid', placeItems: 'center', textDecoration: 'none',
    '&:hover': { background: theme.colors.selected },
    '&[aria-disabled="true"]': { opacity: .5, cursor: 'not-allowed' },
  },
  '& h1': { fontSize: 'clamp(28px, 5vw, 32px)', lineHeight: 1.3, fontWeight: 600, letterSpacing: '-.7px' },
  '& p': { color: theme.colors.mutedText, overflowWrap: 'anywhere' },
  '& .auth-intro': { marginTop: theme.spacing.sm, fontSize: 16 },
  '& .password-field': { display: 'grid', gap: theme.spacing.sm, minWidth: 0 },
  '& .password-checks': { listStyle: 'none', margin: 0, padding: 0, fontSize: 12, color: theme.colors.mutedText },
  '& .password-checks [data-result="pass"]': { color: theme.colors.success },
  '& .password-checks [data-result="fail"]': { color: '#B42318' },
  '& button[data-google]': {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm,
    '& img': { width: 18, height: 18, objectFit: 'contain', flexShrink: 0, background: theme.colors.surface },
  },
  '& [role="status"]': { marginTop: theme.spacing.md, fontSize: 13 },
  [`@media (max-width: ${theme.breakpoints.mobile})`]: { padding: theme.spacing.lg },
}))
const Brand = styled.div(({ theme }) => ({
  display: 'flex', alignItems: 'center', gap: theme.spacing.sm, fontSize: 17, fontWeight: 600,
  marginBottom: theme.spacing.lg, '& img': { width: 32, height: 32 },
}))
const Bar = styled.aside(({ theme }) => ({
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing.sm,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  borderBottom: `1px solid ${theme.colors.border}`, background: theme.colors.sidebar,
  fontSize: 13, color: theme.colors.mutedText,
  '& > span': { overflowWrap: 'anywhere', minWidth: 0 },
  '& > span[role="status"]': { flexBasis: '100%' },
  '& button': actionStyle(theme, 'ghost', true),
}))
const OFFLINE_OPEN = 'seam-note:open-offline:v1'

function checkSignupPassword(value: string) {
  // Match PasswordPolicy: Unicode code points, Java whitespace and UTF-8 length.
  return {
    longEnough: Array.from(value).length >= 15,
    // eslint-disable-next-line no-control-regex -- Java Character.isWhitespace includes these control characters.
    hasContent: /[^\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]/u.test(value),
    withinLimit: new TextEncoder().encode(value).length <= 72,
  }
}

function PasswordChecks({ checks }: { checks: ReturnType<typeof checkSignupPassword> | null }) {
  const rule = (passed: boolean | undefined, text: string) => (
    <li data-result={passed === undefined ? 'pending' : passed ? 'pass' : 'fail'}>
      {passed === undefined ? '○' : passed ? '✓' : '✕'} {text}
    </li>
  )
  return <ul className="password-checks" id="auth-password-checks" aria-live="polite">
    {rule(checks?.longEnough, checks?.longEnough ? '15자 이상이에요.' : '15자 이상 입력해주세요.')}
    {rule(checks?.withinLimit, checks?.withinLimit === false ? '너무 길어요. 비밀번호를 줄여주세요.' : checks ? '최대 길이 이내예요.' : '너무 긴 비밀번호는 사용할 수 없어요.')}
    {checks?.hasContent === false && rule(false, '공백만으로는 만들 수 없어요.')}
  </ul>
}

function LoginForm({ busy, onSubmit }: { busy: boolean; onSubmit: (email: string, password: string) => void }) {
  return <form onSubmit={event => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    event.currentTarget.reset()
    onSubmit(String(form.get('email') ?? ''), String(form.get('password') ?? ''))
  }}>
    <label>이메일<input name="email" placeholder="이메일을 입력해주세요" type="email" autoComplete="username" required maxLength={254} disabled={busy}/></label>
    <label>비밀번호<input name="password" placeholder="비밀번호를 입력해주세요" type="password" autoComplete="current-password" required disabled={busy}/></label>
    <button type="submit" disabled={busy}>{busy ? '처리 중…' : '로그인'}</button>
  </form>
}

function RegisterForm({ busy, onSubmit }: { busy: boolean; onSubmit: (input: { email: string; password: string; nickname: string }) => void }) {
  const [checks, setChecks] = useState<ReturnType<typeof checkSignupPassword> | null>(null)
  const [matches, setMatches] = useState<boolean | null>(null)
  const inspect = (form: FormData) => {
    const password = String(form.get('password') ?? '')
    const confirmation = String(form.get('confirmPassword') ?? '')
    const result = checkSignupPassword(password)
    setChecks(password ? result : null)
    setMatches(confirmation ? password === confirmation : null)
    return { password, valid: result.longEnough && result.hasContent && result.withinLimit && password === confirmation }
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const { password, valid } = inspect(form)
    if (!valid) return
    event.currentTarget.reset()
    setChecks(null); setMatches(null)
    onSubmit({ email: String(form.get('email') ?? ''), password, nickname: String(form.get('nickname') ?? '') })
  }
  return <form onSubmit={submit} onInput={event => {
    if (event.target instanceof HTMLInputElement && ['password', 'confirmPassword'].includes(event.target.name)) {
      inspect(new FormData(event.currentTarget))
    }
  }}>
    <label>이메일<input name="email" placeholder="이메일을 입력해주세요" type="email" autoComplete="username" required maxLength={254} disabled={busy}/></label>
    <label>닉네임<input name="nickname" placeholder="닉네임을 입력해주세요" autoComplete="nickname" minLength={2} maxLength={30} required disabled={busy}/></label>
    <div className="password-field">
      <label>비밀번호<input name="password" placeholder="비밀번호를 입력해주세요" type="password" autoComplete="new-password" aria-describedby="auth-password-checks" required disabled={busy}/></label>
      <PasswordChecks checks={checks} />
    </div>
    <div className="password-field">
      <label>비밀번호 확인<input name="confirmPassword" placeholder="비밀번호를 다시 입력해주세요" type="password" autoComplete="new-password" aria-describedby="auth-password-match" aria-invalid={matches === false || undefined} required disabled={busy}/></label>
      <div className="password-checks" id="auth-password-match" aria-live="polite">
        <span data-result={matches === null ? 'pending' : matches ? 'pass' : 'fail'}>
          {matches === null ? '○ 비밀번호를 다시 입력해주세요.' : matches ? '✓ 비밀번호가 일치해요.' : '✕ 비밀번호가 일치하지 않아요.'}
        </span>
      </div>
    </div>
    <button type="submit" disabled={busy}>{busy ? '처리 중…' : '가입 요청'}</button>
  </form>
}

const authPage = () => {
  const path = location.pathname.replace(/\/$/, '')
  return path === '/register' ? 'register' : path === '/login' ? 'login' : null
}

async function finishPendingLogout() {
  if (localStorage.getItem(LOGOUT_PENDING)) {
    await logoutOnServer()
    localStorage.removeItem(LOGOUT_PENDING)
  }
}
export function AuthBoundary({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<'checking' | 'login' | 'register' | 'workspace'>(() => authPage() ?? 'checking')
  const [message, setMessage] = useState(() => location.search === '?oauth=failed' ? 'Google 로그인을 완료하지 못했습니다. 기존 이메일 계정이 있다면 이메일로 로그인해주세요.' : location.search === '?registered=1' ? '가입 요청을 처리했습니다. 이메일과 비밀번호로 로그인해주세요.' : '')
  const [busy, setBusy] = useState(false)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [frozen, setFrozen] = useState(false)
  useEffect(() => {
    let active = true
    void getJson<{googleEnabled: boolean}>('/auth/config').then(config => { if (active) setGoogleEnabled(config.googleEnabled === true) }).catch(() => {})
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
      if (authPage()) return
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
  const login = (email: string, password: string) => void act(async () => {
    await prepareAuthChange()
    await finishPendingLogout()
    const user = await withAuthLock(() => loginWithPassword({ email, password }))
    saveAccount(user)
    location.replace('/')
  })
  const register = (input: { email: string; password: string; nickname: string }) => void act(async () => {
    await prepareAuthChange()
    await finishPendingLogout()
    await signupWithPassword(input)
    location.replace('/login?registered=1')
  })
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
  if (mode === 'login' || mode === 'register') return <Card>
    <Brand><img src="/seam-note-icon.png" alt="" />seam note</Brand>
    <h1>{mode === 'register' ? '이메일로 가입하기' : '다시, 이어 쓰기'}</h1>
    <p className="auth-intro">당신의 생각이 끊기지 않도록.</p>
    {mode === 'register' ? <RegisterForm busy={busy} onSubmit={register} /> : <LoginForm busy={busy} onSubmit={login} />}
    <div className="auth-options">
      {googleEnabled && <button data-google type="button" disabled={busy} onClick={() => void act(async () => {
        await prepareAuthChange(); await finishPendingLogout(); localStorage.removeItem(ACTIVE_ACCOUNT); location.assign('/api/auth/oauth2/authorization/google')
      })}><img src="/google-g.png" alt="" />Google로 계속하기</button>}
      <a data-quiet href={mode === 'register' ? '/login' : '/register'}
        aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault() }}>
        {mode === 'register' ? '로그인으로 돌아가기' : '이메일로 가입하기'}
      </a>
      {mode === 'login' && readAccount(LAST_ACCOUNT) && <button type="button" onClick={offline} disabled={busy}>이 기기의 로컬 원고 열기</button>}
    </div>
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
