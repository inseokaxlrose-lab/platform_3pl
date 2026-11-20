import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { createTestShipper } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { issueCode } from './numbering'
import { periodKeyOf } from './numbering-codes'
import { numberingRuleSchema, type NumberingRuleInput } from './numbering-rule-schema'
import { listNumberingRules, resetNumberingRule, saveNumberingRule } from './numbering-rules'

// 체번 규칙 관리 (0085): 운영사 재정의·미리보기·겹침 검사·기본으로 되돌리기

const asOperator = <T>(fn: () => Promise<T>) =>
  runInContext({ actor: 'boss', operatorId: TEST_OPERATOR_ID }, fn)

const ctx = { operatorId: TEST_OPERATOR_ID }
const today = periodKeyOf('DAY', new Date(), 'Asia/Seoul')

// 화주사 규칙 입력 (기본: 시스템과 같은 SH + 4자리)
const shipperRule = (overrides: Partial<NumberingRuleInput> = {}) =>
  numberingRuleSchema.parse({
    target: 'SHIPPER',
    fixedPrefix: 'SH',
    typeChar: '',
    separator: '',
    dateFormat: 'NONE',
    seqLength: 4,
    resetCycle: 'NONE',
    ...overrides,
  })

const save = (overrides: Partial<NumberingRuleInput>, rowVersion: number | null = null) =>
  asOperator(() => saveNumberingRule(shipperRule(overrides), rowVersion))

const view = async (target: string) =>
  (await listNumberingRules(prisma, TEST_OPERATOR_ID)).find((v) => v.target === target)!

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('체번 규칙 목록', () => {
  it('대상 8개, 시스템 기본 + 다음 번호 미리보기', async () => {
    const views = await listNumberingRules(prisma, TEST_OPERATOR_ID)
    expect(views.map((v) => v.target)).toEqual([
      'SHIPPER',
      'CUSTOMER',
      'SHIP_TO',
      'ITEM',
      'ASN',
      'RECEIPT',
      'LABEL',
      'ADJUST',
    ])
    expect(views.find((v) => v.target === 'SHIPPER')).toMatchObject({
      overridden: false,
      issued: false,
      preview: 'SH0001',
    })
    expect(views.find((v) => v.target === 'ASN')!.preview).toBe(`AS${today}-0001`)
    // 화주 접두어가 있는 대상은 첫 화주사 기준
    await createTestShipper('GANA', { codePrefix: 'GN' })
    expect((await view('ITEM')).preview).toBe('GNS000001')
    // 발급하면 다음 번호가 늘어난다
    await issueCode(prisma, 'SHIPPER', ctx)
    expect(await view('SHIPPER')).toMatchObject({ issued: true, preview: 'SH0002' })
  })
})

describe('체번 규칙 저장', () => {
  it('운영사 규칙으로 바꾸면 그 모양으로 발급, 기본으로 되돌리면 시스템 모양', async () => {
    const saved = await save({ fixedPrefix: 'hs', seqLength: 5 })
    expect(await view('SHIPPER')).toMatchObject({ overridden: true, preview: 'HS00001' })
    expect(await issueCode(prisma, 'SHIPPER', ctx)).toBe('HS00001')
    // 다시 고칠 때는 버전을 보낸다
    expect(await save({ fixedPrefix: 'HS', seqLength: 6 }, saved.rowVersion)).toMatchObject({
      rowVersion: saved.rowVersion + 1,
    })
    await expect(save({ seqLength: 3 }, saved.rowVersion)).rejects.toThrow(/먼저/)
    // 되돌리기: 카운터는 이어진다 (SH0002)
    await asOperator(() => resetNumberingRule('SHIPPER', saved.rowVersion + 1))
    expect(await view('SHIPPER')).toMatchObject({ overridden: false, preview: 'SH0002' })
  })

  it('예전에 직접 넣은 코드가 새 자동 모양과 같으면 거부', async () => {
    // SH 규칙일 때는 HS0007이 자동 모양이 아니라 직접 넣을 수 있었다
    await createTestShipper('HS0007')
    await expect(save({ fixedPrefix: 'HS' })).rejects.toThrow(/HS0007/)
    // 자리수가 달라 겹치지 않는 모양은 된다
    await expect(save({ fixedPrefix: 'HS', seqLength: 5 })).resolves.toBeTruthy()
  })

  it('이미 발급한 번호는 카운터가 이어져 겹치지 않으므로 자리수를 바꿔도 된다', async () => {
    for (let i = 0; i < 2; i++) await createTestShipper(await issueCode(prisma, 'SHIPPER', ctx))
    await expect(save({ seqLength: 3 })).resolves.toBeTruthy()
    expect(await issueCode(prisma, 'SHIPPER', ctx)).toBe('SH003')
  })

  it('초기화 주기를 바꿔 카운터가 1부터 다시 시작하면 오늘 발급한 번호와 겹쳐 거부', async () => {
    const daily = { separator: '-', dateFormat: 'YYMMDD', resetCycle: 'DAY' } as const
    const saved = await save(daily)
    for (let i = 0; i < 2; i++) await createTestShipper(await issueCode(prisma, 'SHIPPER', ctx))
    // 매월 초기화: 이번 달 카운터는 0 → 오늘 SH{오늘}-0001이 다시 나온다
    await expect(save({ ...daily, resetCycle: 'MONTH' }, saved.rowVersion)).rejects.toThrow(
      new RegExp(`SH${today}-0001`),
    )
  })

  it('입력 검사: 주기가 있으면 날짜 필수, 코드 칸 길이, 고정 접두어는 영문 대문자', async () => {
    expect(numberingRuleSchema.safeParse({ ...shipperRule(), resetCycle: 'DAY' }).success).toBe(
      false,
    )
    // 화주사 코드 칸은 20자: SHIPX(5) + 날짜 6 + 구분자 1 + 8자리 = 20자는 되고, 구분 문자를 더하면 넘는다
    await expect(
      save({ fixedPrefix: 'SHIPX', dateFormat: 'YYMMDD', separator: '-', seqLength: 8 }),
    ).resolves.toBeTruthy()
    await expect(
      save(
        { fixedPrefix: 'SHIPX', typeChar: 'Z', dateFormat: 'YYMMDD', separator: '-', seqLength: 8 },
        1,
      ),
    ).rejects.toThrow(/20자/)
    await expect(save({ fixedPrefix: 'S1' }, 1)).rejects.toThrow(/영문 대문자/)
  })
})
