// 화면 도움말 문서 읽기 (docs/decisions/0023) — 서버·테스트 공용 순수 함수
//
// 문서 모양 (src/content/help/{메뉴 주소}.md):
//   ---
//   title: 사용자
//   summary: 한 줄 소개
//   ---
//   (첫 단락 전 글: 소개)
//   <!-- 권한: system.users.create -->   ← 바로 다음 ## 단락은 이 권한이 있는 사람에게만
//   ## [사용자 등록] 버튼
//   …

export type HelpSection = {
  // 이 단락을 볼 수 있는 권한 (없으면 누구나)
  permission: string | null
  // '## 제목'부터 다음 단락 전까지의 Markdown
  markdown: string
}

export type HelpDocument = {
  title: string
  summary: string | null
  // 첫 '##' 단락 전의 글
  intro: string
  sections: HelpSection[]
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/
const PERMISSION_MARK = /^<!--\s*권한:\s*([^\s]+)\s*-->$/

// 맨 위 '---' 사이의 'key: value' 줄 읽기 (title, summary 두 칸만 쓰므로 직접 읽는다)
function parseFrontmatter(raw: string) {
  const match = raw.match(FRONTMATTER)
  const fields: Record<string, string> = {}
  if (!match) return { fields, body: raw }
  for (const line of match[1].split(/\r?\n/)) {
    const at = line.indexOf(':')
    if (at > 0) fields[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return { fields, body: raw.slice(match[0].length) }
}

export function parseHelpDocument(raw: string): HelpDocument {
  const { fields, body } = parseFrontmatter(raw)
  const intro: string[] = []
  const sections: { permission: string | null; lines: string[] }[] = []
  let pendingPermission: string | null = null

  for (const line of body.split(/\r?\n/)) {
    const mark = line.trim().match(PERMISSION_MARK)
    if (mark) {
      pendingPermission = mark[1]
      continue
    }
    if (line.startsWith('## ')) {
      sections.push({ permission: pendingPermission, lines: [line] })
      pendingPermission = null
      continue
    }
    if (sections.length === 0) intro.push(line)
    else sections[sections.length - 1].lines.push(line)
  }

  return {
    title: fields.title ?? '',
    summary: fields.summary || null,
    intro: intro.join('\n').trim(),
    sections: sections.map(({ permission, lines }) => ({
      permission,
      markdown: lines.join('\n').trim(),
    })),
  }
}

// 권한에 맞는 단락만 남긴다 (권한 표시가 없는 단락은 누구나)
export function filterHelpSections(
  document: HelpDocument,
  codes: ReadonlySet<string>,
): HelpDocument {
  return {
    ...document,
    sections: document.sections.filter((s) => !s.permission || codes.has(s.permission)),
  }
}
