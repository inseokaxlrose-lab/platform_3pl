'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { findMenu, readHelpDocument } from './load-help'
import { filterHelpSections } from './parse-help'

// 화면 도움말 불러오기 (docs/decisions/0023)
// 메뉴마다 필요한 권한이 달라서 'signed-in'으로 받고, 안에서 그 메뉴의 조회 권한을 다시 검사한다
// 권한 표시가 붙은 단락은 서버에서 걸러, 권한 없는 사람에게는 아예 보내지 않는다
export const loadHelpAction = createAction({
  permission: 'signed-in',
  input: z.object({ menuHref: z.string().min(1).max(200) }),
  handler: async ({ input, permissions }) => {
    const menu = findMenu(input.menuHref)
    if (!menu) throw new ActionError('NOT_FOUND', '도움말이 없는 화면입니다.')
    if (menu.permission && !permissions.has(menu.permission)) {
      throw new ActionError('FORBIDDEN', '이 화면을 볼 권한이 없습니다.')
    }
    const document = readHelpDocument(input.menuHref)
    if (!document) throw new ActionError('NOT_FOUND', '도움말이 없는 화면입니다.')
    return filterHelpSections(document, permissions)
  },
})
