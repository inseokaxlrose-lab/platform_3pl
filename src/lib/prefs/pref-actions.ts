'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { prisma } from '@/lib/prisma'
import { PREF_SCHEMAS, type PrefKey } from './pref-schemas'

// 개인 설정 저장 (0056): 메뉴 권한 없이 로그인만 ('signed-in'), 항상 본인 것만
export const saveUserPrefAction = createAction({
  permission: 'signed-in',
  input: z.object({ key: z.string(), value: z.unknown() }),
  handler: async ({ user, input }) => {
    if (!(input.key in PREF_SCHEMAS)) throw new ActionError('VALIDATION', '알 수 없는 설정입니다.')
    const key = input.key as PrefKey
    const parsed = PREF_SCHEMAS[key].safeParse(input.value)
    if (!parsed.success) throw new ActionError('VALIDATION', '설정 값이 올바르지 않습니다.')
    await prisma.userPref.upsert({
      where: { userId_prefKey: { userId: user.id, prefKey: key } },
      create: { userId: user.id, prefKey: key, value: parsed.data },
      update: { value: parsed.data },
    })
    return { key }
  },
})
