import type { Blockquote, Nodes, Parent, PhrasingContent, Root, Text } from 'mdast'

// 도움말 Markdown 꾸미기 (docs/decisions/0077) — react-markdown의 remark 플러그인
//   remarkHelpCallout: '> [!TIP]' 같은 GitHub 경고 문법 → <aside data-callout="tip">
//   remarkHelpButtons: 본문의 '[저장]' → <kbd>저장</kbd> (화면에서 버튼 모양 칩으로 그린다)
// remark(Markdown 나무) 단계에서 바꾸고, 그리기는 help-content.tsx가 맡는다

export const CALLOUT_KINDS = ['tip', 'note', 'warning'] as const
export type CalloutKind = (typeof CALLOUT_KINDS)[number]

// 나무를 돌며 조건에 맞는 노드마다 fn (부모가 링크·코드면 그 아래는 건너뛴다)
function walk(
  node: Nodes,
  fn: (node: Nodes, parent: Parent | null) => void,
  parent: Parent | null = null,
) {
  fn(node, parent)
  if (node.type === 'link' || node.type === 'linkReference') return
  if ('children' in node) for (const child of [...node.children]) walk(child as Nodes, fn, node)
}

const CALLOUT_MARK = /^\[!(TIP|NOTE|WARNING)\][ \t]*\r?\n?/

// '> [!TIP]' 첫 줄 표시를 떼고, 인용 상자를 <aside data-callout="tip">로 바꾼다
export function remarkHelpCallout() {
  return (tree: Root) => {
    walk(tree, (node) => {
      if (node.type !== 'blockquote') return
      const quote = node as Blockquote
      const first = quote.children[0]
      if (first?.type !== 'paragraph') return
      const lead = first.children[0]
      if (lead?.type !== 'text') return
      const mark = lead.value.match(CALLOUT_MARK)
      if (!mark) return
      lead.value = lead.value.slice(mark[0].length)
      // 표시만 있던 줄이면 빈 글자·줄바꿈을 지운다
      if (lead.value === '') first.children.shift()
      if (first.children[0]?.type === 'break') first.children.shift()
      if (first.children.length === 0) quote.children.shift()
      quote.data = {
        ...quote.data,
        hName: 'aside',
        hProperties: { dataCallout: mark[1].toLowerCase() },
      }
    })
  }
}

// 버튼 이름: 대괄호 안 1~30자 (줄바꿈·대괄호 없이). '[!TIP]'은 경고 상자가 먼저 가져간다
const BUTTON = /\[([^[\]\n]{1,30})\]/g
// 있는지만 볼 때 (g 표시가 있으면 test가 위치를 기억해 번갈아 틀리므로 따로)
const HAS_BUTTON = /\[[^[\]\n]{1,30}\]/

// 글 속 '[저장]' → kbd 칩. 링크·코드 안은 그대로 둔다
export function remarkHelpButtons() {
  return (tree: Root) => {
    walk(tree, (node) => {
      if (!('children' in node) || node.type === 'link' || node.type === 'linkReference') return
      const parent = node as Parent
      const next: Nodes[] = []
      let changed = false
      for (const child of parent.children as Nodes[]) {
        if (child.type !== 'text' || !HAS_BUTTON.test(child.value)) {
          next.push(child)
          continue
        }
        changed = true
        next.push(...splitButtons(child))
      }
      if (changed) parent.children = next as typeof parent.children
    })
  }
}

function splitButtons(text: Text): PhrasingContent[] {
  const out: PhrasingContent[] = []
  let last = 0
  for (const match of text.value.matchAll(BUTTON)) {
    const at = match.index
    if (at > last) out.push({ type: 'text', value: text.value.slice(last, at) })
    // emphasis 노드에 hName을 주면 HTML로 바꿀 때 <kbd>가 된다
    out.push({
      type: 'emphasis',
      data: { hName: 'kbd' },
      children: [{ type: 'text', value: match[1].trim() }],
    })
    last = at + match[0].length
  }
  if (last < text.value.length) out.push({ type: 'text', value: text.value.slice(last) })
  return out
}

// 단락 제목 글자 (목차용): '## [사용자 등록] 버튼' → '사용자 등록 버튼'
export function plainTitle(heading: string) {
  return heading
    .replace(/^#+\s*/, '')
    .replace(/[[\]`*_]/g, '')
    .trim()
}
