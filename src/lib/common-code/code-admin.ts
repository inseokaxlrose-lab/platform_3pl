import 'server-only'
import { assertAllFound, assertNoCodeConflict } from '@/lib/soft-delete'
import type { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { DELETED_ONLY, NOT_DELETED, withStatus } from '@/lib/status'
import { isYes, toYn } from '@/lib/yn'
import type {
  codeGroupCreateSchema,
  codeGroupUpdateSchema,
  codeItemCreateSchema,
  codeItemUpdateSchema,
} from './code-schema'
import { countCodeUsage } from './code-usage'

// 공통코드 저장·삭제 (docs/decisions/0030). 권한 검사는 서버 액션에서 한다
// - 그룹 코드·코드는 등록 후 바꿀 수 없다
// - 시스템 그룹은 지울 수 없다. 그룹은 코드가 하나도 없을 때만 지운다
// - 코드는 업무 표에서 쓰이지 않을 때만 지운다 (쓰인 코드는 사용 중지)

type GroupCreate = z.output<typeof codeGroupCreateSchema>
type GroupUpdate = z.output<typeof codeGroupUpdateSchema>
type ItemCreate = z.output<typeof codeItemCreateSchema>
type ItemUpdate = z.output<typeof codeItemUpdateSchema>

// 화면 입력(true/false·빈 글자) → DB 칸 (0087 귀책)
function groupData<T extends { usesFaultParty: boolean; isActive: boolean }>({
  usesFaultParty,
  ...data
}: T) {
  return { ...withStatus(data), faultPartyYn: toYn(usesFaultParty) }
}
// 그룹이 귀책을 쓰지 않으면 귀책을 비운다
function itemData<T extends { faultParty: string; isActive: boolean }>(
  { faultParty, ...data }: T,
  usesFaultParty: boolean,
) {
  return {
    ...withStatus(data),
    faultParty: usesFaultParty && faultParty ? faultParty : null,
  }
}

// 공통코드는 운영사마다 따로 (같은 그룹 코드를 운영사마다 쓸 수 있다, 0039)
export async function createCodeGroup(data: GroupCreate) {
  const operatorId = requireOperatorId()
  const exists = await prisma.codeGroup.findFirst({ where: { operatorId, code: data.code } })
  if (exists) throw new ActionError('CONFLICT', `이미 있는 그룹 코드입니다: ${data.code}`)
  return prisma.codeGroup.create({
    data: { ...groupData(data), operatorId },
    select: { id: true, code: true },
  })
}

// rowVersion: 팝업을 열 때의 버전 (그 사이 다른 사람이 저장했으면 충돌)
export async function updateCodeGroup({ id, rowVersion, ...data }: GroupUpdate) {
  const group = await prisma.codeGroup.findUnique({
    where: { id },
    select: { isSystem: true, rowVersion: true },
  })
  assertRowVersion(group, rowVersion, '코드 그룹을 찾을 수 없습니다.')
  // 시스템 그룹은 프로그램이 쓰므로 사용 중지할 수 없다
  if (isYes(group!.isSystem) && !data.isActive) {
    throw new ActionError('VALIDATION', '시스템 그룹은 사용 중지할 수 없습니다.')
  }
  return withVersionGuard(() =>
    prisma.codeGroup.update({
      where: { id, rowVersion },
      data: groupData(data),
      select: { id: true, rowVersion: true },
    }),
  )
}

export async function deleteCodeGroup(id: bigint) {
  const group = await prisma.codeGroup.findUnique({
    where: { id },
    select: {
      code: true,
      isSystem: true,
      _count: { select: { items: { where: NOT_DELETED } } },
    },
  })
  if (!group) throw new ActionError('NOT_FOUND', '코드 그룹을 찾을 수 없습니다.')
  if (isYes(group.isSystem)) {
    throw new ActionError('VALIDATION', `시스템 그룹은 지울 수 없습니다: ${group.code}`)
  }
  if (group._count.items > 0) {
    throw new ActionError(
      'VALIDATION',
      `코드가 ${group._count.items}개 있는 그룹은 지울 수 없습니다. 코드를 먼저 지우거나 사용 중지하세요.`,
    )
  }
  // 논리 삭제 (되살릴 수 있다)
  await prisma.codeGroup.update({ where: { id }, data: DELETED_ONLY })
}

export async function createCodeItem(data: ItemCreate) {
  // 그룹은 지금 운영사의 것만 찾는다 (prisma.ts 운영사 거르기) → 코드는 그룹의 운영사를 따른다
  const group = await prisma.codeGroup.findUnique({ where: { id: data.groupId } })
  if (!group) throw new ActionError('NOT_FOUND', '코드 그룹을 찾을 수 없습니다.')
  const exists = await prisma.codeItem.findUnique({
    where: { groupId_code: { groupId: data.groupId, code: data.code } },
  })
  if (exists) {
    throw new ActionError('CONFLICT', `이 그룹에 이미 있는 코드입니다: ${data.code}`)
  }
  return prisma.codeItem.create({
    data: { ...itemData(data, isYes(group.faultPartyYn)), operatorId: group.operatorId },
    select: { id: true, code: true },
  })
}

// rowVersion: 팝업을 열 때의 버전 (그 사이 다른 사람이 저장했으면 충돌)
export async function updateCodeItem({ id, rowVersion, ...data }: ItemUpdate) {
  const item = await prisma.codeItem.findUnique({
    where: { id },
    select: { rowVersion: true, group: { select: { faultPartyYn: true } } },
  })
  assertRowVersion(item, rowVersion, '코드를 찾을 수 없습니다.')
  return withVersionGuard(() =>
    prisma.codeItem.update({
      where: { id, rowVersion },
      data: itemData(data, isYes(item!.group.faultPartyYn)),
      select: { id: true, rowVersion: true },
    }),
  )
}

export async function deleteCodeItem(id: bigint) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.codeItem.findUnique({
      where: { id },
      select: { code: true, group: { select: { code: true } } },
    })
    if (!item) throw new ActionError('NOT_FOUND', '코드를 찾을 수 없습니다.')
    const used = await countCodeUsage(tx, item.group.code, item.code)
    if (used > 0) {
      throw new ActionError(
        'VALIDATION',
        `'${item.code}'는 ${used.toLocaleString()}건에서 쓰고 있어 지울 수 없습니다. 사용 중지하세요.`,
      )
    }
    // 논리 삭제 (되살릴 수 있다)
    await tx.codeItem.update({ where: { id }, data: DELETED_ONLY })
  })
}

