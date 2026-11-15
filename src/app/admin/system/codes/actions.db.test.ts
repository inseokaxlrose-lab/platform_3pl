import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { assertCodeValues, loadCodeOptions } from '@/lib/common-code/common-codes'
import { prisma } from '@/lib/prisma'
import { versionOf } from '@/test/factories'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { resetDatabase } from '@/test/reset-database'
import {
  createCodeGroupAction,
  createCodeItemAction,
  deleteCodeGroupAction,
  deleteCodeItemAction,
  listCodeGroupsAction,
  listCodeItemsAction,
  updateCodeGroupAction,
  updateCodeItemAction,
} from './actions'

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL_CODES: PermissionCode[] = [
  'system.codes.read',
  'system.codes.create',
  'system.codes.update',
  'system.codes.delete',
]

function signIn(codes = ALL_CODES) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: 'OPERATOR',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue({ kind: 'ALL' })
}

const group = (overrides: Record<string, unknown> = {}) => ({
  code: 'test_group',
  name: '테스트 그룹',
  description: '',
  sortOrder: 0,
  isActive: true,
  ...overrides,
})

async function createGroup(overrides: Record<string, unknown> = {}) {
  const result = await createCodeGroupAction(group(overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

async function createItem(groupId: bigint, code: string, overrides: Record<string, unknown> = {}) {
  const result = await createCodeItemAction({
    groupId: String(groupId),
    code,
    name: code,
    description: '',
    sortOrder: 0,
    isActive: true,
    ...overrides,
  })
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

beforeEach(async () => {
  await resetDatabase()
  signIn()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('공통코드 그룹', () => {
  it('그룹 코드는 대문자로 저장, 중복 거부, 형식 오류는 칸별 오류', async () => {
    const saved = await createGroup()
    expect(saved.code).toBe('TEST_GROUP')
    expect(await createCodeGroupAction(group({ code: 'TEST_GROUP' }))).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    })
    expect(await createCodeGroupAction(group({ code: '1그룹', name: '' }))).toMatchObject({
      ok: false,
      error: { fieldErrors: { code: [expect.any(String)], name: [expect.any(String)] } },
    })
  })

  it('목록은 정렬 순서대로, 코드 수를 함께 준다', async () => {
    const b = await createGroup({ code: 'B_GROUP', sortOrder: 2 })
    await createGroup({ code: 'A_GROUP', sortOrder: 9 })
    await createItem(BigInt(b.id), 'X')
    const result = await listCodeGroupsAction(createDataGridState())
    expect(result.ok && result.data.rows.map((r) => [r.code, r.itemCount])).toEqual([
      ['B_GROUP', 1],
      ['A_GROUP', 0],
    ])
  })

  it('코드가 있는 그룹·시스템 그룹은 지울 수 없고, 시스템 그룹은 사용 중지도 안 된다', async () => {
    const withItem = await createGroup({ code: 'HAS_ITEM' })
    await createItem(BigInt(withItem.id), 'X')
    expect(await deleteCodeGroupAction({ id: withItem.id })).toMatchObject({
      ok: false,
      error: { message: expect.stringContaining('코드가 1개') },
    })

    const system = await prisma.codeGroup.create({
      data: { code: 'SYS', name: '시스템', isSystem: 'Y' },
    })
    expect(await deleteCodeGroupAction({ id: String(system.id) })).toMatchObject({ ok: false })
    expect(
      await updateCodeGroupAction({
        id: String(system.id),
        rowVersion: await versionOf('codeGroup', String(system.id)),
        ...group({ isActive: false }),
      }),
    ).toMatchObject({ ok: false, error: { message: expect.stringContaining('사용 중지') } })

    const empty = await createGroup({ code: 'EMPTY' })
    expect(await deleteCodeGroupAction({ id: empty.id })).toMatchObject({ ok: true })
  })

  it('수정은 이름·설명·순서·사용 여부만 (그룹 코드는 그대로)', async () => {
    const saved = await createGroup()
    await updateCodeGroupAction({
      id: saved.id,
      rowVersion: await versionOf('codeGroup', saved.id),
      ...group({ code: 'CHANGED', name: '바뀐 이름', sortOrder: 5 }),
    })
    expect(
      await prisma.codeGroup.findUniqueOrThrow({ where: { id: BigInt(saved.id) } }),
    ).toMatchObject({
      code: 'TEST_GROUP',
      name: '바뀐 이름',
      sortOrder: 5,
    })
  })
})

describe('공통코드 코드', () => {
  it('같은 그룹 안에서만 중복 거부, 목록은 고른 그룹의 코드만', async () => {
    const a = await createGroup({ code: 'A' + 'A' })
    const b = await createGroup({ code: 'BB' })
    await createItem(BigInt(a.id), 'in')
    await createItem(BigInt(b.id), 'IN')
    expect(
      await createCodeItemAction({
        groupId: a.id,
        code: 'IN',
        name: '중복',
        description: '',
        sortOrder: 0,
        isActive: true,
      }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } })

    const result = await listCodeItemsAction({ ...createDataGridState(), groupId: a.id })
    expect(result.ok && result.data.rows.map((r) => r.code)).toEqual(['IN'])
  })

  it('수정·삭제', async () => {
    const g = await createGroup()
    const item = await createItem(BigInt(g.id), 'X')
    await updateCodeItemAction({
      id: item.id,
      rowVersion: await versionOf('codeItem', item.id),
      name: '엑스',
      description: '',
      sortOrder: 3,
      isActive: false,
    })
    expect(
      await prisma.codeItem.findUniqueOrThrow({ where: { id: BigInt(item.id) } }),
    ).toMatchObject({
      code: 'X',
      name: '엑스',
      // 사용 여부는 DB에 상태로
      status: 'INACTIVE',
    })
    expect(await deleteCodeItemAction({ id: item.id })).toMatchObject({ ok: true })
  })

  it('삭제 권한이 없으면 거부', async () => {
    const g = await createGroup()
    const item = await createItem(BigInt(g.id), 'X')
    signIn(['system.codes.read'])
    expect(await deleteCodeItemAction({ id: item.id })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})

describe('공통코드 읽기·검사', () => {
  it('화면용 목록: 사용 중인 그룹만, 코드는 정렬 순서대로 (사용 중지 코드는 표시용으로 포함)', async () => {
    const g = await createGroup({ code: 'DUTY' })
    await createItem(BigInt(g.id), 'B', { sortOrder: 2 })
    await createItem(BigInt(g.id), 'A', { sortOrder: 1, isActive: false })
    await createGroup({ code: 'OFF', isActive: false })
    expect(await loadCodeOptions()).toEqual({
      DUTY: [
        { code: 'A', name: 'A', isActive: false },
        { code: 'B', name: 'B', isActive: true },
      ],
    })
  })

  it('저장 전 검사: 없는 코드·사용 중지 코드는 거부, 이미 저장돼 있던 값(keep)은 허용', async () => {
    const g = await createGroup({ code: 'DUTY' })
    await createItem(BigInt(g.id), 'ON')
    await createItem(BigInt(g.id), 'OFF', { isActive: false })

    await expect(
      assertCodeValues(prisma, 'DUTY', ['ON'], { label: '담당 업무' }),
    ).resolves.toBeUndefined()
    await expect(
      assertCodeValues(prisma, 'DUTY', ['ON', 'OFF', 'NOPE'], { label: '담당 업무' }),
    ).rejects.toThrow('OFF, NOPE')
    await expect(
      assertCodeValues(prisma, 'DUTY', ['OFF'], { label: '담당 업무', keep: ['OFF'] }),
    ).resolves.toBeUndefined()
  })
})
