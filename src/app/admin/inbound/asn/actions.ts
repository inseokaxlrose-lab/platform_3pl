'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { listQuerySchema } from '@/lib/grid/grid-query'
import { listAsns } from '@/lib/inbound/asn-list'
import { idSchema } from '@/lib/id'
import { commitAsnUpload, previewAsnUpload } from '@/lib/inbound/asn-upload'
import { uploadRowsSchema } from '@/lib/excel/upload'
import { getAsnItemOptions } from '@/lib/inbound/asn-queries'
import { asnCreateSchema, asnSchema } from '@/lib/inbound/asn-schema'
import { assertAsnsInScope, closeAsn, createAsn, deleteAsns, updateAsn } from '@/lib/inbound/asns'
import { SHIPPER_SCOPE } from '@/lib/items/item-list'
import { prisma } from '@/lib/prisma'
import { rowVersionField } from '@/lib/row-version'
import { assertInScope } from '@/lib/scope/data-scope'

// 운영사 화면 · ASN 서버 액션 (docs/decisions/0048) — 센터 운영자의 대리 등록 (등록 경로 PROXY)
// 데이터 범위: 운영사 관리자 = 전체, 센터 직원 = 소속 센터의 ASN (화주사는 그 센터를 이용해야 한다)

// 목록 (엑셀 전체는 엑셀 권한 필요)
export const listAsnsAction = createAction({
  permission: 'inbound.asn.read',
  input: listQuerySchema,
  handler: async ({ input, scope, permissions }) => {
    if (input.exportAll && !permissions.has('inbound.asn.export')) {
      throw new ActionError('FORBIDDEN', '엑셀 내려받기 권한이 없습니다.')
    }
    return listAsns(input, scope)
  },
})

// ASN 라인에서 고를 품목 (화주사를 고르면 불러온다)
export const listAsnItemOptionsAction = createAction({
  permission: 'inbound.asn.read',
  input: z.object({ shipperId: idSchema }),
  handler: async ({ input, scope }) => getAsnItemOptions(input.shipperId, scope),
})

export const createAsnAction = createAction({
  permission: 'inbound.asn.create',
  input: asnCreateSchema,
  handler: async ({ input, scope }) => {
    const shipper = await prisma.shipper.findUnique({
      where: { id: input.shipperId },
      select: { id: true, operatorId: true, centers: { select: { centerId: true } } },
    })
    assertInScope(scope, shipper, SHIPPER_SCOPE)
    return createAsn(input, 'PROXY', scope)
  },
})

// 수정 (예정 상태만, rowVersion: 화면이 불러온 버전)
export const updateAsnAction = createAction({
  permission: 'inbound.asn.update',
  input: asnSchema.extend({ id: idSchema, rowVersion: rowVersionField }),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    await assertAsnsInScope([id], scope)
    return updateAsn(id, rowVersion, data, scope)
  },
})

// 지우기 (예정 상태만)
export const deleteAsnsAction = createAction({
  permission: 'inbound.asn.delete',
  input: z.object({ ids: z.array(idSchema).min(1).max(500) }),
  handler: async ({ input, scope }) => deleteAsns(await assertAsnsInScope(input.ids, scope)),
})

// 엑셀 업로드 (0050): 검증(저장 안 함) → 오류가 없을 때만 등록 (등록 경로 EXCEL)
export const validateAsnUploadAction = createAction({
  permission: 'inbound.asn.create',
  input: uploadRowsSchema,
  handler: async ({ input, scope }) => previewAsnUpload(input, scope),
})

export const commitAsnUploadAction = createAction({
  permission: 'inbound.asn.create',
  input: uploadRowsSchema,
  handler: async ({ input, scope }) => commitAsnUpload(input, scope),
})

// 잔량 마감 (0052): 사유 코드 필수(0087) + 메모, 권한 inbound.asn.close
export const closeAsnAction = createAction({
  permission: 'inbound.asn.close',
  input: z.object({
    id: idSchema,
    rowVersion: rowVersionField,
    reasonCd: z.string().trim().min(1, '마감 사유를 골라 주세요.').max(20),
    reason: z.string().max(200).default(''),
  }),
  handler: async ({ input, scope }) => {
    await assertAsnsInScope([input.id], scope)
    return closeAsn(input.id, input.rowVersion, input.reasonCd, input.reason)
  },
})
