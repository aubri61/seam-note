import type { Note } from '@/lib/api/types'
import { editDraft, isDraftDirty, receiveServerNote } from '@/features/notes/noteDrafts'
import type { DraftPatch, NoteDraft } from '@/features/notes/noteDrafts'
import { DRAFT_CHANNEL, LocalDraftConflict, LocalNoteDeleted } from './localDraftTypes'
import type { DraftRepository, LocalNoteDraft } from './localDraftTypes'

export type LocalPhase = 'recovering' | 'waiting' | 'saving' | 'saved' | 'failed' | 'conflict'
export interface DraftEntry {
  draft: NoteDraft | null
  revision: number
  savedRevision: number
  savedAt: number | null
  phase: LocalPhase
  error: string | null
  serverProtected?: boolean
}
interface WorkingEntry extends DraftEntry {
  deleted?: boolean
  checkpoint?: NoteDraft
  headCheckRequested?: boolean
  casRecoveryUsed?: boolean
  ready: boolean
  edited: boolean
  token?: string
  server: Note | null
  reading?: Promise<void>
  writing?: Promise<void>
  timer?: ReturnType<typeof setTimeout>
  firstPendingAt?: number
  lastChangedAt?: number
  acknowledging?: boolean
  flushRequested: boolean
}
export interface DraftClock {
  now(): number
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>
  clearTimeout(timer: ReturnType<typeof setTimeout>): void
}
const clock: DraftClock = { now: () => Date.now(), setTimeout: (fn, delay) => setTimeout(fn, delay), clearTimeout: timer => clearTimeout(timer) }
export function sameDraft(a: NoteDraft, b: NoteDraft) {
  return a.noteId === b.noteId && a.title === b.title && a.content === b.content && a.baseVersion === b.baseVersion
    && a.baseTitle === b.baseTitle && a.baseContent === b.baseContent && a.latestServerVersion === b.latestServerVersion
}
function sameText(a: NoteDraft, b: NoteDraft) {
  return a.noteId === b.noteId && a.title === b.title && a.content === b.content
}
function fromRecord(record: LocalNoteDraft): NoteDraft {
  const { noteId, title, content, baseVersion, baseTitle, baseContent, latestServerVersion } = record
  return { noteId, title, content, baseVersion, baseTitle, baseContent, latestServerVersion }
}
function failureMessage(error: unknown) {
  const name = error instanceof Error ? error.name : 'UnknownError'
  if (name === 'LocalDraftConflict') return '다른 탭 또는 로컬 원고가 변경되어 저장을 중단했습니다. 현재 입력은 유지됩니다. 이 탭과 다른 탭의 원고가 달라졌거나 저장 기준을 안전하게 확인할 수 없습니다. 현재 입력을 복사하거나 파일로 보관한 뒤 다른 탭을 확인해주세요. 새로고침·탭 종료 시 아직 로컬 저장되지 않은 입력이 사라질 수 있습니다.'
  if (name === 'MissingDraftRecoveryBlocked') return '로컬 Draft 기록이 삭제됐지만 남은 전송 작업을 안전하게 확인하지 못해 재생성을 중단했습니다. 현재 입력은 메모리에 유지됩니다. 입력을 보관하고 미확정 작업을 확인해주세요.'
  if (name === 'QuotaExceededError') return '브라우저 저장 공간이 부족해 로컬 저장에 실패했습니다. 현재 입력은 메모리에 유지됩니다.'
  if (name === 'InvalidLocalDraft') return '기존 로컬 원고의 형식을 확인할 수 없어 덮어쓰지 않았습니다. 현재 입력을 보관하고 저장소 상태를 확인해주세요.'
  return '로컬 저장소를 읽거나 저장하지 못했습니다. 현재 입력은 메모리에 유지됩니다. 저장소 이용 설정을 확인하고 다시 시도해주세요.'
}
export function hasUnprotectedChanges(entries: Readonly<Record<string, DraftEntry>>) {
  return Object.values(entries).some(entry => !!entry.draft && (
    entry.phase === 'conflict' || entry.phase === 'failed' || entry.revision > entry.savedRevision
      && (isDraftDirty(entry.draft) || entry.savedRevision > 0)
  ))
}

