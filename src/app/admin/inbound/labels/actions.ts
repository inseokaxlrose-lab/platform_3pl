'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { idSchema } from '@/lib/id'
import { listAsns } from '@/lib/inbound/asn-list'
import { assertAsnsInScope } from '@/lib/inbound/asns'
import { labelViews } from '@/lib/labels/label-queries'
import { ensureLabels, markLabelsPrinted } from '@/lib/labels/labels'
import { prisma } from '@/lib/prisma'

// 라벨 인쇄 서버 액션 (docs/decisions/0056) — 권한 inbound.labels.read·print, 데이터 범위는 ASN 범위

// 라벨을 뽑을 ASN 고르기: 상태를 고르지 않으면 검수가 있는 것 (검수중·부분확정·확정완료)
export const listLabelAsnsAction = createAction({
  permission: 'inbound.labels.read',
  input: listQuerySchema,
  handler: async ({ input, scope }) =>
    listAsns(
      {
        ...input,
        exportAll: false,
        filters: { status: 'INSPECTING,PARTIAL,COMPLETED', ...input.filters },
      },
      scope,
    ),
})

const idsSchema = z.array(idSchema).min(1).max(200)

// 고른 검수 기록이 모두 범위 안의 ASN 것인지
async function assertInspectionsInScope(
  ids: bigint[],
  scope: Parameters<typeof assertAsnsInScope>[1],
) {
  const rows = await prisma.inboundInspection.findMany({
    where: { id: { in: ids } },
    select: { asnId: true },
  })
  if (rows.length !== new Set(ids).size) {
    throw new ActionError('NOT_FOUND', '찾을 수 없는 검수 기록이 섞여 있습니다.')
  }
  await assertAsnsInScope([...new Set(rows.map((r) => r.asnId))], scope)
}

// 인쇄 준비: 라벨이 없으면 만들고(번호 고정), 인쇄할 라벨 모양을 돌려준다
export const prepareLabelsAction = createAction({
  permission: 'inbound.labels.print',
  input: z.object({ inspectionIds: idsSchema }),
  handler: async ({ input, scope }) => {
    await assertInspectionsInScope(input.inspectionIds, scope)
    for (const id of input.inspectionIds) await ensureLabels(id)
    return labelViews(input.inspectionIds)
  },
})

// 인쇄했다고 기록 (인쇄 창을 연 뒤) — 다시 인쇄하면 재발행으로 횟수가 는다
export const markLabelsPrintedAction = createAction({
  permission: 'inbound.labels.print',
  input: z.object({ labelIds: z.array(idSchema).min(1).max(1000) }),
  handler: async ({ input, scope }) => {
    const labels = await prisma.inboundLabel.findMany({
      where: { id: { in: input.labelIds } },
      select: { inspectionId: true },
    })
    if (labels.length !== new Set(input.labelIds).size) {
      throw new ActionError('NOT_FOUND', '찾을 수 없는 라벨이 섞여 있습니다.')
    }
    await assertInspectionsInScope([...new Set(labels.map((l) => l.inspectionId))], scope)
    return markLabelsPrinted(input.labelIds)
  },
})
