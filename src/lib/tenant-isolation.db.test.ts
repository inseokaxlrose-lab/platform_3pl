import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import { ALL_PERMISSION_CODES } from '@/config/permissions'
import { listCentersAction, updateCenterAction } from '@/app/admin/master/centers/actions'
import { getCenterForEdit } from '@/app/admin/master/centers/queries'
import {
  createUnitAction,
  deleteUnitsAction,
  listUnitsAction,
} from '@/app/admin/master/units/actions'
import {
  createCodeGroupAction,
  listCodeGroupsAction,
  updateCodeGroupAction,
} from '@/app/admin/system/codes/actions'
import {
  createPermissionGroupAction,
  deletePermissionGroupAction,
  listPermissionGroupsAction,
} from '@/app/admin/system/roles/actions'
import { getPermissionGroup } from '@/app/admin/system/roles/queries'
import {
  createUserAction,
  listUsersAction,
  setUserActiveAction,
} from '@/app/admin/system/users/actions'
import { getUserForEdit } from '@/app/admin/system/users/queries'
import { runInContext } from '@/lib/actor'
import { loadCodeOptions } from '@/lib/common-code/common-codes'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestCenter, createTestUser, versionOf } from '@/test/factories'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'

// 멀티테넌트 격리 (docs/decisions/0039): 운영사 A의 사람은 운영사 B의 데이터를 보지도, 고치지도 못한다
// - 화면 조회 함수: 데이터 범위(scopeFilter·isInScope·operatorFilter)가 운영사를 거른다
// - 서버 액션: 데이터 범위 + Prisma 안전망(운영사 출입증)이 두 겹으로 거른다

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const A = TEST_OPERATOR_ID // resetDatabase가 만든 운영사
let B = 0n

const scopeOf = (operatorId: bigint): DataScope => ({ kind: 'ALL', operatorId })

// 그 운영사의 관리자로 로그인한 것처럼 (모든 권한)
function signInAs(operatorId: bigint) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: `boss${operatorId}`,
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(ALL_PERMISSION_CODES))
  vi.mocked(getCurrentScope).mockResolvedValue(scopeOf(operatorId))
}

// 결과의 데이터 꺼내기 (실패면 테스트 실패)
function dataOf<T>(result: { ok: true; data: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

const unitInput = (code: string) => ({
  code,
  name: code,
  kind: 'BASE' as const,
  decimals: 0,
  sortOrder: 0,
  isActive: true,
  externalCodes: { SAP: '', ERP: '' },
})
const groupInput = (code: string) => ({
  code,
  name: code,
  description: '',
  sortOrder: 0,
  isActive: true,
})
const roleInput = (name: string) => ({ name, area: 'ADMIN' as const, permissionCodes: [] })

// 운영사 하나에 같은 이름·코드로 기준정보를 만든다 (액션으로 → 운영사가 자동으로 채워진다)
async function seedOperator(operatorId: bigint) {
  signInAs(operatorId)
  const center = await createTestCenter('ICN', { operatorId })
  const unit = dataOf(await createUnitAction(unitInput('KG')))
  const group = dataOf(await createCodeGroupAction(groupInput('DUTY')))
  const role = dataOf(await createPermissionGroupAction(roleInput('관리자')))
  const user = await createTestUser(`kim${operatorId}`, { userType: 'OPERATOR', operatorId })
  return { center, unit, group, role, user }
}

let a: Awaited<ReturnType<typeof seedOperator>>
let b: Awaited<ReturnType<typeof seedOperator>>

beforeEach(async () => {
  await resetDatabase()
  B = (await createTestOperator('B물류')).id
  a = await seedOperator(A)
  b = await seedOperator(B)
  signInAs(A)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('같은 코드를 운영사마다 쓸 수 있다', () => {
  it('센터·단위·공통코드 그룹·권한그룹 이름이 두 운영사에 각각 있다', async () => {
    expect(await prisma.center.count({ where: { code: 'ICN' } })).toBe(2)
    expect(await prisma.unit.count({ where: { code: 'KG' } })).toBe(2)
    expect(await prisma.codeGroup.count({ where: { code: 'DUTY' } })).toBe(2)
    expect(await prisma.permissionGroup.count({ where: { name: '관리자' } })).toBe(2)
    // 운영사가 자동으로 채워졌다
    expect(
      (await prisma.unit.findUniqueOrThrow({ where: { id: BigInt(b.unit.id) } })).operatorId,
    ).toBe(B)
  })

  it('같은 운영사 안에서는 여전히 겹칠 수 없다', async () => {
    expect(await createUnitAction(unitInput('KG'))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
  })
})

describe('목록: 내 운영사 것만 보인다', () => {
  it('센터·단위·공통코드·권한그룹·사용자', async () => {
    const state = createDataGridState()
    const ids = <T extends { id: string }>(result: { ok: boolean; data?: { rows: T[] } }) =>
      (result.ok ? result.data!.rows : []).map((row) => row.id)

    expect(ids(await listCentersAction(state))).toEqual([String(a.center.id)])
    expect(ids(await listUnitsAction(state))).toEqual([a.unit.id])
    expect(ids(await listCodeGroupsAction(state))).toEqual([a.group.id])
    expect(ids(await listPermissionGroupsAction(state))).toEqual([a.role.id])
    expect(ids(await listUsersAction(state))).toEqual([String(a.user.id)])
  })

  it('화면 틀의 공통코드 목록도 내 운영사 것만', async () => {
    await prisma.codeGroup.update({ where: { id: BigInt(b.group.id) }, data: { name: 'B 그룹' } })
    expect(Object.keys(await loadCodeOptions(A))).toEqual(['DUTY'])
    expect(await loadCodeOptions(undefined)).toEqual({})
  })
})

describe('다른 운영사의 것은 고치거나 지울 수 없다 ("찾을 수 없음")', () => {
  it('센터 수정', async () => {
    const result = await updateCenterAction({
      id: String(b.center.id),
      rowVersion: await versionOf('center', b.center.id),
      code: 'HACK',
      name: '바꿈',
      phone: '',
      fax: '',
      managerName: '',
      managerPhone: '',
      zipCode: '',
      address: '',
      addressDetail: '',
      externalCodes: { SAP: '', ERP: '' },
    })
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await prisma.center.findUniqueOrThrow({ where: { id: b.center.id } })).toMatchObject({
      code: 'ICN',
    })
  })

  it('단위 삭제·공통코드 그룹 수정·권한그룹 삭제·사용자 사용 중지', async () => {
    expect(await deleteUnitsAction({ ids: [b.unit.id] })).toMatchObject({ ok: false })
    expect(
      await updateCodeGroupAction({
        id: b.group.id,
        rowVersion: await versionOf('codeGroup', b.group.id),
        ...groupInput('DUTY'),
        name: '바꿈',
      }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await deletePermissionGroupAction({ id: b.role.id })).toMatchObject({ ok: false })
    expect(await setUserActiveAction({ id: String(b.user.id), isActive: false })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    })

    // B의 데이터는 그대로
    expect(await prisma.unit.count({ where: { operatorId: B } })).toBe(1)
    expect(
      (await prisma.codeGroup.findUniqueOrThrow({ where: { id: BigInt(b.group.id) } })).name,
    ).toBe('DUTY')
    expect(await prisma.permissionGroup.count({ where: { operatorId: B } })).toBe(1)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.user.id } })).status).toBe(
      'ACTIVE',
    )
  })

  it('화면 조회 함수(수정 화면): 다른 운영사의 키로 열면 없음', async () => {
    const mine = scopeOf(A)
    expect(await getCenterForEdit(b.center.id, mine)).toBeNull()
    expect(await getPermissionGroup(BigInt(b.role.id), mine)).toBeNull()
    expect(await getUserForEdit(b.user.id, mine)).toBeNull()
    // 내 것은 열린다
    expect(await getCenterForEdit(a.center.id, mine)).not.toBeNull()
  })
})

