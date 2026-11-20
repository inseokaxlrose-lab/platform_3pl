import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { getOperatorDisplayUnits } from './display-units'

// 운영사 중량·길이 표시 단위 = 단위 기준정보 참조 (docs/decisions/0078)

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

// 코드 → 단위 id (이 운영사의 단위가 시스템 단위보다 먼저, 없는 코드는 없는 id)
const unitId = async (code: string) => {
  const row = await prisma.unit.findFirst({
    where: { code, OR: [{ operatorId: TEST_OPERATOR_ID }, { operatorId: null }] },
    orderBy: { operatorId: { sort: 'asc', nulls: 'last' } },
  })
  return row?.id ?? 999999999n
}
const setUnits = async (weight: string, length: string) =>
  prisma.operator.update({
    where: { id: TEST_OPERATOR_ID },
    data: { weightUnitId: await unitId(weight), lengthUnitId: await unitId(length) },
  })

describe('운영사 표시 단위', () => {
  it('기본은 kg·cm, 시스템 단위(LB·MM)로 바꾸면 그 환산계수로', async () => {
    expect(await getOperatorDisplayUnits(prisma, TEST_OPERATOR_ID)).toMatchObject({
      weight: { code: 'KG', label: 'kg' },
      length: { code: 'CM', label: 'cm' },
    })
    await setUnits('LB', 'MM')
    const units = await getOperatorDisplayUnits(prisma, TEST_OPERATOR_ID)
    expect(units.weight).toMatchObject({ code: 'LB', label: 'lb', type: 'WEIGHT' })
    expect(units.weight.baseFactor).toMatch(/^0\.45359237/)
    expect(units.length).toMatchObject({ code: 'MM', label: 'mm' })
  })

  it('이 운영사의 추가 단위(근)도 되고, 단위 표에 없거나 유형이 다른 코드는 DB가 거부', async () => {
    await prisma.unit.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        code: 'GN',
        name: '근',
        type: 'WEIGHT',
        baseFactor: '0.6',
        baseUnitId: (
          await prisma.unit.findFirstOrThrow({ where: { code: 'KG', operatorId: null } })
        ).id,
        printName: '근',
      },
    })
    await setUnits('GN', 'CM')
    expect((await getOperatorDisplayUnits(prisma, TEST_OPERATOR_ID)).weight).toMatchObject({
      code: 'GN',
      label: '근',
    })
    await expect(setUnits('EA', 'CM')).rejects.toThrow(/중량 단위/)
    await expect(setUnits('KG', 'KG')).rejects.toThrow(/길이 단위/)
    // 없는 단위 id는 외래 키가 거부
    await expect(setUnits('XX', 'CM')).rejects.toThrow()
  })
})
