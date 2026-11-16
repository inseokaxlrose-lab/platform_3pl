import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { getExternalCodes } from '@/lib/master-code/external-codes'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter, createTestShipper } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { listExternalCodesAction, saveExternalCodesAction } from './actions'

// 외부코드 매핑 메뉴 (docs/decisions/0068)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }
const CODES: PermissionCode[] = ['master.external-codes.read', 'master.external-codes.update']

function signIn(scope: DataScope = ALL, codes = CODES) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

const list = (filters: Record<string, string> = {}) =>
  listExternalCodesAction({ ...createDataGridState(), filters })

beforeEach(async () => {
  await resetDatabase()
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('외부코드 매핑', () => {
  it('대상을 고르지 않으면 센터, 저장·비우기·매핑 거르기', async () => {
    const icn = await createTestCenter('ICN', { name: '이천' })
    await createTestCenter('YIN', { name: '용인' })

    expect(
      await saveExternalCodesAction({
        target: 'CENTER',
        id: String(icn.id),
        codes: { SAP: ' S-1 ', ERP: '' },
      }),
    ).toMatchObject({ ok: true })
    expect(await getExternalCodes('CENTER', icn.id)).toEqual({ SAP: 'S-1', ERP: '' })

    const all = await list()
    expect(
      all.ok && all.data.rows.map((r) => [r.code, r.externalCodes.SAP, r.mappedCount]),
    ).toEqual([
      ['ICN', 'S-1', 1],
      ['YIN', '', 0],
    ])
    const mapped = await list({ mapping: 'MAPPED' })
    expect(mapped.ok && mapped.data.rows.map((r) => r.code)).toEqual(['ICN'])
    const unmapped = await list({ mapping: 'UNMAPPED' })
    expect(unmapped.ok && unmapped.data.rows.map((r) => r.code)).toEqual(['YIN'])

    // 비우고 저장하면 매핑이 지워진다
    await saveExternalCodesAction({
      target: 'CENTER',
      id: String(icn.id),
      codes: { SAP: '', ERP: '' },
    })
    expect(await prisma.externalCode.count()).toBe(0)
  })

  it('대상 종류마다 따로: 화주사 목록, 같은 종류의 다른 대상이 쓰는 코드는 거부', async () => {
    await createTestCenter('ICN')
    const gana = await createTestShipper('GANA', { name: '가나식품' })
    const dara = await createTestShipper('DARA')

    await saveExternalCodesAction({
      target: 'SHIPPER',
      id: String(gana.id),
      codes: { SAP: 'C100', ERP: '' },
    })
    const shippers = await list({ target: 'SHIPPER' })
    expect(shippers.ok && shippers.data.rows.map((r) => r.code)).toEqual(['DARA', 'GANA'])

    expect(
      await saveExternalCodesAction({
        target: 'SHIPPER',
        id: String(dara.id),
        codes: { SAP: 'C100', ERP: '' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })
  })

  it('데이터 범위: 센터 직원은 소속 센터만 보고 고친다', async () => {
    const icn = await createTestCenter('ICN')
    const yin = await createTestCenter('YIN')
    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [icn.id] })

    const rows = await list()
    expect(rows.ok && rows.data.rows.map((r) => r.code)).toEqual(['ICN'])
    expect(
      await saveExternalCodesAction({
        target: 'CENTER',
        id: String(yin.id),
        codes: { SAP: 'X', ERP: '' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('고칠 권한이 없으면 저장 거부', async () => {
    const icn = await createTestCenter('ICN')
    signIn(ALL, ['master.external-codes.read'])
    expect(
      await saveExternalCodesAction({
        target: 'CENTER',
        id: String(icn.id),
        codes: { SAP: 'X', ERP: '' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })
})
