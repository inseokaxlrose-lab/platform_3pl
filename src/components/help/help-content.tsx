import { ChevronRightIcon, CircleAlertIcon, InfoIcon, LightbulbIcon } from 'lucide-react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { HelpDocument } from '@/lib/help/parse-help'
import {
  plainTitle,
  remarkHelpButtons,
  remarkHelpCallout,
  type CalloutKind,
} from '@/lib/help/remark-help'
import { cn } from '@/lib/utils'

// Markdown 요소별 모양: 바깥 상자에 "자손 선택자"([&_h2]:…)로 준다 (디자인 토큰만 사용)
// HTML 태그를 직접 쓴 부분은 그리지 않는다 (react-markdown 기본: 안전)
const PROSE = cn(
  'text-sm leading-relaxed text-foreground/85',
  '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground',
  '[&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-foreground',
  '[&_p]:my-2',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5',
  '[&_strong]:font-semibold [&_strong]:text-foreground',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3',
  '[&_table]:my-3 [&_table]:w-full [&_table]:border [&_table]:text-xs',
  '[&_th]:border-b [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-foreground',
  '[&_td]:border-b [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
)

// 경고 상자 종류별 모양 (> [!TIP] / [!NOTE] / [!WARNING])
const CALLOUT: Record<CalloutKind, { label: string; icon: React.ReactNode; className: string }> = {
  tip: {
    label: '팁',
    icon: <LightbulbIcon />,
    className: 'border-success bg-success/5 [&>p:first-child_svg]:text-success',
  },
  note: {
    label: '참고',
    icon: <InfoIcon />,
    className: 'border-info bg-info/5 [&>p:first-child_svg]:text-info',
  },
  warning: {
    label: '주의',
    icon: <CircleAlertIcon />,
    className: 'border-warning bg-warning/5 [&>p:first-child_svg]:text-warning',
  },
}

const COMPONENTS: Components = {
  // 경고 상자: 왼쪽 색 띠 + 아이콘·이름 (remarkHelpCallout가 aside로 바꿔 둔다)
  aside({ children, ...props }) {
    const kind = (props as { 'data-callout'?: CalloutKind })['data-callout']
    const style = kind ? CALLOUT[kind] : null
    if (!style) return <aside>{children}</aside>
    return (
      <aside
        role="note"
        aria-label={style.label}
        className={cn('my-3 rounded-r-md border-l-2 px-3 py-2 [&>p]:my-1', style.className)}
      >
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground [&_svg]:size-3.5">
          {style.icon}
          {style.label}
        </p>
        {children}
      </aside>
    )
  },
  // 버튼 이름 '[저장]' → 버튼 모양 칩 (remarkHelpButtons가 kbd로 바꿔 둔다)
  kbd({ children }) {
    return (
      <kbd className="mx-0.5 inline-flex items-center rounded-md border bg-background px-1.5 py-px font-sans text-xs font-medium text-foreground shadow-xs">
        {children}
      </kbd>
    )
  },
  // 번호 목록 = 단계: 동그라미 번호 (CSS 카운터)
  ol({ children }) {
    return (
      <ol
        className={cn(
          'my-2 space-y-1.5 [counter-reset:step]',
          '[&>li]:relative [&>li]:pl-7 [&>li]:[counter-increment:step]',
          '[&>li]:before:absolute [&>li]:before:top-0.5 [&>li]:before:left-0 [&>li]:before:flex [&>li]:before:size-5',
          '[&>li]:before:items-center [&>li]:before:justify-center [&>li]:before:rounded-full [&>li]:before:bg-primary',
          '[&>li]:before:text-[0.6875rem] [&>li]:before:font-semibold [&>li]:before:text-primary-foreground',
          '[&>li]:before:content-[counter(step)]',
        )}
      >
        {children}
      </ol>
    )
  },
}

const PLUGINS = [remarkGfm, remarkHelpCallout, remarkHelpButtons]

function Md({ children }: { children: string }) {
  return (
    <Markdown remarkPlugins={PLUGINS} components={COMPONENTS}>
      {children}
    </Markdown>
  )
}

const sectionId = (index: number) => `help-section-${index}`

// 단락 '## 제목\n본문' → 제목 줄과 본문
function splitSection(markdown: string) {
  const at = markdown.indexOf('\n')
  return at < 0
    ? { heading: markdown, body: '' }
    : { heading: markdown.slice(0, at), body: markdown.slice(at + 1) }
}

// 도움말 본문: 소개 + (단락이 3개 이상이면 목차) + 권한에 맞게 걸러진 단락들(접고 펼 수 있음)
export function HelpContent({ document }: { document: HelpDocument }) {
  const sections = document.sections.map((section) => splitSection(section.markdown))
  return (
    <div className={PROSE}>
      {document.intro.trim() && <Md>{document.intro}</Md>}
      {sections.length >= 3 && (
        <nav aria-label="도움말 목차" className="my-3 flex flex-wrap gap-1.5">
          {sections.map((section, index) => (
            <button
              key={index}
              type="button"
              className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                const target = window.document.getElementById(sectionId(index))
                if (target instanceof HTMLDetailsElement) target.open = true
                target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              {plainTitle(section.heading)}
            </button>
          ))}
        </nav>
      )}
      {sections.map((section, index) => (
        <details
          key={index}
          id={sectionId(index)}
          open
          className="group/section border-t py-3 first-of-type:border-t-0 [&_summary_h2]:my-0"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            {/* 접힘 표시: 펼치면 아래, 접으면 오른쪽 */}
            <ChevronRightIcon
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground transition-transform group-open/section:rotate-90"
            />
            <Md>{section.heading}</Md>
          </summary>
          <Md>{section.body}</Md>
        </details>
      ))}
    </div>
  )
}
