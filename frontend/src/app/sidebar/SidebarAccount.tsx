import { useContext, useId, useState } from 'react'
import type { ContextType, FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import styled from '@emotion/styled'
import { WorkspaceAccount } from '@/features/auth/workspaceAccount'
import { actionStyle, fieldStyle } from '@/styles/controls'

const Box = styled.footer(({ theme }) => ({
  flexShrink: 0,
  marginTop: theme.spacing.control,
  padding: theme.spacing.control,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.md,
  background: theme.colors.surface,
  fontSize: 13,
  '& .profile': { display: 'flex', alignItems: 'center', gap: theme.spacing.sm },
  '& .profile-name': { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 },
  '& img': { flexShrink: 0 },
  '& button': { ...actionStyle(theme, 'ghost', true), paddingInline: theme.spacing.sm },
  '& .settings-toggle': { display: 'grid', placeItems: 'center', alignSelf: 'flex-start', flexShrink: 0 },
  '& .account-actions': { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: theme.spacing.xxs, marginTop: theme.spacing.xs },
  '& p': { color: theme.colors.mutedText, overflowWrap: 'anywhere', marginTop: theme.spacing.xs, fontSize: 12 },
}))

const Overlay = styled(Dialog.Overlay)({
  position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(36, 35, 32, .24)',
})

const Settings = styled(Dialog.Content)(({ theme }) => ({
  position: 'fixed', zIndex: 31, top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  width: 'min(620px, calc(100% - 24px))', maxHeight: 'calc(100dvh - 24px)', overflow: 'auto',
  display: 'grid', gridTemplateColumns: 'minmax(112px, 1fr) minmax(0, 2fr)',
  border: `1px solid ${theme.colors.border}`, borderRadius: theme.radii.panel,
  background: theme.colors.surface, boxShadow: theme.shadow,
  '& .close': { display: 'grid', placeItems: 'center', minWidth: 32, padding: 0 },
  '& .settings-panel': { padding: theme.spacing.lg, minWidth: 0 },
  '& header': { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.xs },
  '& header h2': { fontSize: 18, margin: 0 },
  '& form': { display: 'grid', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  '& label': { fontSize: 13, fontWeight: 600 },
  '& input': { ...fieldStyle(theme), width: '100%', minWidth: 0 },
  '& button': actionStyle(theme, 'ghost', true),
  '& .save': { ...actionStyle(theme, 'primary', true), justifySelf: 'end' },
  '& .logout': { marginTop: theme.spacing.lg, paddingTop: theme.spacing.sm, borderTop: `1px solid ${theme.colors.border}` },
  '& [role="status"], & [role="alert"]': { fontSize: 13, overflowWrap: 'anywhere' },
  '@media (max-width: 440px)': {
    gridTemplateColumns: 'minmax(84px, 1fr) minmax(0, 2.5fr)',
    '& .settings-panel': { padding: theme.spacing.control },
  },
}))

const SettingsMenu = styled.nav(({ theme }) => ({
  minWidth: 0,
  padding: theme.spacing.lg,
  background: theme.colors.sidebar,
  borderRight: `1px solid ${theme.colors.border}`,
  '& h2': { color: theme.colors.mutedText, fontSize: 14, fontWeight: 600, margin: 0 },
  '& ul': { listStyle: 'none', padding: 0, margin: `${theme.spacing.md} 0 0` },
  '& li': {
    padding: `${theme.spacing.sm} ${theme.spacing.control}`,
    borderRadius: theme.radii.sm,
    background: theme.colors.selected,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: 600,
    overflowWrap: 'anywhere',
  },
  '@media (max-width: 440px)': { padding: theme.spacing.control },
}))

function SettingsPanel({ account }: { account: NonNullable<ContextType<typeof WorkspaceAccount>> }) {
  const nicknameId = useId()
  const [name, setName] = useState(account.nickname)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const nickname = name.trim()
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || account.busy || nickname.length < 2 || nickname.length > 30 || nickname === account.nickname) return
    setSaving(true)
    setSaveError('')
    try {
      await account.onRename(nickname)
      setName(nickname)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '이름을 저장하지 못했어요.')
    } finally { setSaving(false) }
  }

  return <Settings aria-describedby={undefined}>
    <SettingsMenu aria-label="설정 메뉴">
      <Dialog.Title>설정</Dialog.Title>
      <ul><li aria-current="page">프로필 설정</li></ul>
    </SettingsMenu>
    <div className="settings-panel">
      <header>
        <h2>프로필 설정</h2>
        <Dialog.Close className="close" type="button" aria-label="환경설정 닫기">
          <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </Dialog.Close>
      </header>
      <form onSubmit={save}>
        <label htmlFor={nicknameId}>이름</label>
        <input id={nicknameId} value={name} autoComplete="nickname" minLength={2} maxLength={30}
          onChange={event => { setName(event.target.value); setSaveError('') }} disabled={saving || account.busy} required />
        <button type="submit" className="save" disabled={saving || account.busy || nickname.length < 2 || nickname.length > 30 || nickname === account.nickname}>
          {saving ? '저장 중…' : '이름 저장'}
        </button>
        {saveError && <p role="alert">{saveError}</p>}
      </form>
      <div className="logout">
        <button type="button" disabled={saving || account.busy} onClick={account.onLogout}>로그아웃</button>
        {account.message && <p role="status">{account.message}</p>}
      </div>
    </div>
  </Settings>
}

export function SidebarAccount() {
  const account = useContext(WorkspaceAccount)
  if (!account) return null

  return <Dialog.Root>
    <Box aria-label="계정">
      <div className="profile">
        <img src="/default-avatar.svg" width={32} height={32} alt="" />
        <span className="profile-name" title={account.nickname}>{account.nickname}</span>
        <Dialog.Trigger className="settings-toggle" type="button" title="환경설정" aria-label="환경설정" disabled={account.busy}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 4.8 9.8 2h4.4l.8 2.8 2 .9 2.6-.9 2.2 3.8-2 2v2.8l2 2-2.2 3.8-2.6-.9-2 .9-.8 2.8H9.8L9 19.2l-2-.9-2.6.9-2.2-3.8 2-2v-2.8l-2-2 2.2-3.8 2.6.9z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Dialog.Trigger>
      </div>
      <div className="account-actions">
        <button type="button" disabled={account.busy} onClick={account.onLogout}>로그아웃</button>
      </div>
      {account.message && <p role="status">{account.message}</p>}
    </Box>
    <Dialog.Portal>
      <Overlay />
      <SettingsPanel account={account} />
    </Dialog.Portal>
  </Dialog.Root>
}
