import { useCallback, useState } from 'react'
import { previewNotes } from '@/features/notes/notes'
import { getAncestors, getCreationParent, moveItems } from '@/features/folders/folderModel'
import type { FolderItem } from '@/features/folders/folderModel'

function initialItems(): FolderItem[] {
  return [
    { id: 'my-notes', parentId: null, kind: 'folder', title: 'My notes', content: '' },
    ...previewNotes.map(note => ({ id: note.id, parentId: 'my-notes', kind: 'document' as const, title: note.title, content: note.excerpt })),
    { id: 'work', parentId: null, kind: 'folder', title: 'Work', content: '' },
    { id: 'project-ideas', parentId: 'work', kind: 'document', title: 'Project ideas', content: '' },
    { id: 'journal', parentId: null, kind: 'folder', title: 'Journal', content: '' },
    { id: 'october', parentId: 'journal', kind: 'document', title: 'October reflections', content: '' },
  ]
}

export function useFolders() {
  const [items, setItems] = useState(initialItems)
  const [activeId, setActiveId] = useState(previewNotes[0].id)
  const [selectedId, setSelectedId] = useState(previewNotes[0].id)
  const [search, setSearch] = useState('')
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({ 'my-notes': true })
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [movedId, setMovedId] = useState<string | null>(null)
  const [focusTitleId, setFocusTitleId] = useState<string | null>(null)
  const acknowledgeTreeSelection = useCallback(() => {
    setCreatedId(null)
    setMovedId(null)
  }, [])
  const activeNote = items.find(item => item.id === activeId)!
  const ancestors = getAncestors(items, activeId)

  function create(kind: FolderItem['kind']) {
    const id = crypto.randomUUID()
    const parentId = getCreationParent(items, selectedId, activeId)
    const item: FolderItem = { id, parentId, kind, title: kind === 'folder' ? '새 폴더' : '', content: '' }
    setItems(current => [...current, item])
    setSearch('')
    const parentAncestors = parentId ? getAncestors(items, parentId) : []
    setOpenFolders(current => ({ ...current, ...Object.fromEntries(parentAncestors.map(parent => [parent.id, true])), ...(parentId ? { [parentId]: true } : {}) }))
    setSelectedId(id)
    setMovedId(null)
    setCreatedId(id)
    if (kind === 'document') {
      setActiveId(id)
      setFocusTitleId(id)
    }
    return id
  }

  function update(id: string, patch: Partial<Pick<FolderItem, 'title' | 'content'>>) {
    setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item))
  }

  function move(dragIds: string[], parentId: string | null, index: number) {
    const nextItems = moveItems(items, dragIds, parentId, index)
    if (nextItems === items) return
    const id = dragIds[0]
    setItems(nextItems)
    // Dragging an unselected row does not select it in Arborist.
    // Creation must follow the dropped item rather than an earlier folder selection.
    setSelectedId(id)
    setCreatedId(null)
    setMovedId(id)
    setOpenFolders(current => ({
      ...current,
      ...Object.fromEntries(getAncestors(nextItems, id).map(parent => [parent.id, true])),
    }))
  }

  return {
    items, activeId, selectedId, activeNote, ancestors, createdId, movedId, focusTitleId, search, setSearch, openFolders,
    create, update, move, acknowledgeTreeSelection,
    select: (id: string) => { setActiveId(id); setSelectedId(id) },
    selectTreeItem: setSelectedId,
    setFolderOpen: (id: string, open: boolean) => setOpenFolders(current => ({ ...current, [id]: open })),
  }
}
