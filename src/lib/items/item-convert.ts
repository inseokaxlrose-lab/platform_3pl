import 'server-only'
import { requireOperatorId } from '@/lib/actor'
import type { Db } from '@/lib/prisma'
import { resolveUnitDecimals, unitDecimalsSelect } from '@/lib/units/unit-status'
import type { UnitLevel } from './item-codes'
import {
  calcItemVolumeIn,
  convertItemQtyIn,
  splitByUomIn,
  toItemBaseQtyIn,
  type ItemUomTable,
} from './item-uom'

// 품목 단위 환산 — DB에서 품목의 단위 표를 읽어 item-uom.ts의 순수 함수로 계산한다 (0042, 0083)
// 여러 수량을 한 품목으로 계산할 때는 loadItemUoms로 한 번 읽고 …In 함수를 직접 쓴다 (매번 읽지 않게)

// 품목의 단위 표 + 기본 입고·주문단위 (비어 있으면 자동: 입고 = BOX, 없으면 기본단위 / 주문 = 기본단위)
export async function loadItemUoms(db: Db, itemId: bigint) {
  const decimals = unitDecimalsSelect(requireOperatorId())
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: {
      defaultInboundUnitId: true,
      defaultOrderUnitId: true,
      baseUnit: { select: { id: true, code: true, ...decimals } },
      units: {
        orderBy: { sortOrder: 'asc' },
        select: {
          level: true,
          convQty: true,
          cbm: true,
          grossWeightKg: true,
          unit: { select: { id: true, code: true, ...decimals } },
        },
      },
    },
  })
  if (!item) throw new Error(`품목을 찾을 수 없습니다: ${itemId}`)
  resolveUnitDecimals(item)
  const table: ItemUomTable = {
    baseUnitCode: item.baseUnit.code,
    units: item.units.map((u) => ({
      level: u.level as UnitLevel,
      unitCode: u.unit.code,
      convQty: u.convQty.toString(),
      decimals: u.unit.decimals,
      cbm: u.cbm?.toString() ?? null,
      grossWeightKg: u.grossWeightKg?.toString() ?? null,
    })),
  }
  // 옛 데이터처럼 BASE 행이 없으면 기본단위 행을 채운다
  if (!table.units.some((u) => u.level === 'BASE')) {
    table.units.unshift({
      level: 'BASE',
      unitCode: item.baseUnit.code,
      convQty: '1',
      decimals: item.baseUnit.decimals,
    })
  }
  const codeOf = (id: bigint | null) => item.units.find((u) => u.unit.id === id)?.unit.code ?? null
  const boxCode = item.units.find((u) => u.level === 'BOX')?.unit.code ?? null
  return {
    table,
    defaultInboundUnit: codeOf(item.defaultInboundUnitId) ?? boxCode ?? item.baseUnit.code,
    defaultOrderUnit: codeOf(item.defaultOrderUnitId) ?? item.baseUnit.code,
  }
}
export type ItemUoms = Awaited<ReturnType<typeof loadItemUoms>>

// 이 단위 수량 → 기본단위 수량 (재고 저장 직전 반드시 사용)
export async function toItemBaseQty(db: Db, itemId: bigint, qty: string, unitCode: string) {
  return toItemBaseQtyIn((await loadItemUoms(db, itemId)).table, qty, unitCode)
}

// 품목 단위 간 환산 (나누어떨어지지 않으면 오류, remainder 옵션이면 내림 + 나머지)
export async function convertItemQty(
  db: Db,
  itemId: bigint,
  qty: string,
  fromUnitCode: string,
  toUnitCode: string,
  options?: { remainder?: boolean },
) {
  return convertItemQtyIn(
    (await loadItemUoms(db, itemId)).table,
    qty,
    fromUnitCode,
    toUnitCode,
    options,
  )
}

// 기본단위 수량을 PLT·BOX·낱개로 나누기 (피킹·출력 표시용)
export async function splitByUom(db: Db, itemId: bigint, baseQty: string) {
  return splitByUomIn((await loadItemUoms(db, itemId)).table, baseQty)
}

// 수량의 CBM·중량 (BOX 규격 기준, 체적 미등록이면 status VOLUME_MISSING)
export async function calcItemVolume(db: Db, itemId: bigint, baseQty: string) {
  return calcItemVolumeIn((await loadItemUoms(db, itemId)).table, baseQty)
}
