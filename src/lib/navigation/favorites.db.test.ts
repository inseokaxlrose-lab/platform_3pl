import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/session'
import { createTestCenter, createTestUser } from '@/test/factories'
import { resetDatabase } from '@/test/reset-database'
import { setFavoriteMenuAction } from './favorite-actions'
import { loadFavoriteMenus, MAX_FAVORITE_MENUS } from './favorites'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  // 메뉴 권한이 하나도 없어도 즐겨찾기는 다룰 수 있어야 한다
  getCurrentPermissions: vi.fn(async () => new Set()),
  getCurrentScope: vi.fn(async () => ({ kind: 'ALL' })),
}))

let aliceId = ''
let bobId = ''

function signInAs(id: string) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id,
    name: '사용자',
    username: id,
    userType: 'CENTER',
  })
}

beforeEach(async () => {
  await resetDatabase()
  const center = await createTestCenter('ICN')
  aliceId = (await createTestUser('alice', { centerIds: [center.id] })).id
  bobId = (await createTestUser('bob', { centerIds: [center.id] })).id
  signInAs(aliceId)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('사이드바 즐겨찾기', () => {
  it('추가한 순서대로 읽히고, 같은 메뉴를 다시 추가해도 순서가 바뀌지 않는다', async () => {
    await setFavoriteMenuAction({ href: '/admin/master/items', favorite: true })
    await setFavoriteMenuAction({ href: '/admin/stock/history', favorite: true })
    expect(await setFavoriteMenuAction({ href: '/admin/master/items', favorite: true })).toEqual({
      ok: true,
      data: { href: '/admin/master/items', favorite: true },
    })

    expect(await loadFavoriteMenus(aliceId)).toEqual([
      '/admin/master/items',
      '/admin/stock/history',
    ])
  })

  it('끄면 빠지고, 다른 사용자의 즐겨찾기에는 영향이 없다', async () => {
    await setFavoriteMenuAction({ href: '/admin/master/items', favorite: true })
    signInAs(bobId)
    await setFavoriteMenuAction({ href: '/admin/master/items', favorite: true })
    signInAs(aliceId)

    await setFavoriteMenuAction({ href: '/admin/master/items', favorite: false })

    expect(await loadFavoriteMenus(aliceId)).toEqual([])
    expect(await loadFavoriteMenus(bobId)).toEqual(['/admin/master/items'])
  })

  it('메뉴 목록에 없는 주소는 거부한다', async () => {
    expect(
      await setFavoriteMenuAction({ href: 'https://evil.example', favorite: true }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(await prisma.userFavoriteMenu.count()).toBe(0)
  })

  it(`최대 ${MAX_FAVORITE_MENUS}개까지만 추가할 수 있다`, async () => {
    await prisma.userFavoriteMenu.createMany({
      data: Array.from({ length: MAX_FAVORITE_MENUS }, (_, i) => ({
        userId: aliceId,
        href: `/old/${i}`,
      })),
    })
    expect(
      await setFavoriteMenuAction({ href: '/admin/master/items', favorite: true }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('로그인하지 않았으면 거부한다', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)
    expect(
      await setFavoriteMenuAction({ href: '/admin/master/items', favorite: true }),
    ).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
  })
})
