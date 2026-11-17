'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { assertCustomersInScope, listCustomers, SHIPPER_SCOPE } from '@/lib/customers/customer-list'
import { customerCreateSchema, customerSchema } from '@/lib/customers/customer-schema'
import {
  createCustomer,
  deleteCustomers,
  restoreCustomers,
  setCustomersStatus,
  updateCustomer,
} from '@/lib/customers/customers'
import { commitCustomerUpload, previewCustomerUpload } from '@/lib/customers/customer-upload'
import { uploadRowsSchema } from '@/lib/excel/upload'
import { getDefaultCenter } from '@/lib/regions/center-resolve'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { idSchema } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { rowVersionField } from '@/lib/row-version'
import { assertInScope } from '@/lib/scope/data-scope'

// 거래처 서버 액션 (docs/decisions/0043)
// 품목과 같은 범위: 범위 안이면 센터 직원도 대신 등록·수정할 수 있다

const idsSchema = z.array(idSchema).min(1).max(500)

// 목록 (엑셀 전체는 엑셀 권한 필요)
export const listCustomersAction = createAction({
  permission: 'master.customers.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('master.customers.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    return listCustomers(input, scope)
  },
})

// 등록: 고른 화주사가 범위 안이어야 한다
export const createCustomerAction = createAction({
  permission: 'master.customers.create',
  input: customerCreateSchema,
  handler: async ({ input, scope }) => {
    const shipper = await prisma.shipper.findUnique({
      where: { id: input.shipperId },
      select: { id: true, operatorId: true, centers: { select: { centerId: true } } },
    })
    assertInScope(scope, shipper, SHIPPER_SCOPE)
    return createCustomer(input)
  },
})

// 수정 (rowVersion: 화면이 불러온 버전, 동시 수정 막기)
export const updateCustomerAction = createAction({
  permission: 'master.customers.update',
  input: customerSchema.and(z.object({ id: idSchema, rowVersion: rowVersionField })),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    await assertCustomersInScope([id], scope)
    return updateCustomer(id, rowVersion, data)
  },
})

// 거래중 / 거래중지 (여러 건)
export const setCustomersStatusAction = createAction({
  permission: 'master.customers.update',
  input: z.object({ ids: idsSchema, status: z.enum(['ACTIVE', 'SUSPENDED']) }),
  handler: async ({ input, scope }) =>
    setCustomersStatus(await assertCustomersInScope(input.ids, scope), input.status),
})

// 납품처 드로어: 고른 주소의 지역 기본 배송센터 (배송센터를 직접 고를 때 미리 고를 값·다르면 경고)
export const previewShipToCenterAction = createAction({
  permission: 'master.customers.read',
  input: z.object({
    shipperId: idSchema,
    zipCode: z.string().trim().max(10),
    regionCode: z.string().trim().max(10),
  }),
  handler: async ({ input, scope }) => {
    const shipper = await prisma.shipper.findUnique({
      where: { id: input.shipperId },
      select: { id: true, operatorId: true, centers: { select: { centerId: true } } },
    })
    assertInScope(scope, shipper, SHIPPER_SCOPE)
    const zip = input.zipCode.replace(/\D/g, '')
    const center = await getDefaultCenter(prisma, shipper!.operatorId, {
      zipCode: zip.length === 5 ? zip : undefined,
      bjdCode: /^\d{10}$/.test(input.regionCode) ? input.regionCode : undefined,
    })
    return center ? { centerId: String(center.centerId), centerName: center.centerName } : null
  },
})

export const deleteCustomersAction = createAction({
  permission: 'master.customers.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) =>
    deleteCustomers(await assertCustomersInScope(input.ids, scope)),
})

// 되살리기 (지운 거래처 중에서, 권한은 삭제와 같다)
export const restoreCustomersAction = createAction({
  permission: 'master.customers.delete',
  input: z.object({ ids: idsSchema }),
  handler: async ({ input, scope }) =>
    restoreCustomers(await assertCustomersInScope(input.ids, scope, true)),
})

// 엑셀 업로드 (0082 ③): 거래처를 만들고 고치므로 등록·수정 권한 둘 다 필요
const assertUploadPermission = (permissions: ReadonlySet<string>) => {
  if (!permissions.has('master.customers.update')) {
    throw new ActionError('FORBIDDEN', '거래처 수정 권한이 없습니다.')
  }
}

export const validateCustomerUploadAction = createAction({
  permission: 'master.customers.create',
  input: uploadRowsSchema,
  handler: async ({ input, scope, permissions }) => {
    assertUploadPermission(permissions)
    return previewCustomerUpload(input, scope)
  },
})

export const commitCustomerUploadAction = createAction({
  permission: 'master.customers.create',
  input: uploadRowsSchema,
  handler: async ({ input, scope, permissions }) => {
    assertUploadPermission(permissions)
    return commitCustomerUpload(input, scope)
  },
})
