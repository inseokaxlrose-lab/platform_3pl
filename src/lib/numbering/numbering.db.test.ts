import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { isAutoPattern, issueCode, issueCodes } from './numbering'

// 체번 (docs/decisions/0084): 운영사·범위·주기마다 1부터, 동시에 받아도 겹치지 않음, 운영사 재정의

const AT = new Date('2026-11-20T01:00:00Z') // 한국 11-20
const NEXT_DAY = new Date('2026-11-20T16:00:00Z') // 한국 11-21

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('체번', () => {
  it('전표번호: 운영사마다·날마다 0001부터 (운영사 타임존 날짜)', async () => {
    const other = (await createTestOperator('다른운영사')).id
    expect(await issueCode(prisma, 'ASN', { operatorId: TEST_OPERATOR_ID, at: AT })).toBe(
      'AS261120-0001',
    )
    expect(await issueCode(prisma, 'ASN', { operatorId: TEST_OPERATOR_ID, at: AT })).toBe(
      'AS261120-0002',
    )
    expect(await issueCode(prisma, 'ASN', { operatorId: other, at: AT })).toBe('AS261120-0001')
    expect(await issueCode(prisma, 'ASN', { operatorId: TEST_OPERATOR_ID, at: NEXT_DAY })).toBe(
      'AS261121-0001',
    )
    expect(await issueCode(prisma, 'LABEL', { operatorId: TEST_OPERATOR_ID, at: AT })).toBe(
      'LB261120-000001',
    )
    // 운영사 타임존이 다르면 그 나라 날짜 (뉴욕 11-19)
    await prisma.operator.update({ where: { id: other }, data: { timezone: 'America/New_York' } })
    expect(
      await issueCode(prisma, 'RECEIPT', {
        operatorId: other,
        at: new Date('2026-11-20T03:00:00Z'),
      }),
    ).toBe('RC261119-0001')
  })

  it('동시에 30건을 받아도 겹치지 않고, n건 범위 발급은 연속 번호', async () => {
    const codes = await Promise.all(
      Array.from({ length: 30 }, () =>
        issueCode(prisma, 'ADJUST', { operatorId: TEST_OPERATOR_ID, at: AT }),
      ),
    )
    expect(new Set(codes).size).toBe(30)
    expect(await issueCodes(prisma, 'ADJUST', { operatorId: TEST_OPERATOR_ID, at: AT }, 3)).toEqual(
      ['AJ261120-0031', 'AJ261120-0032', 'AJ261120-0033'],
    )
  })

  it('마스터: 화주사 범위·거래처 범위로 따로 세고, 접두어는 화주 code_prefix·상위 코드', async () => {
    const ctx = { operatorId: TEST_OPERATOR_ID }
    expect(await issueCode(prisma, 'SHIPPER', ctx)).toBe('SH0001')
    expect(await issueCode(prisma, 'ITEM', { ...ctx, shipperId: 1n, prefix: 'AB' })).toBe(
      'ABS000001',
    )
    expect(await issueCode(prisma, 'ITEM', { ...ctx, shipperId: 2n, prefix: 'CD' })).toBe(
      'CDS000001',
    )
    expect(await issueCode(prisma, 'ITEM', { ...ctx, shipperId: 1n, prefix: 'AB' })).toBe(
      'ABS000002',
    )
    expect(
      await issueCode(prisma, 'SHIP_TO', { ...ctx, customerId: 7n, prefix: 'ABC000123' }),
    ).toBe('ABC000123-01')
    await expect(issueCode(prisma, 'CUSTOMER', { ...ctx, shipperId: 1n })).rejects.toThrow(
      'code_prefix',
    )
  })

  it('운영사 재정의 규칙이 시스템 기본보다 우선', async () => {
    await prisma.numberingRule.create({
      data: {
        operatorId: TEST_OPERATOR_ID,
        target: 'ASN',
        scope: 'OPERATOR',
        prefixSource: 'FIXED',
        fixedPrefix: 'IN',
        separator: '-',
        dateFormat: 'YYMMDD',
        seqLength: 5,
        resetCycle: 'DAY',
      },
    })
    expect(await issueCode(prisma, 'ASN', { operatorId: TEST_OPERATOR_ID, at: AT })).toBe(
      'IN261120-00001',
    )
    const other = (await createTestOperator('다른운영사')).id
    expect(await issueCode(prisma, 'ASN', { operatorId: other, at: AT })).toBe('AS261120-0001')
  })

  it('직접 입력이 자동 체번 모양이면 알아본다', async () => {
    const ctx = { operatorId: TEST_OPERATOR_ID, prefix: 'AB' }
    expect(await isAutoPattern(prisma, 'ITEM', ctx, 'abs000123')).toBe(true)
    expect(await isAutoPattern(prisma, 'ITEM', ctx, 'SKU-001')).toBe(false)
    expect(await isAutoPattern(prisma, 'SHIPPER', { operatorId: TEST_OPERATOR_ID }, 'SH0001')).toBe(
      true,
    )
    expect(await isAutoPattern(prisma, 'SHIPPER', { operatorId: TEST_OPERATOR_ID }, 'GANA')).toBe(
      false,
    )
  })
})
