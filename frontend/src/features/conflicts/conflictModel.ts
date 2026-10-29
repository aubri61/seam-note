import type { Note } from '@/lib/api/types'
import type { NoteDraft } from '@/features/notes/noteDrafts'
import type { LocalNoteDraft } from '@/features/local-drafts/localDraftTypes'
import type { CreationOperation } from '@/features/outbox/creationModel'
import type { NoteUpdateOperation } from '@/features/outbox/outboxModel'

export type ConflictKind = 'LOCAL_DRAFT_CONFLICT' | 'SERVER_VERSION_CONFLICT' | 'SERVER_NOTE_DELETED'
export interface ConflictHead { record?: LocalNoteDraft; operations: NoteUpdateOperation[]; creations: CreationOperation[] }
export interface RecoveryCopy {
  id: string; createdAt: number; kind: ConflictKind; choice: 'mine' | 'other' | 'recover'
  mine: NoteDraft; stored: NoteDraft; other: NoteDraft | null
  operations: NoteUpdateOperation[]; creations: CreationOperation[]
}
export interface ConflictPreview {
  noteId: string; kind: ConflictKind; memoryRevision: number; mine: NoteDraft; head: ConflictHead
  server?: Note; serverMissing?: true; blocked?: string
}
export class NoConflict extends Error { constructor(){super('현재 확인된 원고 내용 충돌이 없습니다.');this.name='NoConflict'} }
export class ChangedConflict extends Error {
  constructor() { super('비교 후 원고·작업 또는 버전이 바뀌었습니다. 최신 내용을 다시 비교해주세요.'); this.name = 'ChangedConflict' }
}
export function snapshot(d: NoteDraft): NoteDraft {
  return {noteId:d.noteId,title:d.title,content:d.content,baseVersion:d.baseVersion,baseTitle:d.baseTitle,baseContent:d.baseContent,latestServerVersion:d.latestServerVersion}
}
export function serverDraft(n: Note): NoteDraft {
  if (!n || typeof n.id!=='string' || typeof n.title!=='string' || n.title.length>200 || typeof n.content!=='string' || !Number.isSafeInteger(n.version) || n.version<0) throw new Error('서버 원고 응답 형식을 확인하지 못했습니다.')
  return {noteId:n.id,title:n.title,content:n.content,baseVersion:n.version,baseTitle:n.title,baseContent:n.content,latestServerVersion:n.version}
}
export function classifyConflict(head: ConflictHead, local: boolean): ConflictKind | undefined {
  if(local)return 'LOCAL_DRAFT_CONFLICT'
  const failures=head.operations.filter(o=>o.status==='conflict')
  if(failures.some(o=>o.failureCode==='NOTE_NOT_FOUND'))return 'SERVER_NOTE_DELETED'
  if(failures.some(o=>o.failureCode==='VERSION_CONFLICT'))return 'SERVER_VERSION_CONFLICT'
}
export function headStamp(head: ConflictHead) {
  return JSON.stringify({token:head.record?.storageToken,revision:head.record?.localRevision,
    operations:[...head.operations].sort((a,b)=>a.operationId.localeCompare(b.operationId)),
    creations:[...head.creations].sort((a,b)=>a.operationId.localeCompare(b.operationId))})
}
export function blockedChoice(kind: ConflictKind, head: ConflictHead) {
  if(!head.record)return '최신 로컬 원고 기록이 없어 안전하게 교체할 수 없습니다. 현재 입력을 먼저 파일로 보관해주세요.'
  if(head.record.recoveredAs)return '이 원고는 이미 새 UUID로 복구됐습니다.'
  if(head.creations.some(o=>o.status!=='pending'||o.attemptedAt!==null))return '생성 요청의 결과가 미확정입니다. 기존 키로 생성 결과를 확인한 뒤 다시 비교해주세요.'
  if(head.operations.some(o=>o.status==='inFlight'))return '전송 결과가 미확정인 작업이 있습니다. 기존 작업을 수동 재시도해 결과를 확인한 뒤 다시 비교해주세요.'
  const conflicts=head.operations.filter(o=>o.status==='conflict')
  if(kind==='LOCAL_DRAFT_CONFLICT'&&conflicts.length)return '서버 충돌 작업도 남아 있습니다. 현재 입력을 보관하고 서버 충돌을 먼저 확인해주세요.'
  const required=kind==='SERVER_NOTE_DELETED'?'NOTE_NOT_FOUND':'VERSION_CONFLICT'
  if(kind!=='LOCAL_DRAFT_CONFLICT'&&(kind!=='SERVER_NOTE_DELETED'&&!conflicts.length||conflicts.some(o=>kind==='SERVER_NOTE_DELETED'?!['NOTE_NOT_FOUND','VERSION_CONFLICT'].includes(o.failureCode??''):o.failureCode!==required)))return '확인되지 않은 종류의 충돌입니다. 기존 작업을 교체하지 않습니다.'
  if(kind!=='LOCAL_DRAFT_CONFLICT'&&head.creations.length)return '생성 작업이 남아 있어 서버 수정 충돌로 교체할 수 없습니다.'
}
