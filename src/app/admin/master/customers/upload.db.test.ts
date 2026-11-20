import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALL_PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter, createTestCodeGroup, createTestShipper } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import type { UploadRow } from '@/lib/excel/upload'
import { commitCustomerUploadAction, validateCustomerUploadAction } from './actions'

// 거래처 엑셀 업로드 (docs/decisions/0082 ③) — API upsert와 같은 서비스, 오류가 있으면 파일 전체 거부

// 주소 검색 API 대신 가짜 검색기: 아는 주소 두 곳만 1건으로 찾고, 나머지는 0건
vi.mock('@/lib/regions/juso-client', () => {
  const KNOWN = [
    {
      key: '판교역로 166',
      hit: {
        roadAddress: '경기도 성남시 분당구 판교역로 166',
        jibunAddress: '경기도 성남시 분당구 백현동 532',
        zipCode: '13529',
        bjdCode: '4113510900',
        bdMgtSn: '4113510900105320000000001',
        buildingName: '',
      },
    },
    {
      key: '테헤란로 152',
      hit: {
        roadAddress: '서울특별시 강남구 테헤란로 152',
        jibunAddress: '서울특별시 강남구 역삼동 737',
        zipCode: '06236',
        bjdCode: '1168010100',
        bdMgtSn: '1168010100107370000000001',
        buildingName: '',
      },
    },
  ]
  return {
    jusoSearcher: () => async (keyword: string) => {
      const found = KNOWN.find((k) => keyword.includes(k.key))
      return found
        ? { status: 'OK', total: 1, hits: [found.hit] }
        : { status: 'OK', total: 0, hits: [] }
    },
  }
})

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
    userType: scope.kind === 'ALL' ? 'OPERATOR' : 'CENTER',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

let icn = 0n
let gmh = 0n
let gana = 0n // 이천센터 이용
let dara = 0n // 이천·김해센터 이용

// 권역설정 배정 (0076): 우편번호(지역 마스터) + 배정표. bjdCode를 주면 우편번호↔법정동도
async function assignZip(zipCode: string, centerId: bigint | null, bjdCode?: string) {
  await prisma.regionZip.upsert({
    where: { code: zipCode },
    create: {
      code: zipCode,
      sidoCode: zipCode.slice(0, 2),
      sigunguCode: '00000',
      firstLoadVer: 'T',
      lastLoadVer: 'T',
    },
    update: {},
  })
  if (bjdCode) {
    await prisma.regionBjd.upsert({
      where: { code: bjdCode },
      create: {
        code: bjdCode,
        sidoCode: bjdCode.slice(0, 2),
        sidoName: '시도',
        sigunguCode: bjdCode.slice(0, 5),
        level: 3,
        loadVer: 'T',
      },
      update: {},
    })
    await prisma.regionZipBjd.upsert({
      where: { zipCode_bjdCode: { zipCode, bjdCode } },
      create: { zipCode, bjdCode, addressCount: 1 },
      update: {},
    })
  }
  if (!centerId) return
  const batch = await prisma.regionChangeBatch.create({
    data: { operatorId: TEST_OPERATOR_ID, changeType: 'GRID_ASSIGN', scopeDesc: '테스트' },
  })
  await prisma.regionCenterMap.upsert({
    where: {
      operatorId_zipCode_tempZone: { operatorId: TEST_OPERATOR_ID, zipCode, tempZone: 'ALL' },
    },
    create: { operatorId: TEST_OPERATOR_ID, zipCode, centerId, lastBatchId: batch.id },
    update: { centerId, lastBatchId: batch.id },
  })
}

