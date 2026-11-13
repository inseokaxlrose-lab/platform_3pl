import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createTestUser } from '@/test/factories'
import { resetDatabase } from '@/test/reset-database'
import { loadUserPermissions } from './load-user-permissions'

function createGroup(name: string, codes: string[]) {
  return prisma.permissionGroup.create({
    data: { name, permissions: { create: codes.map((permissionCode) => ({ permissionCode })) } },
  })
}

const sorted = (codes: ReadonlySet<string>) => [...codes].sort()

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('loadUserPermissions (DB)', () => {
  it('여러 그룹 + 사용자 추가 − 사용자 제외를 DB에서 읽어 계산한다', async () => {
    const user = await createTestUser('worker')
    const inbound = await createGroup('입고 작업자', [
      'inbound.asn.read',
      'inbound.inspection.read',
      'inbound.inspection.update',
    ])
    const stock = await createGroup('재고 조회자', ['stock.inventory.read', 'inbound.asn.read'])
    await prisma.userPermissionGroup.createMany({
      data: [
        { userId: user.id, groupId: inbound.id },
        { userId: user.id, groupId: stock.id },
      ],
    })
    await prisma.userPermissionOverride.createMany({
      data: [
        { userId: user.id, permissionCode: 'inbound.confirm.read', effect: 'GRANT' },
        { userId: user.id, permissionCode: 'inbound.confirm.confirm', effect: 'GRANT' },
        { userId: user.id, permissionCode: 'inbound.inspection.update', effect: 'DENY' },
      ],
    })

    const result = await loadUserPermissions(user.id)

    expect(sorted(result.codes)).toEqual([
      'inbound.asn.read',
      'inbound.confirm.confirm',
      'inbound.confirm.read',
      'inbound.inspection.read',
      'stock.inventory.read',
    ])
  })

  it('화주사 사용자가 운영사 화면 그룹에 잘못 들어가도 운영사 권한은 생기지 않는다', async () => {
    const shipper = await createTestUser('shipper', { userType: 'SHIPPER' })
    const adminGroup = await createGroup('센터 운영자', ['inbound.asn.read', 'system.users.read'])
    const portalGroup = await createGroup('화주 담당자', ['portal.asn.read', 'portal.stock.read'])
    await prisma.userPermissionGroup.createMany({
      data: [
        { userId: shipper.id, groupId: adminGroup.id },
        { userId: shipper.id, groupId: portalGroup.id },
      ],
    })

    const result = await loadUserPermissions(shipper.id)

    expect(sorted(result.codes)).toEqual(['portal.asn.read', 'portal.stock.read'])
    expect(result.ignored).toHaveLength(2)
  })

  it('사용 중지 계정은 그룹이 있어도 권한이 없다', async () => {
    const user = await createTestUser('leaver')
    const group = await createGroup('재고 조회자', ['stock.inventory.read'])
    await prisma.userPermissionGroup.create({ data: { userId: user.id, groupId: group.id } })
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } })

    expect((await loadUserPermissions(user.id)).codes.size).toBe(0)
  })

  it('없는 사용자는 권한이 없다', async () => {
    expect((await loadUserPermissions('no-such-user')).codes.size).toBe(0)
  })
})