/** One instance per AppLayout. No global draft store; repository connections are shared. */
export class DraftSession {
  private repository: DraftRepository
  private clock: DraftClock
  private writerId: string
  private entries = new Map<string, WorkingEntry>()
  private snapshot: Readonly<Record<string, DraftEntry>> = {}
  private listeners = new Set<() => void>()
  private channel: BroadcastChannel | null = null
  constructor(repository: DraftRepository, writerId: string, timing: DraftClock = clock) {
    this.repository = repository; this.writerId = writerId; this.clock = timing
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private entry(id: string) {
    let entry = this.entries.get(id)
    if (!entry) {
      entry = { draft: null, revision: 0, savedRevision: 0, savedAt: null, phase: 'recovering', error: null,
        ready: false, edited: false, server: null, flushRequested: false }
      this.entries.set(id, entry)
    }
    return entry
  }
  private publish(id: string) {
    const { draft, revision, savedRevision, savedAt, phase, error, serverProtected } = this.entry(id)
    this.snapshot = { ...this.snapshot, [id]: { draft, revision, savedRevision, savedAt, phase, error, serverProtected } }
    this.listeners.forEach(listener => listener())
  }
  private stopTimer(entry: WorkingEntry) {
    if (entry.timer !== undefined) this.clock.clearTimeout(entry.timer)
    entry.timer = undefined
  }
  private fail(id: string, error: unknown) {
    const entry = this.entry(id)
    this.stopTimer(entry)
    if(error instanceof LocalNoteDeleted){entry.deleted=true;entry.draft=null;entry.server=null;entry.ready=true;entry.revision=0;entry.savedRevision=0;entry.error=null;entry.phase='saved';this.publish(id);return}
    entry.phase = error instanceof LocalDraftConflict ? 'conflict' : 'failed'
    entry.error = failureMessage(error)
    // Never log draft bodies, titles, raw error payloads or records.
    console.warn('[Seam Note] local draft operation failed', { noteId: id, errorName: error instanceof Error ? error.name : 'UnknownError' })
    this.publish(id)
  }
  select(id: string) {
    const entry = this.entry(id)
    if (entry.ready || entry.reading || entry.phase === 'failed' || entry.phase === 'conflict') return
    void this.recover(id)
  }
  private recover(id: string): Promise<void> {
    const entry = this.entry(id)
    if (entry.reading) return entry.reading
    entry.phase = 'recovering'; entry.error = null
    this.publish(id)
    entry.reading = this.repository.read(id, { initial: !entry.checkpoint && !entry.token && entry.savedRevision === 0 }).then(record => {
      if(entry.deleted)return
      const memory = entry.draft
      if (record) {
        entry.serverProtected = !!record.serverOperationPending
        const stored = fromRecord(record)
        if (memory && entry.edited && isDraftDirty(stored) && !sameDraft(memory, stored)) throw new LocalDraftConflict()
        entry.checkpoint = stored
        entry.token = record.storageToken
        entry.savedRevision = record.localRevision
        entry.savedAt = record.localSavedAt
        if (!memory || !entry.edited || sameDraft(memory, stored)) {
          entry.draft = stored; entry.revision = record.localRevision
        } else entry.revision = Math.max(entry.revision, record.localRevision + 1)
      }
      entry.ready = true; entry.phase = 'saved'; entry.error = null
      this.applyServer(id)
      if (entry.draft && entry.revision > entry.savedRevision) this.schedule(id)
      this.publish(id)
      void this.checkHead(id)
    }).catch(error => {
      // Failure is not proof that no local draft exists. Allow memory edits but no blind writes.
      entry.ready = false
      this.applyServer(id)
      this.fail(id, error)
    }).finally(() => { entry.reading = undefined })
    return entry.reading
  }
  receive(note: Note) {
    const entry = this.entry(note.id)
    if(entry.deleted)return
    if (!entry.server || note.version >= entry.server.version) entry.server = note
    if (!entry.acknowledging && (entry.ready || entry.phase === 'failed')) this.applyServer(note.id)
    this.publish(note.id)
  }
  private applyServer(id: string) {
    const entry = this.entry(id)
    if (!entry.server) return
    const drafts = entry.draft ? { [id]: entry.draft } : {}
    // A clean revert can still compensate an uncertain server write. Dirty alone is insufficient.
    const next = entry.serverProtected && entry.draft
      ? entry.server.version > entry.draft.latestServerVersion
        ? { ...entry.draft, latestServerVersion: entry.server.version } : entry.draft
      : receiveServerNote(drafts, entry.server)[id]
    if (next === entry.draft) return
    entry.draft = next; entry.revision++
    if (entry.ready) this.schedule(id)
  }
  edit(id: string, patch: DraftPatch) {
    const entry = this.entry(id)
    if(entry.deleted)return
    if (!entry.draft) return
    const next = editDraft({ [id]: entry.draft }, id, patch)[id]
    if (next === entry.draft) return
    entry.draft = next; entry.revision++; entry.edited = true; entry.casRecoveryUsed = false
    if (entry.ready && entry.phase !== 'conflict' && entry.phase !== 'failed') this.schedule(id)
    this.publish(id)
  }
  private schedule(id: string) {
    const entry = this.entry(id)
    if (entry.acknowledging) { if (!['failed', 'conflict'].includes(entry.phase)) entry.phase = 'waiting'; return }
    if (!entry.ready || !entry.draft || entry.phase === 'conflict' || entry.phase === 'failed') return
    const now = this.clock.now()
    entry.firstPendingAt ??= now
    entry.lastChangedAt = now
    if (!entry.writing) entry.phase = 'waiting'
    this.stopTimer(entry)
    const delay = Math.max(0, Math.min(400, entry.firstPendingAt + 2000 - now))
    entry.timer = this.clock.setTimeout(() => { entry.timer = undefined; void this.flush(id) }, delay)
  }
  flush(id: string): Promise<void> {
    const entry = this.entry(id)
    if (entry.deleted || entry.acknowledging || !entry.ready || !entry.draft || entry.phase === 'conflict' || entry.phase === 'failed' || entry.revision <= entry.savedRevision) return Promise.resolve()
    if (entry.writing) { entry.flushRequested = true; return entry.writing }
    this.stopTimer(entry)
    const draft = entry.draft, revision = entry.revision, expected = entry.token
    entry.phase = 'saving'; entry.firstPendingAt = undefined; entry.flushRequested = false
    this.publish(id)
    entry.writing = this.repository.write(draft, revision, expected, this.writerId).then(record => {
      if(entry.deleted)return
      entry.checkpoint = fromRecord(record); entry.casRecoveryUsed = false
      entry.token = record.storageToken; entry.savedRevision = revision; entry.savedAt = record.localSavedAt
      entry.phase = entry.revision === revision ? 'saved' : 'waiting'; entry.error = null
      this.channel?.postMessage({ noteId: id, writerId: this.writerId })
      this.publish(id)
    }).catch(async error => {
      // A missed notification can reach the transaction CAS first. Re-read once;
      // the retry still uses the repository's original token/revision CAS.
      if (error instanceof LocalDraftConflict && !entry.casRecoveryUsed && !entry.acknowledging) {
        entry.casRecoveryUsed = true
        try {
          const record = await this.repository.read(id)
          if (!entry.acknowledging && (record ? this.reconcile(id, record) : await this.restoreMissing(id))) { entry.flushRequested = true; return }
        } catch (readError) { this.fail(id, readError); return }
      }
      this.fail(id, error)
    }).finally(() => {
      entry.writing = undefined
      if (entry.headCheckRequested) { entry.headCheckRequested = false; void this.checkHead(id) }
      if (entry.phase === 'failed' || entry.phase === 'conflict' || entry.revision <= entry.savedRevision) return
      if (entry.flushRequested || this.clock.now() - (entry.lastChangedAt ?? 0) >= 400 || this.clock.now() - (entry.firstPendingAt ?? this.clock.now()) >= 2000) void this.flush(id)
      // Otherwise the latest edit's existing debounce timer remains armed.
    })
    return entry.writing
  }
  protectServerForManual(id: string) {
    this.entry(id).serverProtected = true
    this.publish(id)
  }
  releaseServerProtection(id: string) {
    this.entry(id).serverProtected = false
    this.applyServer(id)
    this.publish(id)
  }
  async readyForSync(id: string) {
    const entry = this.entry(id)
    if (entry.phase === 'failed' || entry.phase === 'conflict') throw new Error(entry.phase === 'conflict' ? '다른 탭과 로컬 원고 충돌: 현재 입력을 보관하고 다른 탭의 변경을 확인해주세요.' : '이 원고의 로컬 저장·복구 문제를 먼저 확인해주세요.')
    if (!entry.ready) await this.recover(id)
    if (!entry.ready || !entry.draft || ['failed', 'conflict'].includes(entry.phase)) throw new Error('로컬 원고를 복구하지 못했습니다.')
  }
  async flushLatest(id: string) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const entry = this.entry(id)
      if (!entry.ready || !entry.draft || entry.phase === 'failed' || entry.phase === 'conflict' || entry.acknowledging) {
        throw new Error('최신 로컬 저장을 확인하지 못했습니다. 원고를 보존하고 전송 절차를 중단했습니다.')
      }
      if (entry.writing) { await entry.writing; continue }
      if (entry.revision === entry.savedRevision) return
      await this.flush(id)
    }
    throw new Error('입력이 계속 변경되어 최신 로컬 저장을 확정하지 못했습니다. 다시 눌러주세요.')
  }
  savedHead(id: string) {
    const entry = this.entry(id)
    if (!entry.token || entry.writing || entry.acknowledging || entry.revision !== entry.savedRevision
      || entry.phase !== 'saved') throw new LocalDraftConflict()
    return { token: entry.token, revision: entry.savedRevision }
  }
  async acceptServerAck(id: string, response: Note,
    commit: (token: string, revision: number, writerId: string) => Promise<LocalNoteDraft>) {
    const entry = this.entry(id)
    if (!entry.ready || !entry.draft || entry.acknowledging || entry.phase === 'conflict' || entry.phase === 'failed') throw new LocalDraftConflict()
    entry.acknowledging = true
    let acknowledged = false
    this.stopTimer(entry)
    try {
      if (entry.writing) await entry.writing
      if (!entry.token || ['conflict', 'failed'].includes(entry.phase)) throw new LocalDraftConflict()
      const record = await commit(entry.token, entry.savedRevision, this.writerId)
      const memory = entry.draft!, stored = fromRecord(record)
      const merged = { ...stored, title: memory.title, content: memory.content,
        latestServerVersion: Math.max(stored.latestServerVersion, memory.latestServerVersion) }
      entry.checkpoint = stored
      entry.draft = merged; entry.token = record.storageToken; entry.savedRevision = record.localRevision
      entry.revision = Math.max(entry.revision, record.localRevision) + (sameDraft(merged, stored) ? 0 : 1)
      entry.savedAt = record.localSavedAt; entry.error = null
      entry.phase = entry.revision === entry.savedRevision ? 'saved' : 'waiting'
      if (!entry.server || response.version >= entry.server.version) entry.server = response
      this.channel?.postMessage({ noteId: id, writerId: this.writerId })
      this.publish(id)
      entry.serverProtected = false
      acknowledged = true
    } catch (error) { this.fail(id, error); throw error }
    finally {
      entry.acknowledging = false
      if (entry.headCheckRequested) { entry.headCheckRequested = false; void this.checkHead(id) }
      if (acknowledged) { this.applyServer(id); this.publish(id) }
      if (entry.revision > entry.savedRevision) this.schedule(id)
    }
  }
  async applyConflictChoice(id: string, revision: number,
    commit: (writerId: string, isCurrent:()=>boolean) => Promise<LocalNoteDraft | null>) {
    const entry=this.entry(id)
    if(!entry.ready||!entry.draft||entry.acknowledging)throw new LocalDraftConflict()
    if(entry.writing)await entry.writing
    if(entry.revision!==revision)throw new LocalDraftConflict()
    entry.acknowledging=true;this.stopTimer(entry)
    try {
      const record=await commit(this.writerId,()=>entry.revision===revision)
      if(!record){this.fail(id,new LocalNoteDeleted());return}
      const stored=fromRecord(record),memory=entry.draft!
      entry.draft=entry.revision===revision?stored:{...stored,title:memory.title,content:memory.content}
      entry.checkpoint=stored;entry.token=record.storageToken;entry.savedRevision=record.localRevision
      entry.revision=record.localRevision+(sameDraft(entry.draft,stored)?0:1)
      entry.savedAt=record.localSavedAt;entry.serverProtected=false;entry.error=null
      entry.phase=entry.revision===entry.savedRevision?'saved':'waiting'
      this.channel?.postMessage({noteId:id,writerId:this.writerId});this.publish(id)
    } finally {
      entry.acknowledging=false
      if(entry.headCheckRequested){entry.headCheckRequested=false;void this.checkHead(id)}
      if(entry.phase==='waiting')this.schedule(id)
    }
  }
  async retry(id: string) {
    const entry = this.entry(id)
    if (entry.reading || entry.writing) return
    if (!entry.ready) return this.recover(id)
    if (entry.phase === 'conflict' || entry.revision <= entry.savedRevision) {
      await this.checkHead(id, true)
      if (entry.phase === 'conflict' || entry.phase === 'failed') return
      await this.flush(id)
      return
    }
    entry.phase = 'waiting'; entry.error = null
    this.publish(id)
    await this.flush(id)
  }
  private async restoreMissing(id:string):Promise<boolean> {
    const entry=this.entry(id)
    if(entry.deleted||entry.acknowledging||!entry.draft||!entry.checkpoint||!entry.token||!this.repository.restoreMissing)return false
    const memory=entry.draft,memoryRevision=entry.revision,revision=Math.max(memoryRevision,entry.savedRevision+1)
    entry.acknowledging=true;this.stopTimer(entry);entry.phase='saving';this.publish(id)
    try{
      const record=await this.repository.restoreMissing(memory,revision,{draft:entry.checkpoint,revision:entry.savedRevision,storageToken:entry.token},this.writerId)
      if(entry.deleted)return true
      const changed=entry.revision!==memoryRevision
      entry.checkpoint=fromRecord(record);entry.token=record.storageToken;entry.savedRevision=record.localRevision
      entry.revision=record.localRevision+(changed?1:0);entry.savedAt=record.localSavedAt;entry.casRecoveryUsed=false;entry.error=null
      entry.phase=changed?'waiting':'saved';this.publish(id)
      this.channel?.postMessage({noteId:id,writerId:this.writerId})
      return true
    }finally{
      entry.acknowledging=false
      if(entry.phase==='waiting')this.schedule(id)
    }
  }
  /** Compare current text with our last committed checkpoint, never with a stale server GET. */
  private reconcile(id: string, record: LocalNoteDraft | undefined) {
    const entry = this.entry(id), memory = entry.draft, checkpoint = entry.checkpoint
    if (!record || !memory || record.baseVersion < memory.baseVersion) return false
    const stored = fromRecord(record)
    const identical = sameText(memory, stored)
    const unedited = !!checkpoint && sameText(memory, checkpoint)
    const metadataOnly = !!checkpoint && sameText(stored, checkpoint) && record.canRebaseLocalEdits === true
    if (!identical && !unedited && !metadataOnly) return false
    this.stopTimer(entry)
    const next = identical || unedited ? stored : { ...stored, title: memory.title, content: memory.content }
    next.latestServerVersion = Math.max(next.latestServerVersion, memory.latestServerVersion)
    entry.checkpoint = stored; entry.token = record.storageToken
    entry.savedRevision = record.localRevision; entry.savedAt = record.localSavedAt
    entry.draft = next
    // Local revisions are fencing counters; never mark a larger memory revision as committed.
    entry.revision = Math.max(entry.revision, record.localRevision) + (sameDraft(next, stored) ? 0 : 1)
    if (sameDraft(next, stored)) entry.revision = record.localRevision
    entry.serverProtected = !!record.serverOperationPending
    entry.phase = entry.revision === entry.savedRevision ? 'saved' : 'waiting'; entry.error = null
    if (entry.phase === 'waiting') this.schedule(id)
    this.publish(id)
    return true
  }
  private async checkHead(id: string, retry = false) {
    const entry = this.entries.get(id)
    if (!entry?.ready) return
    if (entry.acknowledging || entry.writing) { entry.headCheckRequested = true; return }
    const token = entry.token
    try {
      const initial = !entry.checkpoint && !token && entry.savedRevision === 0
      const record = await this.repository.read(id, { initial })
      if (entry.acknowledging || entry.writing || token !== entry.token) { entry.headCheckRequested = true; return }
      if (record?.serverOperationPending && !entry.serverProtected) {
        entry.serverProtected = true; this.publish(id)
      }
      // No committed checkpoint has existed in this session. A slow first GET,
      // or input awaiting its first CAS write, is not a deleted local record.
      // The repository verifies the absence of orphan queues on read and write.
      if (!record && initial && entry.phase !== 'conflict') return
      if (record?.storageToken !== token || entry.phase === 'conflict' || retry) {
        if (!(record ? this.reconcile(id, record) : await this.restoreMissing(id))) this.fail(id, new LocalDraftConflict())
      }
    } catch (error) { this.fail(id, error) }
  }
  connect() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(DRAFT_CHANNEL)
        this.channel.onmessage = event => {
          if(event.data?.deleted){for(const id of this.entries.keys())void this.checkHead(id);window.dispatchEvent(new Event('seam-note:workspace-deleted'))}
          if (event.data && typeof event.data.noteId === 'string' && event.data.writerId !== this.writerId) void this.checkHead(event.data.noteId)
        }
      } catch { console.warn('[Seam Note] local draft notifications unavailable; transaction checks remain active') }
    }
    const deleted = () => { for (const id of this.entries.keys()) void this.checkHead(id) }
    window.addEventListener('seam-note:workspace-deleted', deleted)
    const visible = () => {
      if (document.visibilityState !== 'hidden') for (const id of this.entries.keys()) void this.checkHead(id)
      for (const id of this.entries.keys()) void this.flush(id)
    }
    window.addEventListener('visibilitychange', visible)
    window.addEventListener('pagehide', visible)
    return () => {
      window.removeEventListener('seam-note:workspace-deleted', deleted)
      window.removeEventListener('visibilitychange', visible); window.removeEventListener('pagehide', visible)
      this.channel?.close(); this.channel = null
      for (const [id, entry] of this.entries) { this.stopTimer(entry); void this.flush(id) }
    }
  }
}