beforeEach(async () => {
  await resetDatabase()
  icn = (await createTestCenter('ICN', { name: '이천센터' })).id
  gmh = (await createTestCenter('GMH', { name: '김해센터' })).id
  gana = (await createTestShipper('GANA')).id
  dara = (await createTestShipper('DARA')).id
  await prisma.shipper.update({
    where: { id: gana },
    data: { centers: { create: [{ centerId: icn }] } },
  })
  await prisma.shipper.update({
    where: { id: dara },
    data: { centers: { create: [{ centerId: icn }, { centerId: gmh }] } },
  })
  await createTestCodeGroup('CONTACT_ROLE', [{ code: 'INBOUND' }, { code: 'OUTBOUND' }])
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

// 엑셀 한 줄 (rowNo는 엑셀 줄 번호 — 제목 다음 2부터)
const rowsOf = (list: Record<string, string>[]): UploadRow[] =>
  list.map((values, index) => ({ rowNo: index + 2, values }))

const GANGNAM = { zipCd: '06236', addr1: '서울 강남구 테헤란로 152' }

describe('거래처 엑셀 업로드', () => {
  it('검증은 처리해 본 결과(신규·배송센터)만 보여 주고 저장하지 않는다. 등록하면 같은 결과로 저장', async () => {
    await assignZip('06236', icn)
    const rows = rowsOf([
      // 거래처 하나 + 납품처 둘 (거래처 칸은 반복)
      {
        shipperCode: 'GANA',
        partnerCd: 'P1',
        partnerNm: '행복마트',
        ...GANGNAM,
        shipToCd: 'S1',
        shipToNm: '1호',
        shipToDefault: 'Y',
        shipToZipCd: '06236',
        shipToAddr1: GANGNAM.addr1,
      },
      {
        shipperCode: 'GANA',
        partnerCd: 'P1',
        partnerNm: '행복마트',
        shipToCd: 'S2',
        shipToNm: '2호',
        shipToZipCd: '06236',
        shipToAddr1: GANGNAM.addr1,
        shipToStatus: '사용',
      },
      // 납품처 없이: 거래처 주소로 기본 납품처
      {
        shipperCode: 'gana',
        partnerCd: 'p2',
        partnerNm: '두번째',
        ...GANGNAM,
        telNo: '02-555-1234',
        status: '거래중지',
      },
    ])
    const preview = await validateCustomerUploadAction(rows)
    expect(preview).toMatchObject({
      ok: true,
      data: {
        errorCount: 0,
        summary: expect.stringContaining(
          '거래처 신규 2 · 수정 0 · 변경 없음 0 / 납품처 배송센터 지정 3',
        ),
      },
    })
    expect(await prisma.customer.count()).toBe(0)

    expect(await commitCustomerUploadAction(rows)).toMatchObject({
      ok: true,
      data: { message: expect.stringContaining('신규 2') },
    })
    const saved = await prisma.customer.findMany({
      orderBy: { code: 'asc' },
      include: { shipTos: { orderBy: { code: 'asc' } } },
    })
    expect(
      saved.map((c) => [
        c.code,
        c.status,
        c.source,
        c.shipTos.map((s) => [s.code, s.isDefault, s.deliveryCenterId]),
      ]),
    ).toEqual([
      [
        'P1',
        'ACTIVE',
        'UPLOAD',
        [
          ['S1', 'Y', icn],
          ['S2', 'N', icn],
        ],
      ],
      // 납품처가 없으면 기본 납품처: 거래처코드-01 (0084)
      ['P2', 'SUSPENDED', 'UPLOAD', [['P2-01', 'Y', icn]]],
    ])
  })

  it('이미 있는 거래처는 넣은 칸만 고치고, 같은 내용이면 변경 없음', async () => {
    await assignZip('06236', icn)
    await commitCustomerUploadAction(
      rowsOf([
        {
          shipperCode: 'GANA',
          partnerCd: 'P1',
          partnerNm: '행복마트',
          ceoNm: '홍대표',
          ...GANGNAM,
        },
      ]),
    )
    const second = await validateCustomerUploadAction(
      rowsOf([{ shipperCode: 'GANA', partnerCd: 'P1', telNo: '031-111-2222' }]),
    )
    expect(second).toMatchObject({ ok: true, data: { summary: expect.stringContaining('수정 1') } })
    await commitCustomerUploadAction(
      rowsOf([{ shipperCode: 'GANA', partnerCd: 'P1', telNo: '031-111-2222' }]),
    )
    expect(await prisma.customer.findFirstOrThrow({ where: { code: 'P1' } })).toMatchObject({
      name: '행복마트',
      ceoName: '홍대표',
      phone: '0311112222',
    })
    const same = await validateCustomerUploadAction(
      rowsOf([{ shipperCode: 'GANA', partnerCd: 'P1', telNo: '031-111-2222' }]),
    )
    expect(same).toMatchObject({
      ok: true,
      data: { summary: expect.stringContaining('변경 없음 1') },
    })
  })

  it('오류가 하나라도 있으면 줄마다 사유를 보여 주고, 등록은 아무것도 저장하지 않는다', async () => {
    const rows = rowsOf([
      { shipperCode: 'GANA', partnerCd: 'OK1', partnerNm: '정상', ...GANGNAM },
      { shipperCode: 'NOPE', partnerCd: 'X1', partnerNm: '없는 화주' },
      { shipperCode: 'GANA', partnerCd: 'NOADDR', partnerNm: '주소 없음' },
      {
        shipperCode: 'GANA',
        partnerCd: 'DIFF',
        partnerNm: '가',
        ...GANGNAM,
        shipToCd: 'S1',
        shipToNm: '1호',
        shipToDefault: 'X',
        ...{ shipToAddr1: GANGNAM.addr1 },
      },
      { shipperCode: 'GANA', partnerCd: 'DIFF', partnerNm: '나' },
    ])
    const preview = await validateCustomerUploadAction(rows)
    expect(preview.ok).toBe(true)
    const errorsOf = (rowNo: number) =>
      preview.ok ? (preview.data.rows.find((r) => r.rowNo === rowNo)?.errors ?? []) : []
    expect(errorsOf(2)).toEqual([])
    expect(errorsOf(3).join()).toContain('화주사')
    expect(errorsOf(4).join()).toContain('납품처가 없으면 거래처 주소가 필요')
    expect(errorsOf(5).join()).toContain('Y / N')
    expect(errorsOf(6).join()).toContain('값이 다릅니다')

    expect(await commitCustomerUploadAction(rows)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    expect(await prisma.customer.count()).toBe(0)
  })
})
