import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { getExternalCodes, saveExternalCodes } from '@/lib/master-code/external-codes'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestShipper, versionOf, systemUnit } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  createPortalItemAction,
  deletePortalItemsAction,
  listPortalItemsAction,
  updatePortalItemAction,
} from './actions'

// 화주 포털 · 품목 (docs/decisions/0041)

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const PORTAL_CODES: PermissionCode[] = [
  'portal.items.read',
  'portal.items.create',
  'portal.items.update',
  'portal.items.delete',
]

function signIn(scope: DataScope, codes: PermissionCode[] = PORTAL_CODES) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '화주 담당',
    username: 'gana.user',
    userType: scope.kind === 'SHIPPER' ? 'SHIPPER' : 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

let gana = 0n
let dara = 0n
let ea = 0n
const shipperScope = (shipperId: bigint): DataScope => ({
  kind: 'SHIPPER',
  operatorId: TEST_OPERATOR_ID,
  shipperId,
})

const input = (overrides: Record<string, unknown> = {}) => ({
  code: '',
  name: '김치 1kg',
  spec: '',
  barcode: '',
  baseUnitId: String(ea),
  useLot: 'Y' as const,
  useExpiry: '' as const,
  labelUnit: '' as const,
  expiryAlertDays: '',
  remark: '',
  units: [],
  ...overrides,
})

beforeEach(async () => {
  await resetDatabase()
  ea = (await systemUnit('EA')).id
  gana = (await createTestShipper('GANA')).id
  dara = (await createTestShipper('DARA')).id
  signIn(shipperScope(gana))
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('화주 포털 품목', () => {
  it('등록하면 화면이 보낸 화주사와 상관없이 자기 화주사 품목이 되고, 관리 옵션도 정할 수 있다', async () => {
    const result = await createPortalItemAction({ ...input(), shipperId: String(dara) } as never)
    expect(result.ok).toBe(true)
    const saved = await prisma.item.findUniqueOrThrow({
      where: { id: BigInt(result.ok ? result.data.id : 0) },
    })
    expect(saved).toMatchObject({ shipperId: gana, useLot: 'Y', createdBy: 'gana.user' })
  })

  it('자기 화주사 품목만 보이고, 다른 화주사 품목은 고치거나 지울 수 없다', async () => {
    await createPortalItemAction(input({ code: 'MINE' }))
    signIn(shipperScope(dara))
    const other = await createPortalItemAction(input({ code: 'OTHER' }))
    const otherId = other.ok ? other.data.id : ''
    signIn(shipperScope(gana))

    const list = await listPortalItemsAction(createDataGridState())
    expect(list.ok && list.data.rows.map((r) => r.code)).toEqual(['MINE'])
    expect(
      await updatePortalItemAction({
        ...input(),
        id: otherId,
        rowVersion: await versionOf('item', otherId),
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await deletePortalItemsAction({ ids: [otherId] })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })
  })

  it('외부 코드는 받지 않고, 운영사가 넣은 외부 코드는 포털에서 저장해도 그대로 남는다', async () => {
    const created = await createPortalItemAction(input({ code: 'MINE' }))
    const id = created.ok ? created.data.id : ''
    await runInContext({ actor: 'boss', operatorId: TEST_OPERATOR_ID }, () =>
      saveExternalCodes(prisma, 'ITEM', BigInt(id), { SAP: 'M-1', ERP: '' }),
    )
    expect(
      await updatePortalItemAction({
        ...input({ code: 'MINE', name: '김치 2kg' }),
        // 보내도 버려진다
        externalCodes: { SAP: '', ERP: 'HACK' },
        id,
        rowVersion: await versionOf('item', id),
      } as never),
    ).toMatchObject({ ok: true })
    expect(await getExternalCodes('ITEM', BigInt(id))).toEqual({ SAP: 'M-1', ERP: '' })
  })

  it('화주사 사용자가 아니거나 포털 권한이 없으면 거부, 포털에는 엑셀이 없다', async () => {
    signIn({ kind: 'ALL', operatorId: TEST_OPERATOR_ID })
    expect(await listPortalItemsAction(createDataGridState())).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    signIn(shipperScope(gana), ['portal.items.read'])
    expect(await createPortalItemAction(input())).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    expect(
      await listPortalItemsAction({ ...createDataGridState(), exportAll: true }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })
})
