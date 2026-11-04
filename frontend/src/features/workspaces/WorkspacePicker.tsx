import { useRef } from 'react'
import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'
import { controlFocus } from '@/styles/controls'

const Picker = styled.details(({ theme }) => ({
  position: 'relative',
  marginBottom: theme.spacing.control,
  '> summary': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 36,
    padding: `${theme.spacing.xs} ${theme.spacing.control}`,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.sm,
    background: theme.colors.sidebar,
    color: theme.colors.text,
    '&:focus-visible': controlFocus(theme),
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
  '> summary strong': {
    flex: 1,
    minWidth: 0,
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
  width: 24,
  height: 24,
  borderRadius: theme.radii.sm,
  background: theme.colors.accent,
  fontSize: 12,
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
        <strong>Personal</strong>
        <Icon name="chevrons" size={14} />
      </summary>
      <Dropdown>
        <h2>워크스페이스</h2>
        <WorkspaceOption aria-label="Personal — 현재 워크스페이스">
          <WorkspaceAvatar>P</WorkspaceAvatar><span>Personal</span><Icon name="check" size={16} />
        </WorkspaceOption>
      </Dropdown>
    </Picker>
  )
}