// 되살리기: 지운 코드 그룹 (같은 그룹 코드가 이미 다시 생겼으면 거부)
export async function restoreCodeGroup(id: bigint) {
  const group = await prisma.codeGroup.findUnique({
    where: { id, ...DELETED_ONLY },
    select: { code: true },
  })
  assertAllFound(group ? 1 : 0, 1, '코드 그룹')
  const taken = await prisma.codeGroup.findMany({
    where: { code: group!.code },
    select: { code: true },
  })
  assertNoCodeConflict(
    taken.map((t) => t.code),
    '그룹 코드',
  )
  await prisma.codeGroup.update({ where: { id, ...DELETED_ONLY }, data: NOT_DELETED })
  return { id }
}

// 되살리기: 지운 코드 (그룹이 살아 있어야 하고, 같은 코드가 이미 다시 생겼으면 거부)
export async function restoreCodeItem(id: bigint) {
  const item = await prisma.codeItem.findUnique({
    where: { id, ...DELETED_ONLY },
    select: { groupId: true, code: true, group: { select: { delYn: true } } },
  })
  assertAllFound(item ? 1 : 0, 1, '코드')
  if (isYes(item!.group.delYn)) {
    throw new ActionError('CONFLICT', '지운 그룹의 코드입니다. 그룹을 먼저 되살려 주세요.')
  }
  const taken = await prisma.codeItem.findMany({
    where: { groupId: item!.groupId, code: item!.code },
    select: { code: true },
  })
  assertNoCodeConflict(
    taken.map((t) => t.code),
    '코드',
  )
  await prisma.codeItem.update({ where: { id, ...DELETED_ONLY }, data: NOT_DELETED })
  return { id }
}
