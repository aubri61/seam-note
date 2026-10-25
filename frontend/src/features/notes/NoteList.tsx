import styled from '@emotion/styled'
import { Icon } from '@/components/Icon'
import { Eyebrow, IconButton } from '@/components/primitives'
import { previewNotes, selectedPreviewNote } from '@/features/notes/notes'

const Panel = styled.section(({ theme }) => ({
  padding: `${theme.spacing.lg} ${theme.spacing.md}`,
  minWidth: 0,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.lg,
  background: theme.colors.sidebar,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `0 ${theme.spacing.sm} ${theme.spacing.md}`,
  },
  h2: {
    fontSize: '17px',
    fontWeight: 600,
    letterSpacing: '-.4px',
  },
  ul: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'grid',
    gap: theme.spacing.sm,
  },
  [`@media (max-width: ${theme.breakpoints.mobile})`]: {
    ul: {
      display: 'flex',
      overflowX: 'auto',
      paddingBottom: theme.spacing.sm,
      scrollSnapType: 'x proximity',
    },
    li: {
      flex: '0 0 240px',
      scrollSnapAlign: 'start',
    },
  },
}))
const Card = styled.article<{ selected: boolean }>(({ theme, selected }) => ({
  padding: theme.spacing.md,
  border: `1px solid ${selected ? theme.colors.border : 'transparent'}`,
  borderRadius: theme.radii.md,
  background: selected ? theme.colors.selected : 'transparent',
  h3: {
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: '-.2px',
  },
  p: {
    marginTop: theme.spacing.sm,
    color: theme.colors.mutedText,
    fontSize: '12px',
    lineHeight: 1.8,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    color: theme.colors.mutedText,
    fontSize: '10px',
  },
}))

const NewNoteButton = styled(IconButton)(({ theme }) => ({
  background: theme.colors.accent,
}))

const CollectionLabel = styled(Eyebrow)(({ theme }) => ({
  marginBottom: theme.spacing.xs,
}))

export function NoteList() {
  return <Panel aria-labelledby="notes-heading">
    <header>
      <div>
        <CollectionLabel>Your collection</CollectionLabel>
        <h2 id="notes-heading">My notes <span style={{ fontSize: 12, fontWeight: 400 }}>({previewNotes.length})</span></h2>
      </div>
      <NewNoteButton type="button" disabled aria-label="Create note (coming later)" title="Create note is not connected">
        <Icon name="plus" size={18} />
      </NewNoteButton>
    </header>
    <ul>
      {previewNotes.map(note => (
        <li key={note.id}>
          <Card selected={note.id === selectedPreviewNote.id} aria-label={note.id === selectedPreviewNote.id ? `${note.title} — selected preview` : undefined}>
            <h3>{note.title}</h3>
            <p>{note.excerpt}</p>
            <footer>
              <time dateTime={note.dateTime}>{note.date}</time>
              <span>{note.category}</span>
            </footer>
          </Card>
        </li>
      ))}
    </ul>
  </Panel>
}
