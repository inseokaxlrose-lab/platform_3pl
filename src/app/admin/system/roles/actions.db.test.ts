import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { prisma } from '@/lib/prisma'
import { getCurrentPermissions, getCurrentUser } from '@/lib/session'
import { createTestUser } from '@/test/factories'
import { resetDatabase } from '@/test/reset-database'
import {
  createPermissionGroupAction,
  deletePermissionGroupAction,
  listPermissionGroupsAction,
  updatePermissionGroupAction,
} from './actions'
import { getPermissionGroup } from './queries'

// 로그인 사용자·권한은 가짜로 (DB 처리는 실제로)
vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(async () => ({ kind: 'ALL' })),
}))

const ALL_ROLE_PERMISSIONS: PermissionCode[] = [
  'system.roles.read',
  'system.roles.create',
  'system.roles.update',
  'system.roles.delete',
]

function signInWith(codes: PermissionCode[]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 'op',
    name: '운영',
    username: 'op',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
}

beforeEach(async () => {
  await resetDatabase()
  signInWith(ALL_ROLE_PERMISSIONS)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('권한그룹 서버 액션', () => {
  it('등록: 조회 권한 자동 추가, 다른 영역·없는 코드는 빼고 저장한다', async () => {
    const result = await createPermissionGroupAction({
      name: ' 센터 운영자 ',
      area: 'ADMIN',
      description: '센터 사무직',
      permissionCodes: ['inbound.asn.close', 'portal.asn.read', 'old.menu.read'],
    })
    expect(result.ok).toBe(true)

    const group = await getPermissionGroup(result.ok ? result.data.id : '')
    expect(group).toMatchObject({ name: '센터 운영자', area: 'ADMIN', obsoleteCodes: [] })
    expect(group?.permissionCodes).toEqual(['inbound.asn.read', 'inbound.asn.close'])
  })

  it('등록: 이름이 겹치면 "이미 있는 이름입니다."', async () => {
    await createPermissionGroupAction({ name: '화주 담당', area: 'PORTAL', permissionCodes: [] })
    expect(
      await createPermissionGroupAction({ name: '화주 담당', area: 'PORTAL', permissionCodes: [] }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT', message: '이미 있는 이름입니다.' } })
  })

  it('수정: 권한 목록을 통째로 바꾸고, 옛 코드는 정리되며, 영역은 그대로', async () => {
    const group = await prisma.permissionGroup.create({
      data: {
        name: '재고 담당',
        area: 'ADMIN',
        permissions: {
          create: [
            { permissionCode: 'stock.inventory.read' },
            { permissionCode: 'gone.menu.read' },
          ],
        },
      },
    })
    expect((await getPermissionGroup(group.id))?.obsoleteCodes).toEqual(['gone.menu.read'])

    const result = await updatePermissionGroupAction({
      id: group.id,
      name: '재고 담당자',
      permissionCodes: ['stock.adjustments.confirm', 'portal.stock.read'],
    })

    expect(result.ok).toBe(true)
    const updated = await getPermissionGroup(group.id)
    expect(updated).toMatchObject({ name: '재고 담당자', area: 'ADMIN', obsoleteCodes: [] })
    expect(updated?.permissionCodes).toEqual([
      'stock.adjustments.read',
      'stock.adjustments.confirm',
    ])
  })

  it('수정: 없는 그룹은 NOT_FOUND', async () => {
    expect(
      await updatePermissionGroupAction({ id: 'nope', name: 'x', permissionCodes: [] }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('삭제: 사용자가 있으면 몇 명인지 알려주고 막는다', async () => {
    const group = await prisma.permissionGroup.create({ data: { name: '사용 중', area: 'ADMIN' } })
    const user = await createTestUser('worker', { userType: 'OPERATOR' })
    await prisma.userPermissionGroup.create({ data: { userId: user.id, groupId: group.id } })

    const result = await deletePermissionGroupAction({ id: group.id })

    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
    expect(result.ok === false && result.error.message).toContain('사용자 1명')
    expect(await prisma.permissionGroup.count()).toBe(1)
  })

  it('삭제: 사용자가 없으면 삭제되고 권한 코드도 함께 지워진다', async () => {
    const group = await prisma.permissionGroup.create({
      data: {
        name: '임시',
        area: 'ADMIN',
        permissions: { create: [{ permissionCode: 'stock.inventory.read' }] },
      },
    })
    expect(await deletePermissionGroupAction({ id: group.id })).toEqual({
      ok: true,
      data: { id: group.id },
    })
    expect(await prisma.permissionGroupPermission.count()).toBe(0)
  })

  it('목록: 검색·정렬·페이지와 권한 수·사용자 수', async () => {
    for (const name of ['가 그룹', '나 그룹', '다 그룹']) {
      await prisma.permissionGroup.create({
        data: {
          name,
          area: 'ADMIN',
          permissions: { create: [{ permissionCode: 'stock.inventory.read' }] },
        },
      })
    }
    const result = await listPermissionGroupsAction(
      createDataGridState({ search: '그룹', sorting: [{ id: 'name', desc: true }], pageSize: 20 }),
    )
    expect(result.ok && result.data.rowCount).toBe(3)
    expect(
      result.ok && result.data.rows.map((r) => [r.name, r.permissionCount, r.userCount]),
    ).toEqual([
      ['다 그룹', 1, 0],
      ['나 그룹', 1, 0],
      ['가 그룹', 1, 0],
    ])
  })

  it('권한이 없으면 처리하지 않는다 (조회만 있는 사람의 등록·삭제)', async () => {
    signInWith(['system.roles.read'])
    expect(
      await createPermissionGroupAction({ name: 'x', area: 'ADMIN', permissionCodes: [] }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(await prisma.permissionGroup.count()).toBe(0)
  })
})
