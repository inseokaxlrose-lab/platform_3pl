import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// 모든 서버 액션('use server' 파일)이 공통 틀 createAction을 쓰는지 검사한다
// 새 서버 액션을 만들면서 권한 검사를 빠뜨리면 여기서 실패한다 (CLAUDE.md 절대 규칙: 서버에서도 권한 검사)

const SRC = join(process.cwd(), 'src')

// 로그인 전에 쓰는 액션만 예외 (권한 검사가 불가능하거나 불필요)
const ALLOWED_WITHOUT_CREATE_ACTION: Record<string, string[]> = {
  'app/login/actions.ts': ['signInAction'],
  'lib/auth-actions.ts': ['signOutAction'],
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !path.includes(`${join('src', 'generated')}`) && !/\.test\.tsx?$/.test(path))
}

// 파일 맨 위(주석 제외)가 'use server' 지시문인지
function isServerActionFile(source: string) {
  const firstStatement = source
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('//'))
  return firstStatement === "'use server'" || firstStatement === '"use server"'
}

type ExportedAction = { name: string; usesCreateAction: boolean }

function exportedActions(source: string): ExportedAction[] {
  const actions: ExportedAction[] = []
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    actions.push({ name: match[1], usesCreateAction: false })
  }
  for (const match of source.matchAll(/export\s+const\s+(\w+)\s*=\s*([\w.]+)\s*\(/g)) {
    actions.push({ name: match[1], usesCreateAction: match[2] === 'createAction' })
  }
  return actions
}

const serverActionFiles = listSourceFiles(SRC)
  .map((path) => ({ path: relative(SRC, path), source: readFileSync(path, 'utf8') }))
  .filter((file) => isServerActionFile(file.source))

describe('서버 액션 빠뜨림 방지', () => {
  it('서버 액션 파일을 찾는다 (검사가 실제로 동작하는지)', () => {
    expect(serverActionFiles.map((file) => file.path).sort()).toEqual(
      expect.arrayContaining(Object.keys(ALLOWED_WITHOUT_CREATE_ACTION)),
    )
  })

  it('모든 서버 액션은 createAction으로 만든다 (로그인·로그아웃 제외)', () => {
    const violations = serverActionFiles.flatMap((file) =>
      exportedActions(file.source)
        .filter((action) => !action.usesCreateAction)
        .filter((action) => !ALLOWED_WITHOUT_CREATE_ACTION[file.path]?.includes(action.name))
        .map((action) => `${file.path}: ${action.name}`),
    )
    expect(violations).toEqual([])
  })
})

describe('검사 규칙 자체 확인', () => {
  it('createAction이 아닌 export를 찾아낸다', () => {
    const source = `'use server'
export async function deleteAll() {}
export const closeAsn = createAction({ permission: 'inbound.asn.close' })
export const sneaky = async () => {}`
    expect(isServerActionFile(source)).toBe(true)
    expect(exportedActions(source)).toEqual([
      { name: 'deleteAll', usesCreateAction: false },
      { name: 'closeAsn', usesCreateAction: true },
      // 화살표 함수로 만든 액션도 createAction이 아니면 찾아낸다
      { name: 'sneaky', usesCreateAction: false },
    ])
  })
})
