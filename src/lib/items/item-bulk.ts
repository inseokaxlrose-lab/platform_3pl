import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { prisma } from '@/lib/prisma'
import { ITEM_INPUT_INCLUDE, itemInputOf } from './item-queries'
import { itemSchema } from './item-schema'
import { updateItemIn } from './items'

// 품목 일괄 처리 (docs/decisions/0083 ②) — 운영사 품목 목록
// 팔레트 적재 일괄 입력: 고른 품목에 팔레트 종류·TI·HI(또는 팔레트당 박스 수)를 넣고 PLT를 다시 계산한다
// - 품목마다 따로 저장한다: BOX가 없는 등 계산할 수 없는 품목은 건너뛰고 나머지는 적용 (사용자 결정)
// - 저장은 일반 수정(updateItemIn)과 같은 길 — PLT 계산·경고·환산수량 이력이 똑같이 적용된다

export type PalletBulkInput = {
  palletTypeCode: string
  palletTi: number | null
  palletHi: number | null
  palletBoxQty: number | null
}

export type PalletBulkResult = {
  total: number
  applied: number
  // 저장은 됐지만 경고가 있는 품목 수 (높이·중량 초과 등)
  warned: number
  skipped: { code: string; reason: string }[]
}

export async function applyPalletToItems(
  ids: bigint[],
  pallet: PalletBulkInput,
): Promise<PalletBulkResult> {
  if (!(pallet.palletTi && pallet.palletHi) && !pallet.palletBoxQty) {
    throw new ActionError('VALIDATION', 'TI·HI 또는 팔레트당 박스 수를 넣어 주세요.')
  }
  const items = await prisma.item.findMany({
    where: { id: { in: ids } },
    include: ITEM_INPUT_INCLUDE,
    orderBy: { code: 'asc' },
  })
  const result: PalletBulkResult = { total: items.length, applied: 0, warned: 0, skipped: [] }
  for (const item of items) {
    if (!item.units.some((u) => u.level === 'BOX')) {
      result.skipped.push({ code: item.code, reason: 'BOX 단위가 없습니다' })
      continue
    }
    const parsed = itemSchema.safeParse({
      ...itemInputOf(item),
      palletTypeCode: pallet.palletTypeCode,
      palletTi: pallet.palletTi,
      palletHi: pallet.palletHi,
      // TI·HI가 있으면 박스 수는 계산값
      palletBoxQty: pallet.palletTi && pallet.palletHi ? null : pallet.palletBoxQty,
    })
    if (!parsed.success) {
      result.skipped.push({
        code: item.code,
        reason: parsed.error.issues[0]?.message ?? '입력 오류',
      })
      continue
    }
    try {
      const saved = await prisma.$transaction((tx) =>
        updateItemIn(tx, item.id, item.rowVersion, parsed.data),
      )
      result.applied += 1
      // 체적 미등록은 품목 자체의 상태라 팔레트 경고로 세지 않는다
      if (saved.warnings.some((w) => w.code !== 'VOLUME_MISSING')) result.warned += 1
    } catch (error) {
      if (!(error instanceof ActionError)) throw error
      result.skipped.push({ code: item.code, reason: error.message })
    }
  }
  return result
}