describe('로그인 아이디는 운영사와 상관없이 전체에서 하나', () => {
  it('다른 운영사에 있는 아이디로는 만들 수 없다', async () => {
    const result = await createUserAction({
      username: `kim${B}`,
      name: '김',
      userType: 'OPERATOR',
      email: '',
      password: 'pass-1234-abcd',
      passwordConfirm: 'pass-1234-abcd',
      centerIds: [],
      shipperId: '',
      permissionGroupIds: [a.role.id],
    })
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: '이미 사용 중인 아이디입니다.' },
    })
  })
})

describe('플랫폼 관리자가 운영사로 전환해 작업 (3b)', () => {
  it('그 운영사의 데이터로 만들어지고, 등록자는 플랫폼 관리자 아이디', async () => {
    // session.ts가 전환 중인 플랫폼 관리자에게 주는 값과 같게: 그 운영사 전체 범위 + 운영사 화면 권한
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 99n,
      name: '플랫폼',
      username: 'Platform',
      userType: 'PLATFORM',
    })
    vi.mocked(getCurrentScope).mockResolvedValue(scopeOf(B))
    const unit = dataOf(await createUnitAction(unitInput('BOX')))
    expect(await prisma.unit.findUniqueOrThrow({ where: { id: BigInt(unit.id) } })).toMatchObject({
      operatorId: B,
      createdBy: 'platform',
    })
  })
})

describe('Prisma 안전망 (운영사 출입증)', () => {
  const inA = <T>(fn: () => Promise<T>) => runInContext({ actor: 'test', operatorId: A }, fn)

  it('출입증 안에서는 다른 운영사의 줄을 키로 찾아도 없다', async () => {
    expect(await inA(() => prisma.center.findUnique({ where: { id: b.center.id } }))).toBeNull()
    expect(await inA(() => prisma.center.count())).toBe(1)
    // 조건에 다른 운영사를 적어도 지금 운영사로 덮어쓴다
    expect(await inA(() => prisma.center.count({ where: { operatorId: B } }))).toBe(1)
    // 고치기도 지금 운영사의 줄만
    const { count } = await inA(() =>
      prisma.center.updateMany({ where: { id: b.center.id }, data: { name: '바꿈' } }),
    )
    expect(count).toBe(0)
  })

  it('출입증 안에서 다른 운영사의 데이터를 만들려고 하면 오류 (개발 실수)', async () => {
    await expect(
      inA(() =>
        prisma.unit.create({
          data: { operatorId: B, code: 'X', name: 'X', kind: 'BASE' },
        }),
      ),
    ).rejects.toThrow('지금 운영사')
  })
})
