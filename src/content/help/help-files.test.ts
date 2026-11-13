import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { navigation } from '@/config/navigation'
import { isPermissionCode } from '@/config/permissions'
import { findMenu, HELP_DIR, helpFilePath } from '@/lib/help/load-help'
import { parseHelpDocument } from '@/lib/help/parse-help'

// 화면 도움말 검사 (docs/decisions/0023)
// - 완성된 화면(ready)에는 도움말이 꼭 있어야 한다 (홈 제외)
// - 도움말 파일은 메뉴 목록에 있는 주소여야 하고, 제목이 있어야 하며,
//   권한 표시는 실제 권한 코드이면서 그 메뉴의 코드여야 한다

const menuItems = Object.values(navigation).flatMap((area) =>
  area.groups.flatMap((group) => group.items),
)

const helpFiles = readdirSync(HELP_DIR, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => {
    const path = join(entry.parentPath, entry.name)
    const href = `/${relative(HELP_DIR, path).replace(/\\/g, '/').replace(/\.md$/, '')}`
    return { href, document: parseHelpDocument(readFileSync(path, 'utf8')) }
  })

// 'system.users.read' → 'system.users'
const menuOfCode = (code: string) => code.slice(0, code.lastIndexOf('.'))

describe('화면 도움말 파일', () => {
  it('도움말 파일을 찾는다 (검사가 실제로 동작하는지)', () => {
    expect(helpFiles.length).toBeGreaterThan(0)
  })

  it('완성된 화면에는 도움말이 있다 (홈 제외)', () => {
    const missing = menuItems
      .filter((item) => item.ready && !item.exact)
      .filter((item) => !helpFiles.some((file) => file.href === item.href))
      .map((item) => `${item.title} → ${relative(process.cwd(), helpFilePath(item.href))}`)
    expect(missing, '도움말 파일을 만들어 주세요').toEqual([])
  })

  it.each(helpFiles.map((file) => [file.href, file] as const))(
    '%s: 메뉴 목록에 있고, 제목이 있고, 권한 표시가 그 메뉴의 실제 코드다',
    (href, { document }) => {
      const menu = findMenu(href)
      expect(menu, '메뉴 목록(src/config/navigation.ts)에 없는 주소의 도움말').not.toBeNull()
      expect(document.title, '맨 위 title이 필요합니다').not.toBe('')
      expect(document.sections.length, '## 단락이 하나 이상 필요합니다').toBeGreaterThan(0)

      const ownMenu = menu?.permission ? menuOfCode(menu.permission) : null
      for (const { permission } of document.sections) {
        if (!permission) continue
        expect(isPermissionCode(permission), `없는 권한 코드: ${permission}`).toBe(true)
        expect(menuOfCode(permission), `다른 메뉴의 권한: ${permission}`).toBe(ownMenu)
      }
    },
  )
})
