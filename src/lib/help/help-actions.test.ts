import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PermissionCode } from '@/config/permissions'
import { getCurrentPermissions, getCurrentUser } from '@/lib/session'
import { loadHelpAction } from './help-actions'
import { parseHelpDocument } from './parse-help'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(async () => ({ kind: 'ALL' })),
}))

// 실제 파일 대신 정해진 문서를 돌려준다 (메뉴 찾기는 실제 메뉴 목록 사용)
vi.mock('./load-help', async (importOriginal) => {
  const original = await importOriginal<typeof import('./load-help')>()
  return {
    ...original,
    readHelpDocument: (href: string) =>
      href === '/admin/system/users'
        ? parseHelpDocument(
            [
              '---',
              'title: 사용자',
              '---',
              '## 화면 구성',
              '목록',
              '<!-- 권한: system.users.create -->',
              '## 등록',
              '등록 방법',
            ].join('\n'),
          )
        : null,
  }
})

function signedIn(codes: PermissionCode[]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 'u1',
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
}

const sectionTitles = (result: Awaited<ReturnType<typeof loadHelpAction>>) =>
  result.ok ? result.data.sections.map((s) => s.markdown.split('\n')[0]) : null

beforeEach(() => signedIn(['system.users.read']))

describe('도움말 불러오기', () => {
  it('메뉴 조회 권한이 있으면 권한에 맞는 단락만 돌려준다', async () => {
    expect(sectionTitles(await loadHelpAction({ menuHref: '/admin/system/users' }))).toEqual([
      '## 화면 구성',
    ])

    signedIn(['system.users.read', 'system.users.create'])
    expect(sectionTitles(await loadHelpAction({ menuHref: '/admin/system/users' }))).toEqual([
      '## 화면 구성',
      '## 등록',
    ])
  })

  it('메뉴 조회 권한이 없으면 거부한다', async () => {
    signedIn(['master.items.read'])
    expect(await loadHelpAction({ menuHref: '/admin/system/users' })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })

  it('메뉴 목록에 없는 주소·도움말 파일이 없는 메뉴는 NOT_FOUND', async () => {
    expect(await loadHelpAction({ menuHref: '/../../etc/passwd' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    signedIn(['system.roles.read'])
    expect(await loadHelpAction({ menuHref: '/admin/system/roles' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
  })
})
