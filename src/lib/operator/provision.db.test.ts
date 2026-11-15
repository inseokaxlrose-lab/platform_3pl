import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CODE_GROUPS } from '@/config/defaults/codes'
import { DEFAULT_GROUPS, SUPER_GROUP_NAME } from '@/config/defaults/roles'
import { DEFAULT_UNITS } from '@/config/defaults/units'
import { prisma } from '@/lib/prisma'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { provisionOperator } from './provision'

// 운영사 기본값 넣기 (docs/decisions/0039 3c)

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const countOf = async (operatorId: bigint) => ({
  groups: await prisma.codeGroup.count({ where: { operatorId } }),
  items: await prisma.codeItem.count({ where: { operatorId } }),
  units: await prisma.unit.count({ where: { operatorId } }),
  roles: await prisma.permissionGroup.count({ where: { operatorId } }),
})

describe('provisionOperator', () => {
  it('기본 공통코드·단위·권한그룹을 그 운영사에 넣고, 권한그룹 이름 → 키를 돌려준다', async () => {
    const ids = await provisionOperator(prisma, TEST_OPERATOR_ID)
    expect(await countOf(TEST_OPERATOR_ID)).toEqual({
      groups: DEFAULT_CODE_GROUPS.length,
      items: DEFAULT_CODE_GROUPS.flatMap((g) => g.items).length,
      units: DEFAULT_UNITS.length,
      roles: DEFAULT_GROUPS.length,
    })
    const superGroup = await prisma.permissionGroup.findUniqueOrThrow({
      where: { id: ids.get(SUPER_GROUP_NAME) },
      include: { permissions: true },
    })
    expect(superGroup.operatorId).toBe(TEST_OPERATOR_ID)
    expect(superGroup.permissions.length).toBe(
      DEFAULT_GROUPS.find((g) => g.name === SUPER_GROUP_NAME)!.codes.length,
    )
  })

  it('여러 번 불러도 늘어나지 않고, 운영사가 고친 이름·권한은 그대로 둔다', async () => {
    const ids = await provisionOperator(prisma, TEST_OPERATOR_ID)
    await prisma.unit.updateMany({ where: { code: 'EA' }, data: { name: '낱개' } })
    const superId = ids.get(SUPER_GROUP_NAME)!
    await prisma.permissionGroupPermission.deleteMany({ where: { groupId: superId } })

    await provisionOperator(prisma, TEST_OPERATOR_ID)
    expect(await countOf(TEST_OPERATOR_ID)).toMatchObject({
      units: DEFAULT_UNITS.length,
      roles: DEFAULT_GROUPS.length,
    })
    expect((await prisma.unit.findFirstOrThrow({ where: { code: 'EA' } })).name).toBe('낱개')
    expect(await prisma.permissionGroupPermission.count({ where: { groupId: superId } })).toBe(0)

    // 개발 시드처럼 맞추기를 켜면 권한 목록을 정의대로 되돌린다
    await provisionOperator(prisma, TEST_OPERATOR_ID, { syncGroupPermissions: true })
    expect(
      await prisma.permissionGroupPermission.count({ where: { groupId: superId } }),
    ).toBeGreaterThan(0)
  })

  it('운영사마다 따로 만든다 (같은 코드·이름)', async () => {
    const other = await createTestOperator('B물류')
    await provisionOperator(prisma, TEST_OPERATOR_ID)
    await provisionOperator(prisma, other.id)
    expect(await countOf(other.id)).toEqual(await countOf(TEST_OPERATOR_ID))
    expect(await prisma.unit.count({ where: { code: 'EA' } })).toBe(2)
  })
})
