'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { requireOperatorId } from '@/lib/actor'
import { assertShipTosInScope, listShipTos } from '@/lib/customers/ship-to-list'
import { reassignShipTos, type ReassignMode } from '@/lib/customers/ship-to-region'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { idSchema } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'

// 납품처 목록 서버 액션 (docs/decisions/0082 ②) — 권한은 거래처와 같다 (master.customers)

const idsSchema = z.array(idSchema).min(1).max(500)

// 목록 (엑셀 전체는 엑셀 권한 필요)
export const listShipTosAction = createAction({
  permission: 'master.customers.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.customers.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    return listShipTos(input, scope)
  },
})

// 일괄 처리 공통: 범위 확인 → 한 트랜잭션에서 다시 정하기
async function run(ids: bigint[], mode: ReassignMode, scope: DataScope) {
  const unique = await assertShipTosInScope(ids, scope)
  return prisma.$transaction((tx) => reassignShipTos(tx, requireOperatorId(), unique, mode), {
    timeout: 60_000,
  })
}

// 배송센터 일괄 지정 → 수동(MANUAL). 그 화주의 이용 센터가 아닌 납품처는 건너뛴다
export const assignShipTosCenterAction = createAction({
  permission: 'master.customers.update',
  input: z.object({ ids: idsSchema, centerId: idSchema }),
  handler: async ({ input, scope }) =>
    run(input.ids, { kind: 'MANUAL', centerId: input.centerId }, scope),
})

// 권역 기준으로 재지정 → 자동(AUTO)으로 되돌림
export const reassignShipTosAutoAction = createAction({
  permission: 'master.customers.update',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) => run(input.ids, { kind: 'AUTO' }, scope),
})

// 재정제: 정제 캐시 없이 주소를 다시 찾고, 지정 구분은 지킨다 (자동은 다시 계산, 수동·연동은 불일치만)
export const renormalizeShipTosAction = createAction({
  permission: 'master.customers.update',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) => run(input.ids, { kind: 'RENORMALIZE' }, scope),
})
