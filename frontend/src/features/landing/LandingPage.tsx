import styled from '@emotion/styled'
import { actionStyle } from '@/styles/controls'

const Page = styled.div(({ theme }) => ({
  maxWidth: 1184,
  margin: '0 auto',
  paddingInline: theme.spacing.xl,
  '& header': {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: theme.spacing.md, paddingBlock: theme.spacing.md, borderBottom: `1px solid ${theme.colors.border}`,
  },
  '& .landing-brand': {
    display: 'inline-flex', alignItems: 'center', gap: theme.spacing.sm,
    fontSize: 20, fontWeight: 650, letterSpacing: '-.7px', textDecoration: 'none',
  },
  '& .landing-brand img': { width: 32, height: 32 },
  '& .landing-quiet': { ...actionStyle(theme, 'ghost') },
  '& .landing-primary': {
    ...actionStyle(theme, 'primary'), display: 'inline-flex', alignItems: 'center', gap: theme.spacing.md,
    paddingInline: theme.spacing.lg,
  },
  '& .landing-hero': { paddingBlock: `clamp(${theme.spacing.xxl}, 8vw, 96px) ${theme.spacing.xxxl}` },
  '& h1': {
    fontSize: 'clamp(32px, 5vw, 48px)', lineHeight: 1.15, fontWeight: 650, letterSpacing: '-.055em',
  },
  '& .landing-tagline': {
    marginTop: theme.spacing.md, fontSize: 'clamp(22px, 4vw, 32px)', lineHeight: 1.35,
    fontWeight: 600, letterSpacing: '-.04em', wordBreak: 'keep-all',
  },
  '& .landing-intro': { marginTop: theme.spacing.lg, color: theme.colors.mutedText, lineHeight: 1.8, wordBreak: 'keep-all' },
  '& .landing-actions': { marginTop: theme.spacing.xl },
  '& .landing-notes': {
    display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    columnGap: theme.spacing.lg, marginTop: theme.spacing.xxl,
  },
  '& .landing-notes article': {
    paddingBlock: theme.spacing.xl, borderTop: `1px solid ${theme.colors.border}`,
  },
  '& .landing-notes h2': {
    fontSize: 20, lineHeight: 1.4, marginBlock: `${theme.spacing.sm} ${theme.spacing.sm}`, wordBreak: 'keep-all',
  },
  '& .landing-notes p': { color: theme.colors.mutedText, lineHeight: 1.7, wordBreak: 'keep-all' },
  '& .landing-index': { color: theme.colors.mutedText, fontSize: 12, fontVariantNumeric: 'tabular-nums' },
  '& .landing-final-action': {
    display: 'flex', justifyContent: 'center', paddingBlock: theme.spacing.xxl,
    borderTop: `1px solid ${theme.colors.border}`,
  },
  '& .landing-final-action button': {
    justifyContent: 'center', width: 'min(100%, 320px)', minHeight: 56, fontSize: 16,
  },
  '& footer': {
    borderTop: `1px solid ${theme.colors.border}`, paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl, color: theme.colors.mutedText, fontSize: 13,
  },
  [`@media (max-width: ${theme.breakpoints.mobile})`]: {
    paddingInline: theme.spacing.lg,
    '& .landing-hero': { paddingBottom: theme.spacing.xxl },
    '& .landing-notes': { gridTemplateColumns: '1fr' },
    '& .landing-notes article': { paddingBlock: theme.spacing.lg },
  },
}))

