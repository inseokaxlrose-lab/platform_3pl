'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { idSchema } from '@/lib/id'
import { assertItemsInScope, listItems } from '@/lib/items/item-list'
import { itemSchema } from '@/lib/items/item-schema'
import {
  createItem,
  deleteItems,
  restoreItems,
  setItemsActive,
  updateItem,
} from '@/lib/items/items'
import { rowVersionField } from '@/lib/row-version'
import type { DataScope } from '@/lib/scope/data-scope'

// 화주 포털 · 품목 서버 액션 (docs/decisions/0041)
// - 권한은 포털 코드(portal.items.*)로 따로 검사한다 (운영사 화면 권한과 섞이지 않게)
// - 화주사 사용자만: 데이터 범위가 자기 화주사. 등록할 때 화주사는 범위의 화주사로 정한다 (화면 값은 쓰지 않는다)
// - 외부 코드는 운영사 내부 연동용이라 받지 않는다 → 운영사가 넣은 값은 그대로 (사용자 결정)

// 화주사 사용자의 화주사 키 (아니면 거부)
function shipperOf(scope: DataScope): bigint {
  if (scope.kind !== 'SHIPPER') {
    throw new ActionError('FORBIDDEN', '화주사 사용자만 쓸 수 있습니다.')
  }
  return scope.shipperId
}

// 포털 입력 규칙: 외부 코드 칸 없음 (보내도 버려진다)
const portalItemSchema = itemSchema.omit({ externalCodes: true })
const idsSchema = z.array(idSchema).min(1).max(500)

export const listPortalItemsAction = createAction({
  permission: 'portal.items.read',
  input: listQuerySchema,
  handler: async ({ input, scope }) => {
    shipperOf(scope)
    // 포털에는 엑셀 권한이 없다
    if (input.exportAll) throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    return listItems(input, scope)
  },
})

export const createPortalItemAction = createAction({
  permission: 'portal.items.create',
  input: portalItemSchema,
  handler: async ({ input, scope }) => createItem({ ...input, shipperId: shipperOf(scope) }),
})

// 수정 (rowVersion: 화면이 불러온 버전, 동시 수정 막기)
export const updatePortalItemAction = createAction({
  permission: 'portal.items.update',
  input: portalItemSchema.extend({ id: idSchema, rowVersion: rowVersionField }),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    shipperOf(scope)
    await assertItemsInScope([id], scope)
    return updateItem(id, rowVersion, data)
  },
})

export const setPortalItemsActiveAction = createAction({
  permission: 'portal.items.update',
  input: z.object({ ids: idsSchema, isActive: z.boolean() }),
  handler: async ({ input, scope }) => {
    shipperOf(scope)
    return setItemsActive(await assertItemsInScope(input.ids, scope), input.isActive)
  },
})

export const deletePortalItemsAction = createAction({
  permission: 'portal.items.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) => {
    shipperOf(scope)
    return deleteItems(await assertItemsInScope(input.ids, scope))
  },
})

export const restorePortalItemsAction = createAction({
  permission: 'portal.items.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) => {
    shipperOf(scope)
    return restoreItems(await assertItemsInScope(input.ids, scope, true))
  },
})
