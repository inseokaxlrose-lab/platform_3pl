'use server'

import { z } from 'zod'
import { ActionError } from '@/lib/actions/action-error'
import { createAction } from '@/lib/actions/create-action'
import { prisma } from '@/lib/prisma'
import { isMenuHref, MAX_FAVORITE_MENUS } from './favorites'

// 사이드바 즐겨찾기 켜기·끄기 (docs/decisions/0022)
// 개인 설정이라 로그인만 필요하다 ('signed-in'). 항상 로그인한 본인의 즐겨찾기만 다룬다
export const setFavoriteMenuAction = createAction({
  permission: 'signed-in',
  input: z.object({
    href: z.string().refine(isMenuHref, '메뉴 목록에 없는 주소입니다.'),
    favorite: z.boolean(),
  }),
  handler: async ({ user, input }) => {
    if (!input.favorite) {
      await prisma.userFavoriteMenu.deleteMany({ where: { userId: user.id, href: input.href } })
      return { href: input.href, favorite: false }
    }
    const count = await prisma.userFavoriteMenu.count({ where: { userId: user.id } })
    const exists = await prisma.userFavoriteMenu.findUnique({
      where: { userId_href: { userId: user.id, href: input.href } },
      select: { href: true },
    })
    if (!exists && count >= MAX_FAVORITE_MENUS) {
      throw new ActionError(
        'CONFLICT',
        `즐겨찾기는 ${MAX_FAVORITE_MENUS}개까지 추가할 수 있습니다.`,
      )
    }
    // 이미 있으면 그대로 (추가한 순서를 바꾸지 않음)
    await prisma.userFavoriteMenu.upsert({
      where: { userId_href: { userId: user.id, href: input.href } },
      create: { userId: user.id, href: input.href },
      update: {},
    })
    return { href: input.href, favorite: true }
  },
})
