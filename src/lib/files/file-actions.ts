'use server'

import { z } from 'zod'
import type { PermissionCode } from '@/config/permissions'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { idSchema } from '@/lib/id'
import { FILE_ENTITY, type FileEntity } from './file-codes'
import { attachImage, detachFile, listAttachments, setOperatorImage } from './files'

// 첨부파일 서버 액션 (docs/decisions/0091)
// 대상마다 필요한 권한이 달라 로그인만 확인한 뒤(signed-in) 대상의 권한 코드로 다시 검사한다
// 보기: 품목은 품목 조회(운영사) 또는 포털 품목 조회(화주), 검수는 검수 조회 / 바꾸기: 그 메뉴의 수정 권한
const READ: Record<FileEntity, PermissionCode[]> = {
  ITEM: ['master.items.read', 'portal.items.read'],
  INSPECTION: ['inbound.inspection.read'],
}
const WRITE: Record<FileEntity, PermissionCode[]> = {
  ITEM: ['master.items.update', 'portal.items.update'],
  INSPECTION: ['inbound.inspection.update'],
}

function assertAny(permissions: ReadonlySet<PermissionCode>, codes: PermissionCode[]) {
  if (!codes.some((code) => permissions.has(code))) {
    throw new ActionError('FORBIDDEN', '이 작업을 할 권한이 없습니다.')
  }
}

const target = { entity: z.enum(FILE_ENTITY.values), id: idSchema }

export const listAttachmentsAction = createAction({
  permission: 'signed-in',
  input: z.object(target),
  handler: async ({ input, permissions, scope }) => {
    assertAny(permissions, READ[input.entity])
    return listAttachments(scope, input.entity, input.id)
  },
})

export const uploadAttachmentAction = createAction({
  permission: 'signed-in',
  input: z.object({ ...target, file: z.instanceof(File, { message: '파일을 골라 주세요.' }) }),
  handler: async ({ input, permissions, scope }) => {
    assertAny(permissions, WRITE[input.entity])
    return attachImage(scope, input.entity, input.id, input.file)
  },
})

export const deleteAttachmentAction = createAction({
  permission: 'signed-in',
  input: z.object({ ...target, fileId: idSchema }),
  handler: async ({ input, permissions, scope }) => {
    assertAny(permissions, WRITE[input.entity])
    await detachFile(scope, input.entity, input.id, input.fileId)
    return { id: input.fileId }
  },
})

// 운영사 로고·직인 (지금 운영사): file이 없으면 지우기
export const setOperatorImageAction = createAction({
  permission: 'master.operator.update',
  input: z.object({
    kind: z.enum(['logo', 'stamp']),
    file: z.instanceof(File).nullable(),
  }),
  handler: async ({ input }) => setOperatorImage(input.kind, input.file),
})
