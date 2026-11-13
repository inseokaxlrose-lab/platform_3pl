import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCurrentPermissions, getCurrentUser } from '@/lib/session'
import { createUserAccount } from '@/lib/users/create-user-account'
import { createTestCenter, createTestShipper } from '@/test/factories'
import { resetDatabase } from '@/test/reset-database'
import {
  createUserAction,
  listUsersAction,
  resetUserPasswordAction,
  setUserActiveAction,
  updateUserAction,
} from './actions'
import { getUserForEdit } from './queries'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(async () => ({ kind: 'ALL' })),
}))

// 테스트 전용 비밀번호 (테스트 DB에서만 사용)
const PASSWORD = 'test-password-1234'
const NEW_PASSWORD = 'new-password-5678'
const USER_PERMISSIONS: PermissionCode[] = [
  'system.users.read',
  'system.users.create',
  'system.users.update',
]

let operatorId = ''
let centerId = ''
let shipperId = ''
let adminGroupId = ''
let portalGroupId = ''

function signInAs(userType: 'OPERATOR' | 'CENTER', id = operatorId) {
  vi.mocked(getCurrentUser).mockResolvedValue({ id, name: '관리자', username: 'boss', userType })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(USER_PERMISSIONS))
}

const newUser = (overrides: Record<string, unknown> = {}) => ({
  username: 'Kim.Worker',
  name: '김작업',
  userType: 'CENTER' as const,
  email: '',
  password: PASSWORD,
  passwordConfirm: PASSWORD,
  centerIds: [centerId],
  shipperId: '',
  permissionGroupIds: [adminGroupId],
  ...overrides,
})

beforeEach(async () => {
  await resetDatabase()
  centerId = (await createTestCenter('ICN')).id
  shipperId = (await createTestShipper('GANA')).id
  adminGroupId = (
    await prisma.permissionGroup.create({ data: { name: '센터 작업자', area: 'ADMIN' } })
  ).id
  portalGroupId = (
    await prisma.permissionGroup.create({ data: { name: '화주 담당', area: 'PORTAL' } })
  ).id
  operatorId = (
    await createUserAccount({
      username: 'boss',
      password: PASSWORD,
      name: '관리자',
      userType: 'OPERATOR',
    })
  ).id
  signInAs('OPERATOR')
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('사용자 등록', () => {
  it('센터 직원: 소속 센터·권한그룹과 함께 만들고, 바로 로그인된다', async () => {
    const result = await createUserAction(newUser())
    expect(result.ok).toBe(true)

    const saved = await getUserForEdit(result.ok ? result.data.id : '')
    expect(saved).toMatchObject({
      username: 'Kim.Worker',
      userType: 'CENTER',
      email: '', // 내부용 주소는 화면에 보이지 않는다
      centerIds: [centerId],
      permissionGroupIds: [adminGroupId],
    })
    expect(
      await auth.api.signInUsername({ body: { username: 'kim.worker', password: PASSWORD } }),
    ).toBeTruthy()
  })

  it('비밀번호 확인이 다르면 칸별 오류', async () => {
    expect(await createUserAction(newUser({ passwordConfirm: 'different-1234' }))).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION',
        fieldErrors: { passwordConfirm: ['비밀번호가 서로 다릅니다.'] },
      },
    })
  })

  it('아이디가 겹치면 (대소문자만 달라도) "이미 사용 중인 아이디입니다."', async () => {
    expect(await createUserAction(newUser({ username: 'BOSS' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: '이미 사용 중인 아이디입니다.' },
    })
  })

  it('유형별 소속 규칙과, 유형에 맞지 않는 영역의 권한그룹을 막는다', async () => {
    expect(await createUserAction(newUser({ centerIds: [] }))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: '센터 직원은 소속 센터를 1개 이상 선택해야 합니다.' },
    })
    expect(
      await createUserAction(
        newUser({
          userType: 'SHIPPER',
          centerIds: [],
          shipperId,
          permissionGroupIds: [adminGroupId],
        }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: '사용자 유형에 맞지 않는 권한그룹이 있습니다.' },
    })
    expect(
      (
        await createUserAction(
          newUser({
            username: 'gana.user',
            userType: 'SHIPPER',
            centerIds: [],
            shipperId,
            permissionGroupIds: [portalGroupId],
          }),
        )
      ).ok,
    ).toBe(true)
  })
})

