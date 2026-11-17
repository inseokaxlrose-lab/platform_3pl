import 'server-only'
import { textIds } from '@/lib/id'
import { prisma } from '@/lib/prisma'
import { sharedOperatorFilter, type DataScope } from '@/lib/scope/data-scope'
import { isActiveStatus } from '@/lib/status'
import { decimalText } from '@/lib/units/unit-format'
import type { UnitTypeValue } from '@/lib/units/unit-labels'
import { isYes } from '@/lib/yn'

// 단위 편집 화면 조회 (docs/decisions/0078) — 시스템 기본 단위 + 이 운영사의 단위

// 유형별 기준단위 (시스템 단위: EA·KG·L·M·M2) — 환산 미리보기 "1 근 = 0.6 KG"
export async function getBaseUnits() {
  const rows = await prisma.unit.findMany({
    where: { isBase: 'Y', operatorId: null },
    select: { type: true, code: true, name: true },
  })
  return Object.fromEntries(rows.map((r) => [r.type, { code: r.code, name: r.name }])) as Partial<
    Record<UnitTypeValue, { code: string; name: string }>
  >
}
export type BaseUnits = Awaited<ReturnType<typeof getBaseUnits>>

// 편집 화면용 한 건 (없거나 다른 운영사의 단위면 null → "찾을 수 없음")
export async function getUnitForEdit(id: bigint, scope: DataScope) {
  const unit = await prisma.unit.findFirst({
    where: { id, ...sharedOperatorFilter(scope) },
    select: {
      id: true,
      code: true,
      name: true,
      nameEn: true,
      type: true,
      decimals: true,
      printName: true,
      sortOrder: true,
      status: true,
      isSystem: true,
      isBase: true,
      baseFactor: true,
      stdCode: true,
      description: true,
      remark: true,
      extAttr: true,
      rowVersion: true,
    },
  })
  if (!unit) return null
  const history = (unit.extAttr as { baseFactorHistory?: unknown } | null)?.baseFactorHistory
  return textIds({
    id: unit.id,
    code: unit.code,
    rowVersion: unit.rowVersion,
    isSystem: isYes(unit.isSystem),
    isBase: isYes(unit.isBase),
    // 환산계수 변경 기록 (최근 것부터)
    factorHistory: (Array.isArray(history) ? history : []).slice().reverse() as {
      at: string
      by: string
      from: string | null
      to: string | null
    }[],
    // 화면 입력값 (글자·숫자 그대로)
    input: {
      type: unit.type,
      name: unit.name,
      nameEn: unit.nameEn ?? '',
      printName: unit.printName ?? '',
      decimals: unit.decimals,
      sortOrder: unit.sortOrder,
      baseFactor: unit.baseFactor ? decimalText(unit.baseFactor.toString()) : '',
      stdCode: unit.stdCode ?? '',
      description: unit.description ?? '',
      remark: unit.remark ?? '',
      isActive: isActiveStatus(unit.status),
    },
  })
}
export type UnitForEdit = NonNullable<Awaited<ReturnType<typeof getUnitForEdit>>>

// 새 단위의 정렬 순서 기본값: 이 운영사 단위 중 가장 큰 값 다음 10 단위 (시스템 단위 뒤)
export async function nextUnitSortOrder(scope: DataScope) {
  const max = await prisma.unit.aggregate({
    where: sharedOperatorFilter(scope),
    _max: { sortOrder: true },
  })
  return Math.ceil(((max._max.sortOrder ?? 0) + 1) / 10) * 10
}
