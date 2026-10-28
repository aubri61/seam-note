import { isDraftDirty } from '@/features/notes/noteDrafts'
import type { DraftStatus } from '@/features/notes/noteDrafts'
import type { DraftEntry } from './draftSession'

export function localDraftStatus(entry: DraftEntry | undefined, recovering: boolean, loading: boolean, error: Error | null): DraftStatus {
  if (entry?.phase === 'conflict') return '다른 탭과 로컬 충돌'
  if (entry?.phase === 'failed') return '로컬 저장 실패'
  if (recovering) return '로컬 원고 복구 중'
  if (error) return '원고 조회 실패'
  if (loading) return '원고 로딩 중'
  if (entry?.phase === 'saving') return '로컬 저장 중'
  if (entry?.phase === 'waiting') return '편집 중 / 로컬 저장 대기'
  if (entry?.serverProtected) return '서버 결과 확인 필요'
  return entry?.draft && isDraftDirty(entry.draft) ? '로컬 저장됨 · 서버 미동기화' : '변경사항 없음'
}
