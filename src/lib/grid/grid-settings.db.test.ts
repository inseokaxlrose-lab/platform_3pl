import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getCurrentPermissions, getCurrentUser } from '@/lib/session'
import { createTestCenter, createTestUser } from '@/test/factories'
import { resetDatabase } from '@/test/reset-database'
import { loadUserGridSettings } from './grid-settings'
import { resetGridSettingsAction, saveGridSettingsAction } from './grid-settings-actions'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(async () => new Set()),
  getCurrentScope: vi.fn(async () => ({ kind: 'ALL' })),
}))

let aliceId = ''
let bobId = ''

function signInAs(id: string) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id,
    name: '사용자',
    username: id,
    userType: 'OPERATOR',
  })
  // 메뉴 권한이 하나도 없어도 개인 설정은 저장할 수 있어야 한다
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set())
}

beforeEach(async () => {
  await resetDatabase()
  const center = await createTestCenter('ICN')
  aliceId = (await createTestUser('alice', { centerIds: [center.id] })).id
  bobId = (await createTestUser('bob', { centerIds: [center.id] })).id
  signInAs(aliceId)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('그리드 개인 설정', () => {
  it('저장하면 본인 설정으로 읽히고, 다시 저장하면 덮어쓴다', async () => {
    expect(
      await saveGridSettingsAction({
        gridId: 'system-users',
        settings: { hidden: ['email'], density: 'comfortable' },
      }),
    ).toEqual({ ok: true, data: { gridId: 'system-users' } })
    await saveGridSettingsAction({ gridId: 'system-users', settings: { pageSize: 50 } })

    expect(await loadUserGridSettings(aliceId)).toEqual({ 'system-users': { pageSize: 50 } })
  })

  it('다른 사용자의 설정에는 영향이 없다', async () => {
    await saveGridSettingsAction({ gridId: 'system-users', settings: { hidden: ['email'] } })
    signInAs(bobId)
    await saveGridSettingsAction({ gridId: 'system-users', settings: { density: 'comfortable' } })

    expect(await loadUserGridSettings(aliceId)).toEqual({ 'system-users': { hidden: ['email'] } })
    expect(await loadUserGridSettings(bobId)).toEqual({
      'system-users': { density: 'comfortable' },
    })
  })

  it('기본값 되돌리기는 본인의 그 그리드 설정만 지운다', async () => {
    await saveGridSettingsAction({ gridId: 'system-users', settings: { pageSize: 50 } })
    await saveGridSettingsAction({ gridId: 'system-roles', settings: { pageSize: 100 } })
    signInAs(bobId)
    await saveGridSettingsAction({ gridId: 'system-users', settings: { pageSize: 100 } })
    signInAs(aliceId)

    expect(await resetGridSettingsAction({ gridId: 'system-users' })).toMatchObject({ ok: true })

    expect(await loadUserGridSettings(aliceId)).toEqual({ 'system-roles': { pageSize: 100 } })
    expect(await loadUserGridSettings(bobId)).toEqual({ 'system-users': { pageSize: 100 } })
  })

  it('잘못된 그리드 이름·설정 모양은 거부하고, 로그인하지 않았으면 거부한다', async () => {
    expect(await saveGridSettingsAction({ gridId: '../x', settings: {} })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    })
    expect(await saveGridSettingsAction({ gridId: 'a', settings: { pageSize: 33 } })).toMatchObject(
      { ok: false, error: { code: 'VALIDATION' } },
    )

    vi.mocked(getCurrentUser).mockResolvedValue(null)
    expect(await saveGridSettingsAction({ gridId: 'a', settings: {} })).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    })
  })

  it('DB에 깨진 값이 있으면 그 그리드는 설정 없음으로 읽는다', async () => {
    await prisma.userGridSetting.create({
      data: { userId: aliceId, gridId: 'broken', settings: { density: 'huge' } },
    })
    expect(await loadUserGridSettings(aliceId)).toEqual({ broken: {} })
  })
})
