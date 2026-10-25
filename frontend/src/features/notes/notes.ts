export interface NotePreview {
  id: string
  title: string
  excerpt: string
  date: string
  dateTime: string
  category: string
}

export const previewNotes: readonly NotePreview[] = [
  { id: 'little-things', title: 'Little things, big ideas.', excerpt: '당신의 생각이 끊기지 않도록', date: 'Oct 24', dateTime: '2026-10-24', category: 'Thoughts' },
  { id: 'slow-morning', title: 'A slower kind of morning', excerpt: 'Open the window. Make some coffee. Leave a little space before the day begins.', date: 'Oct 23', dateTime: '2026-10-23', category: 'Everyday' },
  { id: 'weekend', title: 'For the weekend', excerpt: 'The bookshop on the corner, a long walk, and absolutely no plans after that.', date: 'Oct 22', dateTime: '2026-10-22', category: 'Personal' },
  { id: 'someday', title: 'Someday, maybe', excerpt: 'Small ideas that don’t need to become anything just yet. Start a little garden…', date: 'Oct 20', dateTime: '2026-10-20', category: 'Ideas' },
]

export const selectedPreviewNote = previewNotes[0]
