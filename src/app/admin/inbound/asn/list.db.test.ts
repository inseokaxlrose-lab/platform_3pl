import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import { getAsnForEdit } from '@/lib/inbound/asn-queries'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { listPortalAsnsAction } from '../../../portal/asn/actions'
import { createAsnAction, listAsnsAction } from './actions'

// ASN 조회 (docs/decisions/0051)

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
    userType: scope.kind === 'SHIPPER' ? 'SHIPPER' : 'OPERATOR',
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

const line = (itemId: bigint, qty = '100') => ({
  itemId: String(itemId),
  unit: itemId === f.rice ? 'KG' : 'EA',
  qty,
  lotNo: '',
  expiryOn: '',
  remark: '',
})

async function create(shipper: 'gana' | 'dara', expectedOn = '2026-11-20') {
  const result = await createAsnAction({
    shipperId: String(f[shipper]),
    centerId: String(shipper === 'gana' ? f.icn : f.gmh),
    expectedOn,
    shipperRefNo: `PO-${shipper}`,
    remark: '',
    lines: shipper === 'gana' ? [line(f.water), line(f.rice, '10')] : [line(f.daraItem)],
  })
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

const list = async (filters: Record<string, string> = {}) => {
  const result = await listAsnsAction({ ...createDataGridState(), filters })
  if (!result.ok) throw new Error(result.error.message)
  return result.data.rows
}

describe('ASN 목록', () => {
  it('잔량 줄·초과 줄을 센다 (예정 100에 확정 120 = 초과, 60 = 잔량)', async () => {
    const a = await create('gana')
    const lines = await prisma.asnLine.findMany({
      where: { asnId: BigInt(a.id) },
      orderBy: { lineNo: 'asc' },
    })
    await prisma.asnLine.update({ where: { id: lines[0].id }, data: { confirmedQty: '120' } })
    await prisma.asnLine.update({ where: { id: lines[1].id }, data: { confirmedQty: '6' } })
    const [row] = await list()
    expect(row).toMatchObject({
      asnNo: a.asnNo,
      shipper: 'GANA 화주 (GANA)',
      center: '이천센터 (ICN)',
      expectedOn: '2026-11-20',
      lineCount: 2,
      remainingLines: 1,
      overLines: 1,
      status: 'PLANNED',
      channel: 'PROXY',
    })
    // 상세의 진행 현황: 기본단위 잔량·초과
    const edit = await getAsnForEdit(BigInt(a.id), ALL)
    expect(edit?.progress.map((p) => [p.remainingQty, p.overQty, p.baseUnit])).toEqual([
      ['0', '20', 'EA'],
      ['4', '0', 'KG'],
    ])
  })

  it('조건: 화주사·센터·입고 상태(여러 개)·예정일 기간·검색어', async () => {
    const a = await create('gana', '2026-11-20')
    const b = await create('dara', '2026-11-25')
    await prisma.asn.update({ where: { id: BigInt(b.id) }, data: { status: 'INSPECTING' } })
    const nos = (rows: { asnNo: string }[]) => rows.map((r) => r.asnNo).sort()
    expect(nos(await list({ shipper: String(f.dara) }))).toEqual([b.asnNo])
    expect(nos(await list({ center: String(f.icn) }))).toEqual([a.asnNo])
    expect(nos(await list({ status: 'PLANNED,INSPECTING' }))).toEqual(nos([a, b]))
    expect(nos(await list({ status: 'INSPECTING,NOPE' }))).toEqual([b.asnNo])
    expect(nos(await list({ expectedOn: '2026-11-21~2026-11-30' }))).toEqual([b.asnNo])
    expect(nos(await list({ expectedOn: '~2026-11-20' }))).toEqual([a.asnNo])
    const searched = await listAsnsAction({
      ...createDataGridState({ search: 'PO-dara' }),
      filters: {},
    })
    expect(searched.ok && nos(searched.data.rows)).toEqual([b.asnNo])
  })

  it('범위: 센터 직원은 소속 센터, 화주사 사용자는 자기 화주사. 엑셀 전체는 엑셀 권한', async () => {
    const a = await create('gana')
    const b = await create('dara')
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [f.gmh] })
    expect((await list()).map((r) => r.asnNo)).toEqual([b.asnNo])
    signIn({ kind: 'SHIPPER', operatorId: TEST_OPERATOR_ID, shipperId: f.gana })
    const portal = await listPortalAsnsAction({ ...createDataGridState(), filters: {} })
    expect(portal.ok && portal.data.rows.map((r) => r.asnNo)).toEqual([a.asnNo])
    expect(
      await listPortalAsnsAction({ ...createDataGridState(), filters: {}, exportAll: true }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    signIn(ALL, ['inbound.asn.read'])
    expect(
      await listAsnsAction({ ...createDataGridState(), filters: {}, exportAll: true }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })
})
