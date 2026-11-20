import 'server-only'
import type { Db } from '@/lib/prisma'
import { DEFAULT_DISPLAY_UNITS, type DisplayUnit, type DisplayUnits } from './dimension'

// 운영사 표시 단위 (docs/decisions/0078·0084): tb_operator.weight_unit_id·length_unit_id → 단위 기준정보의 한 줄
// 유형(중량·길이)과 범위(시스템 또는 이 운영사의 단위)는 DB 트리거가 지킨다. 환산계수가 없으면 기본(kg·cm)
const UNIT_SELECT = { select: { code: true, type: true, baseFactor: true, printName: true } }

type UnitRow = {
  code: string
  type: string
  baseFactor: { toString(): string } | null
  printName: string | null
}

const toDisplay = (row: UnitRow): DisplayUnit | null =>
  row.baseFactor
    ? {
        code: row.code,
        type: row.type,
        baseFactor: row.baseFactor.toString(),
        label: row.printName || row.code.toLowerCase(),
      }
    : null

export async function getOperatorDisplayUnits(db: Db, operatorId: bigint): Promise<DisplayUnits> {
  const operator = await db.operator.findUnique({
    where: { id: operatorId },
    select: { weightUnit: UNIT_SELECT, lengthUnit: UNIT_SELECT },
  })
  if (!operator) return DEFAULT_DISPLAY_UNITS
  return {
    length: toDisplay(operator.lengthUnit) ?? DEFAULT_DISPLAY_UNITS.length,
    weight: toDisplay(operator.weightUnit) ?? DEFAULT_DISPLAY_UNITS.weight,
  }
}
