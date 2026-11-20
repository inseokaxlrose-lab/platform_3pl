import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ActionError } from '@/lib/actions/action-error'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  deleteExternalCodes,
  findByExternalCode,
  getExternalCodes,
  saveExternalCodes,
} from './external-codes'

// 외부 코드 저장은 서버 액션 안(운영사 출입증)에서만 불린다 → 테스트 운영사 출입증을 달고 부른다
const save = (...args: Parameters<typeof saveExternalCodes>) =>
  runInContext({ actor: 'system', operatorId: TEST_OPERATOR_ID }, () => saveExternalCodes(...args))

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('외부 코드 매핑', () => {
  it('채운 칸은 저장하고, 고치면 바뀌고, 비우면 지운다', async () => {
    await save(prisma, 'CENTER', 1n, { SAP: ' 1000 ', ERP: 'W-ICN' })
    expect(await getExternalCodes('CENTER', 1n)).toEqual({ SAP: '1000', ERP: 'W-ICN' })

    await save(prisma, 'CENTER', 1n, { SAP: '1001', ERP: '' })
    expect(await getExternalCodes('CENTER', 1n)).toEqual({ SAP: '1001', ERP: '' })
    expect(await prisma.externalCode.count()).toBe(1)
  })

  it('같은 연동 상대·같은 종류에서 다른 대상이 쓰는 코드는 거부한다 (종류가 다르면 허용)', async () => {
    await save(prisma, 'CENTER', 1n, { SAP: '1000' })

    await expect(save(prisma, 'CENTER', 2n, { SAP: '1000' })).rejects.toThrow(ActionError)
    await expect(save(prisma, 'CENTER', 2n, { SAP: '1000' })).rejects.toThrow(/SAP 코드 '1000'/)
    // 같은 대상이 같은 코드로 다시 저장하는 것은 괜찮다
    await save(prisma, 'CENTER', 1n, { SAP: '1000' })
    // 다른 연동 상대, 다른 종류는 같은 글자여도 괜찮다
    await save(prisma, 'CENTER', 2n, { ERP: '1000' })
    await save(prisma, 'WAREHOUSE', 1n, { SAP: '1000' })
    expect(await prisma.externalCode.count()).toBe(3)
  })

  it('DB 규칙으로도 중복을 막는다 (프로그램을 거치지 않아도)', async () => {
    await prisma.externalCode.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        system: 'SAP',
        entityType: 'CENTER',
        entityId: 1n,
        code: 'X',
      },
    })
    await expect(
      prisma.externalCode.create({
        data: {
          operatorId: TEST_OPERATOR_ID,
          system: 'SAP',
          entityType: 'CENTER',
          entityId: 2n,
          code: 'X',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
    await expect(
      prisma.externalCode.create({
        data: {
          operatorId: TEST_OPERATOR_ID,
          system: 'SAP',
          entityType: 'CENTER',
          entityId: 1n,
          code: 'Y',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' })
  })

  it('외부 코드로 우리 대상을 찾고, 대상이 사라지면 매핑도 정리한다', async () => {
    await save(prisma, 'CENTER', 1n, { SAP: '1000', ERP: 'E1' })
    expect(await findByExternalCode(TEST_OPERATOR_ID, 'SAP', 'CENTER', ' 1000')).toBe(1n)
    expect(await findByExternalCode(TEST_OPERATOR_ID, 'SAP', 'CENTER', 'nope')).toBeNull()

    await deleteExternalCodes(prisma, 'CENTER', 1n)
    expect(await getExternalCodes('CENTER', 1n)).toEqual({ SAP: '', ERP: '' })
  })
})
