import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { getOperatorSetting, getOperatorSettings, saveOperatorSettings } from './operator-settings'

// 운영 설정 (docs/decisions/0092): 행이 없으면 기본값, 기본값으로 저장하면 행을 지운다, 운영사마다 따로

const asOperator = <T>(fn: () => Promise<T>, operatorId = TEST_OPERATOR_ID) =>
  runInContext({ actor: 'boss', operatorId }, fn)

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('운영 설정', () => {
  it('기본값 → 저장 → 다시 기본값으로 저장하면 행이 없어진다, 다른 운영사는 영향 없음', async () => {
    expect((await getOperatorSettings(TEST_OPERATOR_ID)).values).toEqual({
      expiryAlertDays: null,
      apiKeyMaxDays: null,
    })
    await asOperator(() => saveOperatorSettings({ expiryAlertDays: 30, apiKeyMaxDays: null }))
    expect(await getOperatorSetting(TEST_OPERATOR_ID, 'expiryAlertDays')).toBe(30)
    expect(
      await prisma.operatorSetting.findMany({ select: { key: true, updatedBy: true } }),
    ).toEqual([{ key: 'expiryAlertDays', updatedBy: 'boss' }])
    const other = await createTestOperator('남의운영사')
    expect(await getOperatorSetting(other.id, 'expiryAlertDays')).toBeNull()

    await asOperator(() => saveOperatorSettings({ expiryAlertDays: null, apiKeyMaxDays: null }))
    expect(await prisma.operatorSetting.count()).toBe(0)
  })

  it('저장된 값이 규칙에 맞지 않으면(정의가 바뀐 경우) 기본값을 쓴다', async () => {
    await prisma.operatorSetting.create({
      data: { operatorId: TEST_OPERATOR_ID, key: 'expiryAlertDays', value: 'abc' },
    })
    expect(await getOperatorSetting(TEST_OPERATOR_ID, 'expiryAlertDays')).toBeNull()
  })
})
