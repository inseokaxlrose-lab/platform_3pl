'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { idSchema } from '@/lib/id'
import { commitAsnUpload, previewAsnUpload } from '@/lib/inbound/asn-upload'
import { uploadRowsSchema } from '@/lib/excel/upload'
import { asnSchema } from '@/lib/inbound/asn-schema'
import { assertAsnsInScope, createAsn, deleteAsns, updateAsn } from '@/lib/inbound/asns'
import { rowVersionField } from '@/lib/row-version'
import type { DataScope } from '@/lib/scope/data-scope'

// 화주 포털 · ASN 서버 액션 (docs/decisions/0048) — 등록 경로 PORTAL
// - 권한은 포털 코드(portal.asn.*)로 따로 검사한다
// - 화주사 사용자만: 화주사는 범위의 화주사로 정한다 (화면 값은 쓰지 않는다)

function shipperOf(scope: DataScope): bigint {
  if (scope.kind !== 'SHIPPER')
    throw new ActionError('FORBIDDEN', '화주사 사용자만 쓸 수 있습니다.')
  return scope.shipperId
}

export const createPortalAsnAction = createAction({
  permission: 'portal.asn.create',
  input: asnSchema,
  handler: async ({ input, scope }) =>
    createAsn({ ...input, shipperId: shipperOf(scope) }, 'PORTAL', scope),
})

export const updatePortalAsnAction = createAction({
  permission: 'portal.asn.update',
  input: asnSchema.extend({ id: idSchema, rowVersion: rowVersionField }),
  handler: async ({ input: { id, rowVersion, ...data }, scope }) => {
    shipperOf(scope)
    await assertAsnsInScope([id], scope)
    return updateAsn(id, rowVersion, data, scope)
  },
})

export const deletePortalAsnsAction = createAction({
  permission: 'portal.asn.delete',
  input: z.object({ ids: z.array(idSchema).min(1).max(500) }),
  handler: async ({ input, scope }) => {
    shipperOf(scope)
    return deleteAsns(await assertAsnsInScope(input.ids, scope))
  },
})

// 엑셀 업로드 (0050): 화주사 칸 없이 자기 화주사
export const validatePortalAsnUploadAction = createAction({
  permission: 'portal.asn.create',
  input: uploadRowsSchema,
  handler: async ({ input, scope }) => previewAsnUpload(input, scope, shipperOf(scope)),
})

export const commitPortalAsnUploadAction = createAction({
  permission: 'portal.asn.create',
  input: uploadRowsSchema,
  handler: async ({ input, scope }) => commitAsnUpload(input, scope, shipperOf(scope)),
})
