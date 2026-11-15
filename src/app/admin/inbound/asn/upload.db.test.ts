import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_PERMISSION_CODES } from '@/config/permissions'
import type { UploadRow } from '@/lib/excel/upload'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  commitPortalAsnUploadAction,
  validatePortalAsnUploadAction,
} from '../../../portal/asn/actions'
import { commitAsnUploadAction, validateAsnUploadAction } from './actions'

// ASN 엑셀 업로드 (docs/decisions/0050)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

function signIn(scope: DataScope) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: scope.kind === 'SHIPPER' ? 'SHIPPER' : 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(ALL_PERMISSION_CODES))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

let f: InboundFixture

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  signIn({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })
})

afterAll(async () => {
  await prisma.$disconnect()
})

let rowNo = 1
const row = (values: Record<string, string>): UploadRow => ({
  rowNo: ++rowNo,
  values: {
    groupKey: '1',
    shipperCode: 'GANA',
    centerCode: 'ICN',
    expectedOn: '2026-11-20',
    shipperRefNo: 'PO-1',
    itemCode: 'WATER',
    unit: '',
    qty: '10',
    lotNo: '',
    expiryOn: '',
    remark: '',
    ...values,
  },
})

describe('운영사 화면 업로드', () => {
  it('묶음키별로 ASN이 되고, 단위를 비우면 기본단위, 등록 경로는 엑셀', async () => {
    rowNo = 1
    const rows = [
      row({ unit: 'BOX', qty: '3' }),
      row({ itemCode: 'rice', qty: '2.5' }),
      row({
        groupKey: '2',
        expectedOn: '2026/11/21',
        shipperRefNo: '',
        itemCode: 'MILK',
        lotNo: 'L1',
        expiryOn: '2027.1.31',
      }),
    ]
    const preview = await validateAsnUploadAction(rows)
    expect(preview).toMatchObject({
      ok: true,
      data: { errorCount: 0, summary: expect.stringContaining('ASN 2건') },
    })
    // 검증만으로는 저장하지 않는다
    expect(await prisma.asn.count()).toBe(0)

    const result = await commitAsnUploadAction(rows)
    expect(result).toMatchObject({ ok: true, data: { count: 2 } })
    const asns = await prisma.asn.findMany({
      orderBy: { id: 'asc' },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    })
    expect(
      asns.map((a) => [a.channel, a.expectedOn.toISOString().slice(0, 10), a.shipperRefNo]),
    ).toEqual([
      ['EXCEL', '2026-11-20', 'PO-1'],
      ['EXCEL', '2026-11-21', null],
    ])
    expect(asns[0].lines.map((l) => [l.expectedQty.toString(), l.entryUnit])).toEqual([
      ['72', 'BOX'],
      ['2.5', null],
    ])
    expect(asns[1].lines[0]).toMatchObject({ lotNo: 'L1' })
    expect(asns[1].lines[0].expiryOn?.toISOString().slice(0, 10)).toBe('2027-01-31')
  })

  it('행마다 오류 사유를 모으고, 오류가 있으면 등록하지 않는다', async () => {
    rowNo = 1
    const rows = [
      row({}), // 2행: 정상
      row({ expectedOn: '2026-11-21' }), // 3행: 같은 묶음인데 예정일 다름
      row({ groupKey: '2', shipperCode: 'NOPE' }), // 4행: 없는 화주사
      row({ groupKey: '3', centerCode: 'GMH' }), // 5행: 이용하지 않는 센터
      row({ groupKey: '4', itemCode: 'DARA1' }), // 6행: 다른 화주사 품목
      row({ groupKey: '5', qty: '2.5' }), // 7행: EA 정수
      row({ groupKey: '6', lotNo: 'L1' }), // 8행: 로트 관리 안 함
      row({ groupKey: '7', expectedOn: '2026-13-01' }), // 9행: 날짜
      row({ groupKey: '8', qty: '' }), // 10행: 필수 비움
      row({ groupKey: '9', unit: 'CARTON' }), // 11행: 없는 단위
    ]
    const result = await validateAsnUploadAction(rows)
    const errors = Object.fromEntries(
      (result.ok ? result.data.rows : []).map((r) => [r.rowNo, r.errors.join(' / ')]),
    )
    expect(errors[2]).toBe('')
    expect(errors[3]).toContain('[입고예정일] 같은 묶음(1)의 첫 줄(2행)과 다릅니다.')
    expect(errors[4]).toContain('[화주사코드] 없거나 사용 중지된 화주사')
    expect(errors[5]).toContain('[센터코드] 이 화주사가 이용하지 않는 센터')
    expect(errors[6]).toContain('[품목코드] 이 화주사의 품목이 아닙니다')
    expect(errors[7]).toContain('정수만')
    expect(errors[8]).toContain('로트를 관리하지 않는')
    expect(errors[9]).toContain('[입고예정일] 날짜 형식')
    expect(errors[10]).toContain('[수량] 수량을(를) 넣어 주세요')
    expect(errors[11]).toContain('없는 단위')
    expect(result.ok && result.data.errorCount).toBe(9)

    expect(await commitAsnUploadAction(rows)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    expect(await prisma.asn.count()).toBe(0)
  })

  it('센터 직원은 소속 센터로만 올릴 수 있다', async () => {
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [f.gmh] })
    rowNo = 1
    const result = await validateAsnUploadAction([row({})])
    // 김해센터 직원에게 가나(이천 이용)는 범위 밖 화주사
    expect(result.ok && result.data.rows[0].errors.join()).toContain('화주사')
  })
})

describe('화주 포털 업로드', () => {
  it('화주사 칸 없이 자기 화주사, 다른 화주사의 품목코드는 찾지 못한다', async () => {
    signIn({ kind: 'SHIPPER', operatorId: TEST_OPERATOR_ID, shipperId: f.gana })
    rowNo = 1
    const strip = (r: UploadRow) => {
      const { shipperCode, ...values } = r.values
      void shipperCode
      return { ...r, values }
    }
    const bad = await validatePortalAsnUploadAction([strip(row({ itemCode: 'DARA1' }))])
    expect(bad.ok && bad.data.errorCount).toBe(1)
    expect(await commitPortalAsnUploadAction([strip(row({}))])).toMatchObject({
      ok: true,
      data: { count: 1 },
    })
    expect(await prisma.asn.findFirstOrThrow()).toMatchObject({
      shipperId: f.gana,
      channel: 'EXCEL',
    })
  })
})
