import { updateReloadGate } from '@/features/pwa/appUpdate'
import { WorkspaceAccount } from './workspaceAccount'
import { useEffect, useLayoutEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import styled from '@emotion/styled'
import { actionStyle, fieldStyle } from '@/styles/controls'
import { ApiError, configureAuthRecovery, getJson } from '@/lib/api/client'
import { queryClient } from '@/lib/query/queryClient'
import { accessTokenStore } from './accessTokenStore'
import { loginWithPassword, logoutOnServer, refreshAuthentication, renameProfile, signupWithPassword } from './authApi'
import { withAuthLock } from './refreshCoordinator'
import { ACTIVE_ACCOUNT, AUTH_FENCE, LOGOUT_PENDING, documentAccount, flushAccountDrafts,
  businessAccess, prepareAuthChange, readAccount, sameAccount, saveAccount, setBusinessAccess } from './authRuntime'

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
const VERIFIED_SESSION = 'seam-note:verified-session:v1'

function sessionScope() {
  if (localStorage.getItem(LOGOUT_PENDING) || !sameAccount(documentAccount, readAccount())) return null
  return JSON.stringify([documentAccount?.id, documentAccount?.issuer, documentAccount?.audience, localStorage.getItem(AUTH_FENCE)])
}

function isNetworkError(error: unknown) {
  return error instanceof ApiError && error.code === 'NETWORK_ERROR'
}

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
  const [nickname, setNickname] = useState(documentAccount?.nickname || '개인 계정')
  const [frozen, setFrozen] = useState(false)
  useLayoutEffect(() => updateReloadGate.register(() => {
    if (busy || mode === 'checking') return null
    return () => mode !== 'workspace' || navigator.onLine !== false || !!sessionScope()
  }), [busy, mode])
  useEffect(() => {
    let active = true
    void getJson<{googleEnabled: boolean}>('/auth/config').then(config => { if (active) setGoogleEnabled(config.googleEnabled === true) }).catch(() => {})
    const freeze = (notice: string) => {
      sessionStorage.removeItem(VERIFIED_SESSION)
      setBusinessAccess(false)
      accessTokenStore.clear()
      void queryClient.cancelQueries()
      setFrozen(true)
      setMessage(notice)
      void flushAccountDrafts().catch(() => setMessage('저장되지 않은 입력이 있어 이 탭을 닫지 말고 다시 로그인해주세요.'))
    }
    const verify = async () => {
      const fence = localStorage.getItem(AUTH_FENCE)
      await finishPendingLogout()
      const generation = accessTokenStore.generation()
      const user = await refreshAuthentication()
      if (!active) return
      if (generation !== accessTokenStore.generation() || fence !== localStorage.getItem(AUTH_FENCE)) throw new Error('계정이 변경되었습니다.')
      if (!documentAccount) { saveAccount(user); location.replace('/'); return }
      const scope = sessionScope()
      if (!scope || !sameAccount(documentAccount, user)) throw new Error('계정이 변경되었습니다.')
      sessionStorage.setItem(VERIFIED_SESSION, scope)
      setNickname(user.nickname)
      setBusinessAccess(true)
      setMode('workspace')
    }
    const recover = async () => {
      try {
        await verify()
      } catch (error) {
        if (active && !isNetworkError(error)) freeze('다시 로그인해주세요.')
        throw error
      }
    }
    configureAuthRecovery(recover)
    const changed = (event: StorageEvent) => {
      if (![ACTIVE_ACCOUNT, AUTH_FENCE, LOGOUT_PENDING, null].includes(event.key)) return
      freeze('다른 탭에서 로그인 상태를 변경했습니다. 다시 로그인해주세요.')
    }
    const reconnected = () => {
      const scope = sessionScope()
      if (!authPage() && !businessAccess() && scope && sessionStorage.getItem(VERIFIED_SESSION) === scope) {
        void recover().catch(() => {})
      }
    }
    window.addEventListener('storage', changed)
    window.addEventListener('online', reconnected)
    const bootstrap = async () => {
      if (authPage()) {
        sessionStorage.removeItem(VERIFIED_SESSION)
        return
      }
      const scope = sessionScope()
      try {
        await verify()
      } catch (error) {
        if (!active) return
        const verified = scope && scope === sessionScope() && sessionStorage.getItem(VERIFIED_SESSION) === scope
        if (verified && isNetworkError(error)) {
          setMode('workspace')
          return
        }
        sessionStorage.removeItem(VERIFIED_SESSION)
        setBusinessAccess(false)
        setMode('login')
      }
    }
    void bootstrap()
    return () => {
      active = false
      configureAuthRecovery(undefined)
      window.removeEventListener('storage', changed)
      window.removeEventListener('online', reconnected)
    }
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
  const logout = () => void act(async () => {
    await prepareAuthChange()
    // Persist before contacting the server: offline logout must survive reload.
    localStorage.setItem(LOGOUT_PENDING, '1')
    localStorage.removeItem(ACTIVE_ACCOUNT)
    try { await finishPendingLogout() } catch { /* pending marker blocks future silent refresh */ }
    location.replace('/login')
  })
  if (mode === 'checking') return <Card><p role="status">로그인 상태 확인 중…</p></Card>
  if (mode === 'login' || mode === 'register') return <Card>
    <Brand><img src="/seam-note-icon.png" alt="" /></Brand>
    <h1>{mode === 'register' ? '이메일로 가입하기' : 'Seam Note'}</h1>
    <p className="auth-intro">당신의 생각이 끊기지 않도록</p>
    {mode === 'register' ? <RegisterForm busy={busy} onSubmit={register} /> : <LoginForm busy={busy} onSubmit={login} />}
    <div className="auth-options">
      {googleEnabled && <button data-google type="button" disabled={busy} onClick={() => void act(async () => {
        await prepareAuthChange(); await finishPendingLogout(); localStorage.removeItem(ACTIVE_ACCOUNT); location.assign('/api/auth/oauth2/authorization/google')
      })}><img src="/google-g.png" alt="" />Google로 계속하기</button>}
      <a data-quiet href={mode === 'register' ? '/login' : '/register'}
        aria-disabled={busy || undefined} onClick={event => { if (busy) event.preventDefault() }}>
        {mode === 'register' ? '로그인으로 돌아가기' : '이메일로 가입하기'}
      </a>
    </div>
    {message && <p role="status">{message}</p>}
  </Card>
  return <WorkspaceAccount.Provider value={frozen ? null : {
    nickname, busy, message, onLogout: logout,
    onRename: async (nextName) => {
      if (!businessAccess()) throw new Error('이름을 바꾸려면 다시 로그인해주세요.')
      const user = await renameProfile(nextName)
      setNickname(user.nickname)
    },
  }}>
    {frozen && <Card>
      <h1>Seam Note</h1>
      {message && <p role="status">{message}</p>}
      <div className="auth-options">
        <button type="button" disabled={busy} onClick={logout}>로그아웃</button>
      </div>
    </Card>}
    <div hidden={frozen} inert={frozen || busy}>{children}</div>
  </WorkspaceAccount.Provider>
}
