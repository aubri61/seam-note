import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'
import { IconButton } from '@/components/primitives'
import { selectedPreviewNote } from '@/features/notes/notes'

const Panel = styled.section(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  background: theme.colors.surface,
}))

const Document = styled.div(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  width: '100%',
  padding: `${theme.spacing.xxxl} clamp(${theme.spacing.lg}, 7vw, calc(${theme.spacing.xxl} * 3)) ${theme.spacing.xl}`,
  [`@media (max-width: ${theme.breakpoints.mobile})`]: {
    padding: `${theme.spacing.xl} ${theme.spacing.lg} ${theme.spacing.lg}`,
  },
}))

const Title = styled.input(({ theme }) => ({
  width: '100%',
  minWidth: 0,
  padding: `${theme.spacing.xs} 0`,
  border: 0,
  background: 'transparent',
  fontSize: 'clamp(23px, 2.4vw, 36px)',
  fontWeight: 600,
  letterSpacing: '-1.2px',
}))

const Toolbar = styled.div(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing.xs,
  padding: `${theme.spacing.lg} 0 ${theme.spacing.lg}`,
  borderBottom: `1px solid ${theme.colors.border}`,
}))

const Writing = styled.div(({ theme }) => ({
  flex: 1,
  paddingTop: theme.spacing.xl,
  p: {
    color: theme.colors.mutedText,
    fontSize: '16px',
    lineHeight: 1.9,
  },
  textarea: {
    display: 'block',
    width: '100%',
    minHeight: '300px',
    resize: 'vertical',
    marginTop: theme.spacing.md,
    padding: `${theme.spacing.xs} 0`,
    border: 0,
    background: 'transparent',
    fontSize: '15px',
    lineHeight: 1.9,
    color: theme.colors.mutedText,
  },
  'textarea::placeholder': {
    color: theme.colors.mutedText,
    opacity: 1,
  },
}))

const Footer = styled.footer(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: theme.spacing.md,
  paddingTop: theme.spacing.xxl,
  fontSize: '11px',
  lineHeight: 1.7,
  color: theme.colors.mutedText,
  span: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
}))

export function NoteEditor() {
  return (
    <Panel aria-label="Note editor preview">
      <Document>
        <Title aria-label="Note title (read-only preview)" value={selectedPreviewNote.title} readOnly />
        <Toolbar role="group" aria-label="Formatting preview (not connected)">
          <IconButton type="button" disabled aria-label="Bold (coming later)" title="Formatting is not connected">
            <strong style={{ fontSize: 18 }}>B</strong>
          </IconButton>
          <IconButton type="button" disabled aria-label="Italic (coming later)" title="Formatting is not connected">
            <i style={{ fontFamily: 'Georgia, serif', fontSize: 20 }}>I</i>
          </IconButton>
          <IconButton type="button" disabled aria-label="Bullet list (coming later)" title="Formatting is not connected">
            <Icon name="list" size={19} />
          </IconButton>
          <IconButton type="button" disabled aria-label="Numbered list (coming later)" title="Formatting is not connected">
            <Icon name="ordered" size={19} />
          </IconButton>
        </Toolbar>
        <Writing>
          <p>당신의 생각이 끊기지 않도록</p>
          <textarea aria-label="Note body (read-only preview)" placeholder="Start writing, and let your ideas flow…" readOnly />
        </Writing>
        <Footer>
          <span>UI preview · Editing and sync aren’t connected yet.</span>
        </Footer>
      </Document>
    </Panel>
  )
}
