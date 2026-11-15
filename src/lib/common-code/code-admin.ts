import 'server-only'
import type { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { prisma } from '@/lib/prisma'
import { isYes } from '@/lib/yn'
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

export async function createCodeGroup(data: GroupCreate) {
  const exists = await prisma.codeGroup.findUnique({ where: { code: data.code } })
  if (exists) throw new ActionError('CONFLICT', `이미 있는 그룹 코드입니다: ${data.code}`)
  return prisma.codeGroup.create({ data, select: { id: true, code: true } })
}

export async function updateCodeGroup({ id, ...data }: GroupUpdate) {
  const group = await prisma.codeGroup.findUnique({ where: { id }, select: { isSystem: true } })
  if (!group) throw new ActionError('NOT_FOUND', '코드 그룹을 찾을 수 없습니다.')
  // 시스템 그룹은 프로그램이 쓰므로 사용 중지할 수 없다
  if (isYes(group.isSystem) && !data.isActive) {
    throw new ActionError('VALIDATION', '시스템 그룹은 사용 중지할 수 없습니다.')
  }
  return prisma.codeGroup.update({ where: { id }, data, select: { id: true } })
}

export async function deleteCodeGroup(id: bigint) {
  const group = await prisma.codeGroup.findUnique({
    where: { id },
    select: { code: true, isSystem: true, _count: { select: { items: true } } },
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
  await prisma.codeGroup.delete({ where: { id } })
}

export async function createCodeItem(data: ItemCreate) {
  const group = await prisma.codeGroup.findUnique({ where: { id: data.groupId } })
  if (!group) throw new ActionError('NOT_FOUND', '코드 그룹을 찾을 수 없습니다.')
  const exists = await prisma.codeItem.findUnique({
    where: { groupId_code: { groupId: data.groupId, code: data.code } },
  })
  if (exists) {
    throw new ActionError('CONFLICT', `이 그룹에 이미 있는 코드입니다: ${data.code}`)
  }
  return prisma.codeItem.create({ data, select: { id: true, code: true } })
}

export async function updateCodeItem({ id, ...data }: ItemUpdate) {
  const item = await prisma.codeItem.findUnique({ where: { id }, select: { id: true } })
  if (!item) throw new ActionError('NOT_FOUND', '코드를 찾을 수 없습니다.')
  return prisma.codeItem.update({ where: { id }, data, select: { id: true } })
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
    await tx.codeItem.delete({ where: { id } })
  })
}
