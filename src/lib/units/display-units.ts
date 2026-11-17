import 'server-only'
import type { Db } from '@/lib/prisma'
import { DEFAULT_DISPLAY_UNITS, type DisplayUnit, type DisplayUnits } from './dimension'

// 운영사 표시 단위 (docs/decisions/0078): tb_operator.weight_unit_cd·length_unit_cd → 단위 기준정보의 한 줄
// 값은 단위 코드(KG·LB / CM·INCH·MM 등). 그 코드가 없거나 유형이 맞지 않으면(중량·길이 아님) 기본(kg·cm)
export async function getOperatorDisplayUnits(db: Db, operatorId: bigint): Promise<DisplayUnits> {
  const operator = await db.operator.findUnique({
    where: { id: operatorId },
    select: { weightUnit: true, lengthUnit: true },
  })
  if (!operator) return DEFAULT_DISPLAY_UNITS
  const rows = await db.unit.findMany({
    where: {
      code: { in: [operator.weightUnit, operator.lengthUnit] },
      type: { in: ['WEIGHT', 'LENGTH'] },
      // 시스템 단위 + 이 운영사의 단위
      OR: [{ operatorId: null }, { operatorId }],
    },
    select: { code: true, type: true, baseFactor: true, printName: true },
  })
  const pick = (code: string, type: 'WEIGHT' | 'LENGTH'): DisplayUnit | null => {
    const row = rows.find((r) => r.code === code && r.type === type)
    return row?.baseFactor
      ? {
          code: row.code,
          type: row.type,
          baseFactor: row.baseFactor.toString(),
          label: row.printName || row.code.toLowerCase(),
        }
      : null
  }
  return {
    length: pick(operator.lengthUnit, 'LENGTH') ?? DEFAULT_DISPLAY_UNITS.length,
    weight: pick(operator.weightUnit, 'WEIGHT') ?? DEFAULT_DISPLAY_UNITS.weight,
  }
}
