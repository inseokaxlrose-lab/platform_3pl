import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLabelWork } from '@/lib/labels/label-queries'
import { saveUserPrefAction } from '@/lib/prefs/pref-actions'
import { getUserPref } from '@/lib/prefs/user-prefs'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { createTestUser } from '@/test/factories'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { signInAs } from '@/test/inbound-session'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { getCurrentUser } from '@/lib/session'
import { markLabelsPrintedAction, prepareLabelsAction } from './actions'

// 라벨 인쇄 (docs/decisions/0056)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }
let f: InboundFixture
let asnId = 0n
let inspectionId = ''

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  signInAs(ALL)
  const asn = await prisma.asn.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      centerId: f.icn,
      shipperId: f.gana,
      asnNo: 'AS-T-1',
      channel: 'PROXY',
      expectedOn: new Date('2026-11-20'),
      status: 'INSPECTING',
    },
  })
  asnId = asn.id
  const line = await prisma.asnLine.create({
    data: { operatorId: TEST_OPERATOR_ID, asnId, lineNo: 1, itemId: f.water, expectedQty: '3000' },
  })
  inspectionId = String(
    (
      await prisma.inboundInspection.create({
        data: {
          operatorId: TEST_OPERATOR_ID,
          asnId,
          asnLineId: line.id,
          itemId: f.water,
          inspectedQty: '3000',
          lotNo: null,
        },
      })
    ).id,
  )
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('라벨 인쇄', () => {
  it('미리보기: 라벨을 만들고 인쇄할 모양을 돌려준다, 인쇄 기록은 재발행마다 +1', async () => {
    const prepared = await prepareLabelsAction({ inspectionIds: [inspectionId] })
    const labels = prepared.ok ? prepared.data : []
    expect(labels.map((l) => [l.seq, l.qty, l.labelUnit, l.itemCode, l.asnNo])).toEqual([
      [1, '1440', 'PLT', 'WATER', 'AS-T-1'],
      [2, '1440', 'PLT', 'WATER', 'AS-T-1'],
      [3, '120', 'PLT', 'WATER', 'AS-T-1'],
    ])
    const ids = labels.map((l) => l.id)
    await markLabelsPrintedAction({ labelIds: ids })
    await markLabelsPrintedAction({ labelIds: ids })
    // 다시 미리보기해도 같은 라벨 (번호 고정), 인쇄 횟수 2
    const again = await prepareLabelsAction({ inspectionIds: [inspectionId] })
    expect(again.ok && again.data.map((l) => [l.id, l.printCount])).toEqual(
      ids.map((id) => [id, 2]),
    )
    const work = await getLabelWork(asnId, ALL)
    expect(work?.inspections[0]).toMatchObject({
      labelCount: 3,
      printedCount: 3,
      labelConvQty: '1440',
    })
  })

  it('인쇄 권한이 필요하고, 범위 밖 검수는 찾을 수 없다', async () => {
    signInAs(ALL, ['inbound.labels.read'])
    expect(await prepareLabelsAction({ inspectionIds: [inspectionId] })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    signInAs({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [f.gmh] })
    expect(await prepareLabelsAction({ inspectionIds: [inspectionId] })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
    expect(await prepareLabelsAction({ inspectionIds: ['999999'] })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
  })
})

describe('개인 설정 (라벨 양식·코드 기억)', () => {
  it('본인 것만 저장, 정한 키·모양만, 없으면 기본값', async () => {
    const user = await createTestUser('label.worker')
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: user.id,
      name: 'w',
      username: 'label.worker',
      userType: 'OPERATOR',
    })
    expect(await getUserPref(user.id, 'label-print')).toEqual({
      templates: { PLT: 'PLT_A', BOX: 'BOX_A' },
      codeType: 'QR',
    })
    const value = { templates: { PLT: 'PLT_B', BOX: 'BOX_A' }, codeType: 'DATAMATRIX' }
    expect(await saveUserPrefAction({ key: 'label-print', value })).toMatchObject({ ok: true })
    expect(await getUserPref(user.id, 'label-print')).toEqual(value)
    expect(
      await saveUserPrefAction({ key: 'label-print', value: { ...value, codeType: 'BAR' } }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } })
    expect(await saveUserPrefAction({ key: 'nope', value: 1 })).toMatchObject({ ok: false })
  })
})
