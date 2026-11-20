'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { idSchema } from '@/lib/id'
import { assertItemsInScope, listItems, SHIPPER_SCOPE } from '@/lib/items/item-list'
import { itemCreateSchema, itemSchema } from '@/lib/items/item-schema'
import { applyPalletToItems } from '@/lib/items/item-bulk'
import { ITEM_STATUS } from '@/lib/items/item-codes'
import { commitItemUpload, previewItemUpload } from '@/lib/items/item-upload'
import {
  createItem,
  deleteItems,
  restoreItems,
  setItemsActive,
  setItemsStatus,
  updateItem,
} from '@/lib/items/items'
import { uploadRowsSchema } from '@/lib/excel/upload'
import { prisma } from '@/lib/prisma'
import { rowVersionField } from '@/lib/row-version'
import { assertInScope } from '@/lib/scope/data-scope'

// 품목 서버 액션 (docs/decisions/0041)
// 데이터 범위: 운영사 관리자 = 운영사 전체, 센터 직원 = 소속 센터를 이용하는 화주사의 품목, 화주사 사용자 = 자기 화주사
// 화주사(운영사 전용)와 달리 범위 안이면 센터 직원도 품목을 대신 등록·수정할 수 있다 (ASN 대리 등록과 같은 이유)

// 목록 (엑셀 전체는 엑셀 권한 필요)
export const listItemsAction = createAction({
  permission: 'master.items.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.items.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    return listItems(input, scope)
  },
})

const idsSchema = z.array(idSchema).min(1).max(500)

// 등록: 고른 화주사가 범위 안이어야 한다
export const createItemAction = createAction({
  permission: 'master.items.create',
  input: itemCreateSchema,
  handler: async ({ input, scope }) => {
    const shipper = await prisma.shipper.findUnique({
      where: { id: input.shipperId },
      select: { id: true, operatorId: true, centers: { select: { centerId: true } } },
    })
    assertInScope(scope, shipper, SHIPPER_SCOPE)
    return createItem(input)
  },
})

// 수정 (rowVersion: 화면이 불러온 버전, 동시 수정 막기)
export const updateItemAction = createAction({
  permission: 'master.items.update',
  input: itemSchema.and(z.object({ id: idSchema, rowVersion: rowVersionField })),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    await assertItemsInScope([id], scope)
    return updateItem(id, rowVersion, data)
  },
})

// 사용 중지 / 다시 사용 (한 건·여러 건 공용)
export const setItemsActiveAction = createAction({
  permission: 'master.items.update',
  input: z.object({ ids: idsSchema, isActive: z.boolean() }),
  handler: async ({ input, scope }) =>
    setItemsActive(await assertItemsInScope(input.ids, scope), input.isActive),
})

// 지우기 (쓰인 적 없는 품목만, 되살릴 수 있다)
export const deleteItemsAction = createAction({
  permission: 'master.items.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) => deleteItems(await assertItemsInScope(input.ids, scope)),
})

// 되살리기 (지운 품목 중에서, 권한은 삭제와 같다)
export const restoreItemsAction = createAction({
  permission: 'master.items.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) =>
    restoreItems(await assertItemsInScope(input.ids, scope, true)),
})

// 상태 바꾸기 (여러 건): 사용·사용중지·단종 (0083 ②)
export const setItemsStatusAction = createAction({
  permission: 'master.items.update',
  input: z.object({ ids: idsSchema, status: z.enum(ITEM_STATUS.values) }),
  handler: async ({ input, scope }) =>
    setItemsStatus(await assertItemsInScope(input.ids, scope), input.status),
})

// 팔레트 적재 일괄 입력 (0083 ②): 계산할 수 없는 품목은 건너뛰고 결과에 알린다
export const applyPalletBulkAction = createAction({
  permission: 'master.items.update',
  input: z.object({
    ids: idsSchema,
    palletTypeCode: z.string().trim().max(20),
    palletTi: z.number().int().min(1).max(999).nullable(),
    palletHi: z.number().int().min(1).max(999).nullable(),
    palletBoxQty: z.number().int().min(1).max(99999).nullable(),
  }),
  handler: async ({ input: { ids, ...pallet }, scope }) =>
    applyPalletToItems(await assertItemsInScope(ids, scope), pallet),
})

// 엑셀 업로드 (0083 ②): 품목을 만들고 고치므로 등록·수정 권한 둘 다 필요
const assertUploadPermission = (permissions: ReadonlySet<string>) => {
  if (!permissions.has('master.items.update')) {
    throw new ActionError('FORBIDDEN', '품목 수정 권한이 없습니다.')
  }
}

export const validateItemUploadAction = createAction({
  permission: 'master.items.create',
  input: uploadRowsSchema,
  handler: async ({ input, scope, permissions }) => {
    assertUploadPermission(permissions)
    return previewItemUpload(input, scope)
  },
})

export const commitItemUploadAction = createAction({
  permission: 'master.items.create',
  input: uploadRowsSchema,
  handler: async ({ input, scope, permissions }) => {
    assertUploadPermission(permissions)
    return commitItemUpload(input, scope)
  },
})
