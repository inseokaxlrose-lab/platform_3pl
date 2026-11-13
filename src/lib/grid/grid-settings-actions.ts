'use server'

import { z } from 'zod'
import { gridSettingsSchema } from '@/components/data-grid/settings'
import { createAction } from '@/lib/actions/create-action'
import { prisma } from '@/lib/prisma'
import { GRID_ID_PATTERN } from './grid-settings'

// 그리드 개인 설정 저장·되돌리기 (docs/decisions/0021)
// 메뉴 권한이 아니라 로그인만 필요하다 ('signed-in'). 항상 로그인한 본인의 설정만 다룬다

const gridId = z.string().regex(GRID_ID_PATTERN, '그리드 이름이 올바르지 않습니다.')

export const saveGridSettingsAction = createAction({
  permission: 'signed-in',
  input: z.object({ gridId, settings: gridSettingsSchema }),
  handler: async ({ user, input }) => {
    await prisma.userGridSetting.upsert({
      where: { userId_gridId: { userId: user.id, gridId: input.gridId } },
      create: { userId: user.id, gridId: input.gridId, settings: input.settings },
      update: { settings: input.settings },
    })
    return { gridId: input.gridId }
  },
})

// 기본값 되돌리기: 저장된 설정을 지운다
export const resetGridSettingsAction = createAction({
  permission: 'signed-in',
  input: z.object({ gridId }),
  handler: async ({ user, input }) => {
    await prisma.userGridSetting.deleteMany({ where: { userId: user.id, gridId: input.gridId } })
    return { gridId: input.gridId }
  },
})
