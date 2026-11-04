import { useContext, useId, useRef, useState } from 'react'
import type { ContextType, FormEvent } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import styled from '@emotion/styled'
import { WorkspaceAccount } from '@/features/auth/workspaceAccount'
import { Icon } from '@/components/Icon'
import { actionStyle, controlFocus, fieldStyle } from '@/styles/controls'

const ProfilePicker = styled.details(({ theme }) => ({
  position: 'relative',
  flexShrink: 0,
  marginTop: theme.spacing.sm,
  '> summary': {
    display: 'grid', placeItems: 'center', width: 36, height: 36,
    borderRadius: theme.radii.pill, listStyle: 'none', cursor: 'pointer',
    '&:focus-visible': controlFocus(theme),
    '@media (pointer: coarse)': { width: 44, height: 44 },
  },
  '> summary::-webkit-details-marker': { display: 'none' },
  '> summary:hover, &[open] > summary': { background: theme.colors.selected },
  img: { display: 'block', borderRadius: theme.radii.pill },
}))

const AccountActions = styled.div(({ theme }) => ({
  position: 'absolute', bottom: `calc(100% + ${theme.spacing.sm})`, left: 0, zIndex: 6,
  width: 160, padding: theme.spacing.xs,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.md, background: theme.colors.surface, boxShadow: theme.shadow,
  '& button': {
    ...actionStyle(theme, 'ghost', true),
    display: 'flex', alignItems: 'center', gap: theme.spacing.sm,
    width: '100%', color: theme.colors.text, textAlign: 'left',
  },
}))

const AccountNotice = styled.p(({ theme }) => ({
  color: theme.colors.mutedText, overflowWrap: 'anywhere', marginTop: theme.spacing.xs, fontSize: 12,
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

function SettingsPanel({ account, onCloseFocus }: {
  account: NonNullable<ContextType<typeof WorkspaceAccount>>
  onCloseFocus: () => void
}) {
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

  return <Settings aria-describedby={undefined} onCloseAutoFocus={event => { event.preventDefault(); onCloseFocus() }}>
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
  const picker = useRef<HTMLDetailsElement>(null)
  const trigger = useRef<HTMLElement>(null)
  if (!account) return null

  function closePicker() {
    if (picker.current) picker.current.open = false
  }

  return <Dialog.Root>
    <ProfilePicker ref={picker}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) closePicker() }}
      onKeyDown={event => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return
        event.preventDefault()
        event.stopPropagation()
        closePicker()
        trigger.current?.focus()
      }}>
      <summary ref={trigger} aria-label={`${account.nickname} 프로필 메뉴`} title={account.nickname}>
        <img src="/default-avatar.svg" width={32} height={32} alt="" />
      </summary>
      <AccountActions aria-label="프로필 작업">
        <Dialog.Trigger asChild>
          <button type="button" disabled={account.busy} onClick={closePicker}><Icon name="settings" size={16} />설정</button>
        </Dialog.Trigger>
        <button type="button" disabled={account.busy} onClick={() => {
          closePicker()
          trigger.current?.focus()
          account.onLogout()
        }}><Icon name="logout" size={16} />로그아웃</button>
      </AccountActions>
    </ProfilePicker>
    {account.message && <AccountNotice role="status">{account.message}</AccountNotice>}
    <Dialog.Portal>
      <Overlay />
      <SettingsPanel account={account} onCloseFocus={() => trigger.current?.focus()} />
    </Dialog.Portal>
  </Dialog.Root>
}
