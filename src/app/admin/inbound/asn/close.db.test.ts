import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import { getAsnForEdit } from '@/lib/inbound/asn-queries'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { versionOf } from '@/test/factories'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { closeAsnAction, createAsnAction } from './actions'

// ASN 잔량 마감 (docs/decisions/0052)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }

function signIn(scope: DataScope = ALL, codes: PermissionCode[] = [...ALL_PERMISSION_CODES]) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

let f: InboundFixture

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function createAsn() {
  const result = await createAsnAction({
    shipperId: String(f.gana),
    centerId: String(f.icn),
    expectedOn: '2026-11-20',
    shipperRefNo: '',
    remark: '',
    lines: [
      { itemId: String(f.water), unit: 'EA', qty: '100', lotNo: '', expiryOn: '', remark: '' },
      { itemId: String(f.rice), unit: 'KG', qty: '10', lotNo: '', expiryOn: '', remark: '' },
    ],
  })
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

const close = async (id: string, reason = '화주사 요청으로 잔량 취소') =>
  closeAsnAction({ id, rowVersion: await versionOf('asn', id), reason })

describe('잔량 마감', () => {
  it('사유·마감자·일시를 남기고, 줄마다 잔량을 마감 수량으로 (초과한 줄은 0)', async () => {
    const asn = await createAsn()
    const lines = await prisma.asnLine.findMany({
      where: { asnId: BigInt(asn.id) },
      orderBy: { lineNo: 'asc' },
    })
    // 생수 60 확정(잔량 40), 쌀 12 확정(초과 2)
    await prisma.asnLine.update({ where: { id: lines[0].id }, data: { confirmedQty: '60' } })
    await prisma.asnLine.update({ where: { id: lines[1].id }, data: { confirmedQty: '12' } })
    await prisma.asn.update({ where: { id: BigInt(asn.id) }, data: { status: 'PARTIAL' } })

    expect(await close(asn.id)).toMatchObject({ ok: true })
    const saved = await prisma.asn.findUniqueOrThrow({
      where: { id: BigInt(asn.id) },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    })
    expect(saved).toMatchObject({
      status: 'CLOSED',
      closeReason: '화주사 요청으로 잔량 취소',
      closedBy: 'boss',
    })
    expect(saved.closedAt).toBeInstanceOf(Date)
    expect(saved.lines.map((l) => l.closedQty.toString())).toEqual(['40', '0'])
    // 진행 현황: 잔량 0, 마감 40
    const edit = await getAsnForEdit(BigInt(asn.id), ALL)
    expect(edit?.progress.map((p) => [p.remainingQty, p.closedQty])).toEqual([
      ['0', '40'],
      ['0', '0'],
    ])
  })

  it('사유 필수, 이미 마감·확정완료·잔량 없음은 거부, 버전이 다르면 충돌', async () => {
    const asn = await createAsn()
    expect(await close(asn.id, '  ')).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('사유') },
    })
    expect(await closeAsnAction({ id: asn.id, rowVersion: 99, reason: '취소' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    // 예정 상태도 마감할 수 있다 (기록을 남기고 싶을 때)
    expect(await close(asn.id)).toMatchObject({ ok: true })
    expect(await close(asn.id)).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('이미 마감') },
    })

    const done = await createAsn()
    await prisma.asn.update({ where: { id: BigInt(done.id) }, data: { status: 'COMPLETED' } })
    expect(await close(done.id)).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })

    const full = await createAsn()
    await prisma.asnLine.updateMany({
      where: { asnId: BigInt(full.id) },
      data: { confirmedQty: '100' },
    })
    expect(await close(full.id)).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('마감할 잔량이 없습니다') },
    })
  })

  it('잔량 마감 권한이 필요하고, 범위 밖 ASN은 찾을 수 없다', async () => {
    const asn = await createAsn()
    signIn(ALL, ['inbound.asn.read', 'inbound.asn.update'])
    expect(await close(asn.id)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [f.gmh] })
    expect(await close(asn.id)).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })
})
