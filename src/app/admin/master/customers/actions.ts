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
  setCustomersActive,
  updateCustomer,
} from '@/lib/customers/customers'
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
  input: customerSchema.extend({ id: idSchema, rowVersion: rowVersionField }),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    await assertCustomersInScope([id], scope)
    return updateCustomer(id, rowVersion, data)
  },
})

export const setCustomersActiveAction = createAction({
  permission: 'master.customers.update',
  input: z.object({ ids: idsSchema, isActive: z.boolean() }),
  handler: async ({ input, scope }) =>
    setCustomersActive(await assertCustomersInScope(input.ids, scope), input.isActive),
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
