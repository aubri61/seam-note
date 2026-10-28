import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'

export type FolderAction = 'add-folder' | 'add-note' | 'rename' | 'delete'
const Trigger = styled.button(({ theme }) => ({
  position:'relative',zIndex:2,marginLeft: 'auto', flexShrink: 0, width: 28, height: 28, display: 'grid', placeItems: 'center',
  border: 0, borderRadius: theme.radii.sm, color: theme.colors.mutedText, background: 'transparent', cursor: 'pointer',
  '&:not(:disabled):hover': { background: theme.colors.selected },
}))
const Popup = styled.div(({ theme }) => ({
  position: 'fixed', zIndex: 50, width: 172, padding: theme.spacing.xs,
  border: `1px solid ${theme.colors.border}`, borderRadius: theme.radii.md, background: theme.colors.surface, boxShadow: theme.shadow,
  button: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 36, border: 0, borderRadius: theme.radii.sm,
    padding: '8px 10px', textAlign: 'left', fontSize: 12, background: 'transparent', color: theme.colors.text, cursor: 'pointer' },
  'button:hover, button:focus-visible': { background: theme.colors.selected },
  'button:disabled': { opacity: .5, cursor: 'not-allowed' },
}))
export function FolderMenu({ name, tabIndex, disabled, onAction, kind='folder' }: {
  kind?: 'folder'|'note'; name: string; tabIndex: number; disabled: boolean; onAction: (action: FolderAction) => void
}) {
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{top: number; left: number; container: Element} | null>(null)
  useEffect(() => {
    if (!position) return
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null)
    }
    const close = () => setPosition(null)
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true) }
  }, [position])
  function close() { setPosition(null); trigger.current?.focus() }
  return <>
    <Trigger ref={trigger} data-folder-menu data-item-menu type="button" tabIndex={tabIndex} aria-label={`${name} ${kind==='folder'?'폴더':'원고'} 메뉴`}
      disabled={disabled} aria-haspopup="menu" aria-expanded={!!position}
      onKeyDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation()
        if (position) { close(); return }
        const bounds = event.currentTarget.getBoundingClientRect()
        setPosition({container: event.currentTarget.closest('[role="dialog"]') ?? document.body, top: Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 166)), left: Math.max(8, Math.min(bounds.right - 172, window.innerWidth - 180))})
      }}><Icon name="more" size={17} /></Trigger>
    {position && createPortal(<Popup ref={menu} role="menu" aria-label={`${name} ${kind==='folder'?'폴더':'원고'} 작업`} style={{top:position.top,left:position.left}}
      onClick={event => event.stopPropagation()} onKeyDown={event => {
        event.stopPropagation()
        if (event.key === 'Escape') { event.preventDefault(); close() }
        else if (event.key === 'Tab') close()
        else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
          event.preventDefault()
          const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
          const index = items.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          items[next]?.focus()
        }
      }}>
      {(kind==='note'?[['delete','trash','원고 삭제']] as const:[['add-folder','folder','폴더 추가'], ['add-note','note','문서 추가'], ['rename','pencil','이름 변경'], ['delete','trash','폴더 삭제']] as const).map(([action, icon, label]) =>
        <button key={action} role="menuitem" type="button" onClick={() => { close(); onAction(action) }}><Icon name={icon} size={15} />{label}</button>)}
    </Popup>, position.container)}
  </>
}
