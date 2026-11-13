import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createTestUser } from '@/test/factories'
import { resetDatabase } from '@/test/reset-database'

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('권한 DB 모델', () => {
  it('권한그룹에 권한 코드를 담고, 사용자에게 그룹과 개별 예외를 연결한다', async () => {
    const user = await createTestUser('worker1')
    const group = await prisma.permissionGroup.create({
      data: {
        name: '센터 작업자',
        permissions: {
          create: [{ permissionCode: 'inbound.asn.read' }, { permissionCode: 'inbound.inspect' }],
        },
      },
    })
    await prisma.userPermissionGroup.create({ data: { userId: user.id, groupId: group.id } })
    await prisma.userPermissionOverride.createMany({
      data: [
        { userId: user.id, permissionCode: 'inbound.confirm', effect: 'GRANT' },
        { userId: user.id, permissionCode: 'inbound.inspect', effect: 'DENY' },
      ],
    })

    const loaded = await prisma.user.findUniqueOrThrow({
      where: { username: 'worker1' },
      include: {
        permissionGroups: { include: { group: { include: { permissions: true } } } },
        permissionOverrides: { orderBy: { permissionCode: 'asc' } },
      },
    })

    expect(loaded.userType).toBe('CENTER')
    expect(loaded.isActive).toBe(true)
    expect(
      loaded.permissionGroups[0].group.permissions.map((p) => p.permissionCode).sort(),
    ).toEqual(['inbound.asn.read', 'inbound.inspect'])
    expect(loaded.permissionOverrides.map((o) => [o.permissionCode, o.effect])).toEqual([
      ['inbound.confirm', 'GRANT'],
      ['inbound.inspect', 'DENY'],
    ])
  })

  it('권한그룹 이름은 중복될 수 없다', async () => {
    await prisma.permissionGroup.create({ data: { name: '화주 담당자' } })
    await expect(
      prisma.permissionGroup.create({ data: { name: '화주 담당자' } }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('로그인 아이디는 중복될 수 없다', async () => {
    await createTestUser('dup')
    await expect(createTestUser('dup', { userType: 'SHIPPER' })).rejects.toMatchObject({
      code: 'P2002',
    })
  })

  it('같은 사용자·같은 권한 코드에는 추가/제외를 하나만 둘 수 있다', async () => {
    const user = await createTestUser('worker2')
    await prisma.userPermissionOverride.create({
      data: { userId: user.id, permissionCode: 'stock.adjust', effect: 'GRANT' },
    })
    await expect(
      prisma.userPermissionOverride.create({
        data: { userId: user.id, permissionCode: 'stock.adjust', effect: 'DENY' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('사용자가 남아 있는 권한그룹은 삭제할 수 없다', async () => {
    const user = await createTestUser('worker3')
    const group = await prisma.permissionGroup.create({ data: { name: '센터 운영자' } })
    await prisma.userPermissionGroup.create({ data: { userId: user.id, groupId: group.id } })

    await expect(prisma.permissionGroup.delete({ where: { id: group.id } })).rejects.toBeTruthy()
    expect(await prisma.permissionGroup.count()).toBe(1)
  })

  it('사용자가 없는 권한그룹을 지우면 그룹의 권한 코드도 함께 지워진다', async () => {
    const group = await prisma.permissionGroup.create({
      data: { name: '임시 그룹', permissions: { create: [{ permissionCode: 'stock.read' }] } },
    })
    await prisma.permissionGroup.delete({ where: { id: group.id } })
    expect(await prisma.permissionGroupPermission.count()).toBe(0)
  })

  it('사용자를 지우면 그룹 소속과 개별 예외가 함께 지워진다 (그룹은 남는다)', async () => {
    const user = await createTestUser('leaver')
    const group = await prisma.permissionGroup.create({ data: { name: '센터 작업자' } })
    await prisma.userPermissionGroup.create({ data: { userId: user.id, groupId: group.id } })
    await prisma.userPermissionOverride.create({
      data: { userId: user.id, permissionCode: 'stock.read', effect: 'GRANT' },
    })

    await prisma.user.delete({ where: { id: user.id } })

    expect(await prisma.userPermissionGroup.count()).toBe(0)
    expect(await prisma.userPermissionOverride.count()).toBe(0)
    expect(await prisma.permissionGroup.count()).toBe(1)
  })
})
