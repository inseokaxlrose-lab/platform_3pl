import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PermissionCode } from '@/config/permissions'
import { prisma } from '@/lib/prisma'
import { loadRegionMaster } from '@/lib/regions/region-load'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  applyRegionAssignAction,
  commitRegionUploadAction,
  getAssignableCentersAction,
  getRegionDashboardAction,
  getRegionTreeAction,
  getRegionZipsAction,
  listRegionBatchesAction,
  previewRegionAssignAction,
  simulateRegionAction,
  validateRegionUploadAction,
} from './actions'

// 권역설정 서버 액션 (0076) — 샘플 지역 마스터
//   권선구(41113): 16613 권선동(41113129) / 16620 호매실동(41113136) / 16625 금곡동(41113137)+호매실동 = 경계

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: PermissionCode[] = [
  'master.regions.read',
  'master.regions.update',
  'master.regions.export',
]

function signIn(codes = ALL) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })
}

let suwon = ''
let icheon = ''
const HOMAESIL = { level: 'EMD' as const, code: '41113136' }

const ok = <T>(result: { ok: true; data: T } | { ok: false; error: { message: string } }) => {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

beforeEach(async () => {
  await resetDatabase()
  await loadRegionMaster(prisma, {
    loadVer: '202611',
    bjdFile: 'src/test/fixtures/region/bjd-sample.csv',
    addressFiles: ['src/test/fixtures/region/address-sample.txt'],
  })
  suwon = String((await createTestCenter('SUW', { name: '수원센터' })).id)
  icheon = String((await createTestCenter('ICN', { name: '이천센터' })).id)
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('요약 · 센터', () => {
  it('요약: 전체·배정·미배정·센터별 수, 배정할 수 있는 센터 목록', async () => {
    ok(
      await applyRegionAssignAction({
        target: { kind: 'zips', source: 'GRID', zips: ['16613'] },
        tempZone: 'ALL',
        centerId: suwon,
      }),
    )
    expect(ok(await getRegionDashboardAction({}))).toMatchObject({
      totalZips: 6,
      assigned: 1,
      unassigned: 5,
      unconfirmed: 0,
      centers: [{ name: '수원센터', count: 1 }],
      lastLoad: { loadVer: '202611' },
    })
    // 정렬순서 → 코드 순 (ICN < SUW)
    expect(ok(await getAssignableCentersAction({})).map((c) => c.name)).toEqual([
      '이천센터',
      '수원센터',
    ])
  })
})

describe('지역 지정', () => {
  it('읍면동 지정: 경계 우편번호는 기본 제외, 포함을 고르면 같이 — 미리보기와 저장 결과가 같다', async () => {
    const target = { kind: 'node' as const, node: HOMAESIL, includeBoundary: false }
    const preview = ok(
      await previewRegionAssignAction({ target, tempZone: 'ALL', centerId: suwon }),
    )
    expect(preview).toMatchObject({
      changeCount: 1,
      boundary: { count: 1, included: false },
      summary: [{ from: null, to: '수원센터', count: 1 }],
      scopeDesc: '경기도 수원시 권선구 호매실동 (경계 1건 제외) → 수원센터',
    })

    expect(
      ok(
        await applyRegionAssignAction({
          target,
          tempZone: 'ALL',
          centerId: suwon,
          reason: '테스트',
        }),
      ),
    ).toMatchObject({ changeCount: 1 })
    const withBoundary = { ...target, includeBoundary: true }
    ok(await applyRegionAssignAction({ target: withBoundary, tempZone: 'ALL', centerId: icheon }))

    const zips = ok(await getRegionZipsAction({ node: HOMAESIL, tempZone: 'ALL' }))
    expect(zips.map((z) => [z.zipCode, z.centerName, z.emdCount])).toEqual([
      ['16620', '이천센터', 1],
      ['16625', '이천센터', 2],
    ])
    const batches = ok(await listRegionBatchesAction({}))
    expect(batches.map((b) => [b.changeType, b.changedCount])).toEqual([
      ['TREE_ASSIGN', 2],
      ['TREE_ASSIGN', 1],
    ])
    expect(batches[1]).toMatchObject({ reason: '테스트', createdBy: 'boss' })
  })

  it('트리 노드마다 센터별 수·미배정 수', async () => {
    ok(
      await applyRegionAssignAction({
        target: { kind: 'zips', source: 'GRID', zips: ['16613', '16620'] },
        tempZone: 'ALL',
        centerId: suwon,
      }),
    )
    const sigungus = ok(
      await getRegionTreeAction({ parent: { level: 'SIDO', code: '41' }, tempZone: 'ALL' }),
    )
    expect(sigungus.find((n) => n.code === '41113')).toMatchObject({
      name: '수원시 권선구',
      zipCount: 3,
      unassigned: 1,
      centers: [{ name: '수원센터', count: 2 }],
    })
  })

  it('조회 권한만 있으면 지정할 수 없다', async () => {
    signIn(['master.regions.read'])
    expect(
      await applyRegionAssignAction({
        target: { kind: 'zips', source: 'GRID', zips: ['16613'] },
        tempZone: 'ALL',
        centerId: suwon,
      }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })
})

describe('엑셀 업로드', () => {
  const row = (rowNo: number, zipCode: string, centerCode: string, tempZone = '') => ({
    rowNo,
    values: { zipCode, tempZone, centerCode },
  })

  it('검증: 없는 우편번호·센터코드, 겹치는 행, 취급하지 않는 온도대를 행마다 알려 주고 요약을 붙인다', async () => {
    const preview = ok(
      await validateRegionUploadAction([
        row(2, '16613', 'SUW'),
        row(3, '99999', 'SUW'),
        row(4, '16620', 'NOPE'),
        row(5, '16613', 'ICN'),
        row(6, '16620', 'SUW', '냉동'),
      ]),
    )
    expect(preview.errorCount).toBe(4)
    expect(preview.rows.map((r) => r.errors.join(' '))).toEqual([
      '',
      expect.stringContaining('없는 우편번호'),
      expect.stringContaining('없는 센터코드'),
      expect.stringContaining('2행과'),
      expect.stringContaining('온도대를 취급하지'),
    ])
    expect(preview.summary).toContain('미배정 → 수원센터 1건')
  })

  it('반영: 오류가 없으면 센터·온도대별로 작업 단위를 만들고, 센터코드를 비우면 해제', async () => {
    expect(
      ok(await commitRegionUploadAction([row(2, '16613', 'SUW'), row(3, '16620', 'icn')])),
    ).toEqual({ message: '배정 2건을 반영했습니다.' })
    ok(await commitRegionUploadAction([row(2, '16613', '')]))
    const maps = await prisma.regionCenterMap.findMany({
      select: { zipCode: true, assignType: true },
    })
    expect(maps).toEqual([{ zipCode: '16620', assignType: 'UPLOAD' }])
    expect(await commitRegionUploadAction([row(2, '99999', 'SUW')])).toMatchObject({ ok: false })
  })
})

describe('시뮬레이터', () => {
  it('주소 → 정제 등급 → 결정된 센터 (API 키 없이 글자 해석)', async () => {
    ok(
      await applyRegionAssignAction({
        target: { kind: 'node', node: HOMAESIL, includeBoundary: true },
        tempZone: 'ALL',
        centerId: suwon,
      }),
    )
    const { norm, resolution } = ok(
      await simulateRegionAction({ address: '경기도 수원시 권선구 호매실동 999', tempZone: 'ALL' }),
    )
    expect(norm).toMatchObject({ grade: 'C', bjdCode: '4111313600' })
    expect(resolution).toMatchObject({
      centerName: '수원센터',
      resolveLevel: 'BJD',
      needConfirm: false,
    })
  })
})
