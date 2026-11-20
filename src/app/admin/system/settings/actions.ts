'use server'

import { operatorSettingsSchema } from '@/config/operator-settings'
import { createAction } from '@/lib/actions/create-action'
import { saveOperatorSettings } from '@/lib/settings/operator-settings'

// 운영 설정 저장 (0092): 권한 system.settings.update, 지금 운영사의 설정만
export const saveOperatorSettingsAction = createAction({
  permission: 'system.settings.update',
  input: operatorSettingsSchema,
  handler: async ({ input }) => saveOperatorSettings(input),
})
