import 'server-only'
import { listPalletTypes, type PalletTypeView } from '@/lib/pallets/pallet-types'
import { prisma } from '@/lib/prisma'
import type { PalletTypeForEdit } from './pallet-type-form'

// 팔레트 종류 화면 조회 (0083) — 이 운영사에서 쓰는 종류 중에서 찾는다 (다른 운영사 행은 "찾을 수 없음")

const toInput = (p: PalletTypeView) => ({
  code: p.code,
  name: p.name,
  widthCm: p.widthCm,
  depthCm: p.depthCm,
  heightCm: p.heightCm,
  weightKg: p.weightKg,
  maxLoadHeightCm: p.maxLoadHeightCm ?? '',
  maxLoadWeightKg: p.maxLoadWeightKg ?? '',
  status: p.status as 'ACTIVE' | 'INACTIVE',
  sortOrder: p.sortOrder,
  remark: p.remark ?? '',
})

export async function getPalletTypeForEdit(
  operatorId: bigint,
  id: bigint,
): Promise<PalletTypeForEdit | null> {
  const found = (await listPalletTypes(prisma, operatorId)).find((p) => p.id === id)
  if (!found) return null
  return {
    id: String(found.id),
    source: found.source as PalletTypeForEdit['source'],
    rowVersion: found.rowVersion,
    input: toInput(found),
  }
}

// 등록 화면의 처음 값: ?copy=코드 → 그 종류의 값 (시스템 기본을 덮어쓸 때)
export async function getPalletTypeCopy(operatorId: bigint, code: string | undefined) {
  if (!code) return undefined
  const found = (await listPalletTypes(prisma, operatorId)).find((p) => p.code === code)
  return found ? toInput(found) : undefined
}
