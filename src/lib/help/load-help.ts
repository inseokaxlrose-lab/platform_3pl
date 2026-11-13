import 'server-only'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { navigation, type NavItem } from '@/config/navigation'
import { parseHelpDocument, type HelpDocument } from './parse-help'

// 화면 도움말 파일 위치: 메뉴 주소와 1:1 (docs/decisions/0023)
//   /admin/system/users → src/content/help/admin/system/users.md
// 배포 때 이 폴더가 함께 들어가도록 next.config.ts의 outputFileTracingIncludes에 등록해 두었다
export const HELP_DIR = join(process.cwd(), 'src', 'content', 'help')

const MENU_ITEMS: NavItem[] = Object.values(navigation).flatMap((area) =>
  area.groups.flatMap((group) => group.items),
)

// 메뉴 목록에 있는 주소의 메뉴 (없으면 null → 파일 경로를 만들지 않으므로 다른 파일을 읽을 수 없다)
export function findMenu(href: string): NavItem | null {
  return MENU_ITEMS.find((item) => item.href === href) ?? null
}

export function helpFilePath(menuHref: string) {
  return join(HELP_DIR, `${menuHref.replace(/^\//, '')}.md`)
}

// 도움말 파일이 있는 메뉴 주소 (화면에서 [? 도움말] 버튼을 보여줄지 정할 때)
export function listHelpMenuHrefs(): string[] {
  return MENU_ITEMS.filter((item) => existsSync(helpFilePath(item.href))).map((item) => item.href)
}

// 메뉴의 도움말 (메뉴 목록에 없거나 파일이 없으면 null)
export function readHelpDocument(menuHref: string): HelpDocument | null {
  if (!findMenu(menuHref)) return null
  const path = helpFilePath(menuHref)
  if (!existsSync(path)) return null
  return parseHelpDocument(readFileSync(path, 'utf8'))
}
