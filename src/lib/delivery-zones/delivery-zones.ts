import 'server-only'
import { looksLikeSystemCode } from '@/config/master-codes'
import type { Prisma } from '@/generated/prisma/client'
import { ActionError } from '@/lib/actions/action-error'
import { deleteExternalCodes, saveExternalCodes } from '@/lib/master-code/external-codes'
import { nextSystemCode } from '@/lib/master-code/system-code'
import { prisma } from '@/lib/prisma'
import type { DeliveryZoneData } from './delivery-zone-schema'
import { regionLabel, regionsOverlap } from './regions'

type Db = Prisma.TransactionClient

// 배송권역 저장 (docs/decisions/0033). 권한·데이터 범위 검사는 서버 액션에서 한다

// 사용자 코드: 시스템 코드 모양 금지(자기 것 제외), 같은 센터 안 중복 금지
async function assertZoneCode(
  db: Db,
  centerId: bigint,
  code: string,
  ownSystemCode: string,
  exceptId?: bigint,
) {
  if (code !== ownSystemCode && looksLikeSystemCode('DELIVERY_ZONE', code)) {
    throw new ActionError(
      'VALIDATION',
      `'${code}'는 시스템 코드 모양이라 권역 코드로 쓸 수 없습니다.`,
    )
  }
  const owner = await db.deliveryZone.findUnique({
    where: { centerId_code: { centerId, code } },
    select: { id: true },
  })
  if (owner && owner.id !== exceptId) {
    throw new ActionError('CONFLICT', `이 센터에 이미 있는 권역 코드입니다: ${code}`)
  }
}

// 같은 센터의 다른 권역(사용 중지 포함)이 이미 담당하는 지역과 겹치면 거부
// 사용 중지 권역도 포함: 다시 사용할 때 겹치지 않게
async function assertRegionsFree(
  db: Db,
  centerId: bigint,
  regionCodes: string[],
  exceptZoneId?: bigint,
) {
  const taken = await db.deliveryZoneRegion.findMany({
    where: { zone: { centerId, ...(exceptZoneId ? { id: { not: exceptZoneId } } : {}) } },
    select: { regionCode: true, zone: { select: { name: true, code: true } } },
  })
  const conflicts = regionCodes.flatMap((code) =>
    taken
      .filter((t) => regionsOverlap(code, t.regionCode))
      .map((t) => `${regionLabel(t.regionCode)}(${t.zone.name})`),
  )
  if (conflicts.length > 0) {
    const shown = [...new Set(conflicts)]
    throw new ActionError(
      'CONFLICT',
      `이 센터의 다른 권역이 이미 담당하는 지역입니다: ${shown.slice(0, 3).join(', ')}${
        shown.length > 3 ? ` 외 ${shown.length - 3}곳` : ''
      }`,
    )
  }
}

// 등록 (한 트랜잭션: 시스템 코드 → 권역 → 담당 지역 → 외부 코드)
export async function createDeliveryZone(data: DeliveryZoneData) {
  return prisma.$transaction(async (tx) => {
    const center = await tx.center.findUnique({
      where: { id: data.centerId },
      select: { isActive: true },
    })
    if (!center) throw new ActionError('NOT_FOUND', '센터를 찾을 수 없습니다.')
    if (!center.isActive) {
      throw new ActionError('CONFLICT', '사용 중지된 센터에는 배송권역을 추가할 수 없습니다.')
    }
    const systemCode = await nextSystemCode('DELIVERY_ZONE', tx)
    const code = data.code || systemCode
    await assertZoneCode(tx, data.centerId, code, systemCode)
    await assertRegionsFree(tx, data.centerId, data.regionCodes)
    const zone = await tx.deliveryZone.create({
      data: {
        centerId: data.centerId,
        systemCode,
        code,
        name: data.name,
        description: data.description,
        regions: { create: data.regionCodes.map((regionCode) => ({ regionCode })) },
      },
      select: { id: true, systemCode: true, code: true },
    })
    await saveExternalCodes(tx, 'DELIVERY_ZONE', zone.id, data.externalCodes)
    return zone
  })
}

// 수정: 센터·시스템 코드는 바뀌지 않는다. 담당 지역은 통째로 바꾼다
export async function updateDeliveryZone(id: bigint, data: DeliveryZoneData) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.deliveryZone.findUnique({
      where: { id },
      select: { centerId: true, systemCode: true },
    })
    if (!current) throw new ActionError('NOT_FOUND', '배송권역을 찾을 수 없습니다.')
    const code = data.code || current.systemCode
    await assertZoneCode(tx, current.centerId, code, current.systemCode, id)
    await assertRegionsFree(tx, current.centerId, data.regionCodes, id)
    await tx.deliveryZone.update({
      where: { id },
      data: { code, name: data.name, description: data.description },
    })
    await tx.deliveryZoneRegion.deleteMany({ where: { zoneId: id } })
    await tx.deliveryZoneRegion.createMany({
      data: data.regionCodes.map((regionCode) => ({ zoneId: id, regionCode })),
    })
    await saveExternalCodes(tx, 'DELIVERY_ZONE', id, data.externalCodes)
    return { id, code }
  })
}

// 쓰인 적 있는 권역 id
// TODO(출고 작업, MVP 이후 출고 관리): 배송요청·출고 표가 생기면 여기서 검사한다. 지금은 쓰일 곳이 없어 빈 목록
export async function findUsedZoneIds(db: Db, ids: bigint[]): Promise<bigint[]> {
  void db // 출고 표가 생기면 이 트랜잭션으로 검사한다
  void ids
  return []
}

// 삭제: 쓰인 적 없는 권역만 (쓰인 권역은 사용 중지). 담당 지역·외부 코드도 함께 지운다
export async function deleteDeliveryZones(ids: bigint[]) {
  return prisma.$transaction(async (tx) => {
    const used = await findUsedZoneIds(tx, ids)
    if (used.length > 0) {
      throw new ActionError('CONFLICT', '출고에 쓰인 권역은 지울 수 없습니다. 사용 중지하세요.')
    }
    for (const id of ids) await deleteExternalCodes(tx, 'DELIVERY_ZONE', id)
    const { count } = await tx.deliveryZone.deleteMany({ where: { id: { in: ids } } })
    return { count }
  })
}
