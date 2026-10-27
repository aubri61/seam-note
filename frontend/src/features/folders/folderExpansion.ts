// UI preferences only. Manuscripts remain in the Draft/IndexedDB repositories.
export const folderExpansionKey = 'seam-note:expanded-folders:v1'

export function readFolderExpansion(): Record<string, boolean> | null {
  try {
    const raw = localStorage.getItem(folderExpansionKey)
    if (raw === null) return null
    const ids: unknown = JSON.parse(raw)
    if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string' && id.length > 0)) return null
    return Object.fromEntries(ids.map(id => [id, true]))
  } catch { return null }
}

export function writeFolderExpansion(folders: Record<string, boolean>): void {
  try {
    localStorage.setItem(folderExpansionKey, JSON.stringify(Object.keys(folders).filter(id => folders[id])))
  } catch { /* Blocked storage/quota must not interrupt tree interaction. */ }
}
