'use server'

import { z } from 'zod'
import { createAction } from '@/lib/actions/create-action'
import { requireOperatorId } from '@/lib/actor'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { idSchema } from '@/lib/id'
import {
  palletCodeField,
  palletTypeCreateSchema,
  palletTypeSchema,
} from '@/lib/pallets/pallet-type-schema'
import {
  createPalletType,
  deletePalletType,
  listPalletTypes,
  setDefaultPalletType,
  updatePalletType,
} from '@/lib/pallets/pallet-types'
import { prisma } from '@/lib/prisma'
import { rowVersionField } from '@/lib/row-version'

// 팔레트 종류 서버 액션 (docs/decisions/0083) — 권한은 단위 관리와 같다 (master.units)
// 목록은 이 운영사에서 쓰는 종류 (시스템 기본 + 운영사 행, 같은 코드는 운영사 행이 이긴다). 몇 개 안 되므로 한 번에 읽는다

export const listPalletTypesAction = createAction({
  permission: 'master.units.read',
  input: listQuerySchema,
  handler: async ({ input }) => {
    const operatorId = requireOperatorId()
    const [list, operator] = await Promise.all([
      listPalletTypes(prisma, operatorId),
      prisma.operator.findUniqueOrThrow({
        where: { id: operatorId },
        select: { defaultPalletType: true },
      }),
    ])
    const keyword = input.search.trim().toUpperCase()
    const status = input.filters.status
    const rows = list
      .filter((p) => !keyword || p.code.includes(keyword) || p.name.toUpperCase().includes(keyword))
      .filter((p) => !status || p.status === status)
      .map((p) => ({ ...p, id: String(p.id), isDefault: p.code === operator.defaultPalletType }))
    return { rows, rowCount: rows.length }
  },
})

export const createPalletTypeAction = createAction({
  permission: 'master.units.create',
  input: palletTypeCreateSchema,
  handler: async ({ input }) => createPalletType(input),
})

export const updatePalletTypeAction = createAction({
  permission: 'master.units.update',
  input: palletTypeSchema.and(z.object({ id: idSchema, rowVersion: rowVersionField })),
  handler: async ({ input: { id, rowVersion, ...data } }) => updatePalletType(id, rowVersion, data),
})

export const deletePalletTypeAction = createAction({
  permission: 'master.units.delete',
  input: z.object({ id: idSchema }),
  handler: async ({ input }) => deletePalletType(input.id),
})

export const setDefaultPalletTypeAction = createAction({
  permission: 'master.units.update',
  input: z.object({ code: palletCodeField }),
  handler: async ({ input }) => setDefaultPalletType(input.code),
})