describe('사용자 수정', () => {
  it('이름·이메일·소속·권한그룹을 바꾼다 (유형은 그대로)', async () => {
    const created = await createUserAction(newUser())
    const id = created.ok ? created.data.id : ''
    const second = await createTestCenter('PUS')

    const result = await updateUserAction({
      id,
      name: '김작업자',
      email: 'kim@example.com',
      centerIds: [second.id, centerId],
      shipperId: '',
      permissionGroupIds: [],
    })

    expect(result.ok).toBe(true)
    expect(await getUserForEdit(id)).toMatchObject({
      name: '김작업자',
      email: 'kim@example.com',
      userType: 'CENTER',
      permissionGroupIds: [],
    })
    expect((await getUserForEdit(id))?.centerIds.sort()).toEqual([centerId, second.id].sort())
  })
})

describe('사용 중지 · 비밀번호 초기화', () => {
  it('사용 중지하면 로그인이 즉시 끊기고, 다시 로그인할 수 없다', async () => {
    const created = await createUserAction(newUser())
    const id = created.ok ? created.data.id : ''
    await auth.api.signInUsername({ body: { username: 'kim.worker', password: PASSWORD } })
    expect(await prisma.session.count({ where: { userId: id } })).toBe(1)

    expect(await setUserActiveAction({ id, isActive: false })).toMatchObject({ ok: true })

    expect(await prisma.session.count({ where: { userId: id } })).toBe(0)
    await expect(
      auth.api.signInUsername({ body: { username: 'kim.worker', password: PASSWORD } }),
    ).rejects.toBeTruthy()
  })

  it('자기 자신은 사용 중지할 수 없다', async () => {
    expect(await setUserActiveAction({ id: operatorId, isActive: false })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', message: '자기 자신은 사용 중지할 수 없습니다.' },
    })
  })

  it('비밀번호를 초기화하면 새 비밀번호로만 로그인되고, 기존 로그인은 끊긴다', async () => {
    const created = await createUserAction(newUser())
    const id = created.ok ? created.data.id : ''
    await auth.api.signInUsername({ body: { username: 'kim.worker', password: PASSWORD } })

    expect(
      await resetUserPasswordAction({ id, password: NEW_PASSWORD, passwordConfirm: NEW_PASSWORD }),
    ).toMatchObject({ ok: true })

    expect(await prisma.session.count({ where: { userId: id } })).toBe(0)
    await expect(
      auth.api.signInUsername({ body: { username: 'kim.worker', password: PASSWORD } }),
    ).rejects.toBeTruthy()
    expect(
      await auth.api.signInUsername({ body: { username: 'kim.worker', password: NEW_PASSWORD } }),
    ).toBeTruthy()
  })
})

describe('목록 · 운영사 전용', () => {
  it('목록: 아이디·이름 검색, 소속·권한그룹 표시', async () => {
    await createUserAction(newUser())
    const result = await listUsersAction(createDataGridState({ search: 'kim' }))
    expect(result.ok && result.data.rows).toEqual([
      expect.objectContaining({
        username: 'Kim.Worker',
        affiliation: 'ICN 센터',
        groups: '센터 작업자',
      }),
    ])
  })

  it('운영사가 아니면 권한 코드가 있어도 서버에서 한 번 더 막는다', async () => {
    signInAs('CENTER', 'someone')
    expect(await listUsersAction(createDataGridState())).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN', message: '사용자 관리는 운영사 사용자만 할 수 있습니다.' },
    })
  })
})
