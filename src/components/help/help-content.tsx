import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { HelpDocument } from '@/lib/help/parse-help'
import { cn } from '@/lib/utils'

// Markdown 요소별 모양: 바깥 상자에 "자손 선택자"([&_h2]:…)로 준다 (디자인 토큰만 사용)
// HTML 태그를 직접 쓴 부분은 그리지 않는다 (react-markdown 기본: 안전)
const PROSE = cn(
  'text-sm leading-relaxed text-muted-foreground',
  '[&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground',
  '[&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-foreground',
  '[&_p]:my-2',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5',
  '[&_strong]:font-semibold [&_strong]:text-foreground',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3',
  '[&_table]:my-3 [&_table]:w-full [&_table]:border [&_table]:text-xs',
  '[&_th]:border-b [&_th]:bg-muted/50 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-foreground',
  '[&_td]:border-b [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top',
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
)

// 도움말 본문: 소개 + 권한에 맞게 걸러진 단락들
export function HelpContent({ document }: { document: HelpDocument }) {
  return (
    <div className={cn(PROSE, '[&>section:first-child_h2]:mt-0')}>
      {document.intro && <Markdown remarkPlugins={[remarkGfm]}>{document.intro}</Markdown>}
      {document.sections.map((section, index) => (
        <section key={index}>
          <Markdown remarkPlugins={[remarkGfm]}>{section.markdown}</Markdown>
        </section>
      ))}
    </div>
  )
}