const Preview = styled.figure(({ theme }) => ({
  margin: 0,
  padding: 'clamp(8px, 3.4vw, 40px)', borderRadius: theme.radii.lg, background: theme.colors.selected,
  '& .preview-window': {
    border: `1px solid ${theme.colors.border}`, boxShadow: theme.shadow,
  },
  '& .preview-bar': {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm,
    padding: `${theme.spacing.control} ${theme.spacing.md}`, borderBottom: `1px solid ${theme.colors.border}`,
    fontSize: 12, color: theme.colors.mutedText,
  },
  '& .preview-brand': { display: 'inline-flex', gap: theme.spacing.sm, alignItems: 'center', fontWeight: 600, color: theme.colors.text },
  '& .preview-brand img': { width: 22, height: 22 },
  '& .preview-status': { color: theme.colors.success },
  '& .preview-body': { display: 'grid', gridTemplateColumns: 'minmax(145px, 22%) 1fr' },
  '& .preview-sidebar': {
    background: theme.colors.sidebar, borderRight: `1px solid ${theme.colors.border}`,
    padding: theme.spacing.md, color: theme.colors.mutedText, fontSize: 13, lineHeight: 1.5,
  },
  '& .preview-sidebar span': { display: 'block', padding: theme.spacing.sm },
  '& .preview-sidebar strong': { display: 'block', marginBottom: theme.spacing.sm, color: theme.colors.text },
  '& .preview-selected': { background: theme.colors.selected, borderRadius: theme.radii.sm, color: theme.colors.text },
  '& .preview-paper': { minHeight: 300, padding: 'clamp(24px, 5vw, 64px)', minWidth: 0 },
  '& .preview-paper small': { color: theme.colors.mutedText, letterSpacing: '.1em' },
  '& .preview-paper h2': { fontSize: 'clamp(20px, 3vw, 32px)', fontWeight: 600, marginBlock: `${theme.spacing.sm} ${theme.spacing.lg}`, letterSpacing: '-.035em' },
  '& .preview-paper p': { maxWidth: '45ch', color: theme.colors.mutedText, fontSize: 15, lineHeight: 1.9 },
  [`@media (max-width: ${theme.breakpoints.mobile})`]: {
    '& .preview-body': { gridTemplateColumns: '1fr' },
    '& .preview-sidebar': { display: 'none' },
    '& .preview-paper': { minHeight: 0 },
  },
}))

const features = [
  {
    title: '인터넷이 없어도, 자유롭게.',
    description: '사용할 기기에서 미리 로그인해 노트를 열어 두면 인터넷 연결 없이도 글을 쓰고 수정할 수 있어요.',
  },
  {
    title: '저장은 신경 쓰지 말고, 글에 집중하세요.',
    description: '작성 중인 내용은 자동으로 저장돼요. 수정 사항이 충돌하면 이를 감지해 원고가 무심코 덮어써지지 않도록 보호해요.',
  },
  {
    title: '언제 어디서든, 이어지는 생각.',
    description: '노트북에서 쓰던 글을 휴대폰에서도. 기기가 달라져도 작업은 자연스럽게 이어져요.',
  },
]

export function LandingPage({ signedIn, onStart }: { signedIn: boolean; onStart: (button: HTMLButtonElement) => void }) {
  return <Page>
    <header>
      <a className="landing-brand" href="/"><img src="/seam-note-icon.png" alt="" />Seam Note</a>
      <button className="landing-quiet" type="button" aria-haspopup={signedIn ? undefined : "dialog"} onClick={event => onStart(event.currentTarget)}>{signedIn ? '워크스페이스' : '로그인'}</button>
    </header>
    <main>
      <section className="landing-hero" aria-labelledby="landing-title">
        <h1 id="landing-title">Seam Note.</h1>
        <p className="landing-tagline">언제 어디서든 이어지는<br />자동 동기화 노트 에디터</p>
        <p className="landing-intro">인터넷이 끊겨도,<br />다른 기기에서 내용을 고쳐도,<br />내 생각은 끊김 없이 이어져요.</p>
        <div className="landing-actions">
          <button className="landing-primary" type="button" aria-haspopup={signedIn ? undefined : "dialog"} onClick={event => onStart(event.currentTarget)}>
            {signedIn ? '워크스페이스 열기' : '시작하기'} <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
      <Preview>
        <div className="preview-window">
          <div className="preview-bar">
            <span className="preview-brand"><img src="/seam-note-icon.png" alt="" />Seam Note</span>
            <span className="preview-status">✓ 이 기기에 저장됨</span>
          </div>
          <div className="preview-body">
            <div className="preview-sidebar">
              <strong>나의 원고</strong>
              <span className="preview-selected">01. 돌아가는 길</span>
              <span>02. 오래된 편지</span>
              <span>장면 메모</span>
            </div>
            <div className="preview-paper">
              <small>초안 · 01</small>
              <h2>돌아가는 길</h2>
              <p>기차가 마지막 터널을 빠져나오자 창문에 저녁빛이 번졌다. 나는 무릎 위의 노트를 펼쳤다. 오래 비워 둔 페이지에는 지난번에 적어 둔 문장 하나가 남아 있었다.</p>
            </div>
          </div>
        </div>
      </Preview>
      <section className="landing-notes" aria-label="주요 기능">
        {features.map(({ title, description }, index) => <article key={title}>
          <span className="landing-index" aria-hidden="true">0{index + 1}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </article>)}
      </section>
      <div className="landing-final-action">
        <button className="landing-primary" type="button" aria-haspopup={signedIn ? undefined : "dialog"} onClick={event => onStart(event.currentTarget)}>
          지금 바로 시작하기 <span aria-hidden="true">→</span>
        </button>
      </div>
    </main>
    <footer>@SeamNote</footer>
  </Page>
}
