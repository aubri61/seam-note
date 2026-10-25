const paths = {
  pencil: 'M16 3l5 5M3 21l5-1L21 7a2 2 0 0 0-4-4L4 16l-1 5z',
  sidebar: 'M3 4h18v16H3zM9 4v16',
  collapse: 'M13 6l-6 6 6 6M20 6l-6 6 6 6',
  chevron: 'M9 6l6 6-6 6',
  chevrons: 'M8 8l4-4 4 4M8 16l4 4 4-4',
  note: 'M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2M8 2h8v4H8zM8 11h8M8 15h5',
  folder: 'M3 8V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8h18',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l4 4L19 6',
  cloudCheck: 'M7 18H6a4 4 0 0 1-.6-7.95A6.5 6.5 0 0 1 18 8.5a4.75 4.75 0 0 1 .5 9.47M9 17l3 3 5-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  list: 'M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01',
  ordered: 'M10 6h11M10 12h11M10 18h11M3 4h1v5M2 9h4M2 15c0-3 4-3 4-1 0 1-4 4-4 5h4',
  disk: 'M4 4h16l2 8v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7l2-8zM2 12h20M6 16h.01M10 16h.01',
} as const

export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
