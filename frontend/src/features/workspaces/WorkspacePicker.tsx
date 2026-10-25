import { useRef } from 'react'
import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'
import { Eyebrow } from '@/components/primitives'

const Picker = styled.details(({ theme }) => ({
  position: 'relative',
  marginBottom: theme.spacing.md,
  '> summary': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: '64px',
    padding: theme.spacing.md,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.md,
    background: theme.colors.surface,
    cursor: 'pointer',
    listStyle: 'none',
    transition: `background ${theme.motion.duration[100]} ${theme.motion.easing.standard}`,
  },
  '> summary::-webkit-details-marker': {
    display: 'none',
  },
  '> summary:hover': {
    background: theme.colors.selected,
  },
  '> summary > div': {
    flex: 1,
    minWidth: 0,
  },
  strong: {
    display: 'block',
    marginTop: theme.spacing.xs,
    fontSize: '13px',
    fontWeight: 550,
  },
  '&[open] > summary': {
    background: theme.colors.selected,
  },
}))

const WorkspaceAvatar = styled.span(({ theme }) => ({
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
  width: '30px',
  height: '32px',
  borderRadius: theme.radii.sm,
  background: theme.colors.accent,
  fontSize: '13px',
  fontWeight: 600,
}))

const Dropdown = styled.div(({ theme }) => ({
  position: 'absolute',
  zIndex: 5,
  top: `calc(100% + ${theme.spacing.sm})`,
  left: 0,
  width: '100%',
  padding: `${theme.spacing.md} ${theme.spacing.sm} ${theme.spacing.sm}`,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.md,
  background: theme.colors.surface,
  boxShadow: '0 8px 28px rgba(36, 35, 32, .1)',
  h2: {
    padding: `0 ${theme.spacing.sm} ${theme.spacing.md}`,
    fontSize: '12px',
    fontWeight: 500,
    color: theme.colors.mutedText,
  },
  p: {
    padding: `${theme.spacing.sm} ${theme.spacing.sm} ${theme.spacing.xs}`,
    fontSize: '10px',
    color: theme.colors.mutedText,
    lineHeight: 1.6,
  },
}))

const WorkspaceOption = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.sm,
  padding: theme.spacing.sm,
  borderRadius: theme.radii.sm,
  background: theme.colors.selected,
  fontSize: '13px',
  '> span:nth-of-type(2)': {
    flex: 1,
  },
}))

export function WorkspacePicker() {
  const pickerRef = useRef<HTMLDetailsElement>(null)
  const summaryRef = useRef<HTMLElement>(null)

  return (
    <Picker
      ref={pickerRef}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false
      }}
      onKeyDown={event => {
        if (event.key === 'Escape' && event.currentTarget.open) {
          event.preventDefault()
          event.currentTarget.open = false
          summaryRef.current?.focus()
        }
      }}
    >
      <summary ref={summaryRef} aria-label="워크스페이스 선택: Personal">
        <WorkspaceAvatar>P</WorkspaceAvatar>
        <div><Eyebrow>워크스페이스</Eyebrow><strong>Personal</strong></div>
        <Icon name="chevrons" size={16} />
      </summary>
      <Dropdown>
        <h2>워크스페이스</h2>
        <WorkspaceOption aria-label="Personal — 현재 워크스페이스">
          <WorkspaceAvatar>P</WorkspaceAvatar><span>Personal</span><Icon name="check" size={16} />
        </WorkspaceOption>
        <p>현재 워크스페이스 · 전환 기능은 준비 중입니다.</p>
      </Dropdown>
    </Picker>
  )
}
