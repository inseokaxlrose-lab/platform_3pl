import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { currentActor, requireOperatorId } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { parseQty } from '@/lib/units/convert'
import { ASN_ITEM_SELECT, entryToBase, itemLotOptions } from './asns'
import type { InspectionData } from './inspection-schema'

// 입고 검수 (docs/decisions/0053) — 도착한 물건의 수량·불량·로트·유통기한을 적는다
// - ASN 줄 하나에 여러 건 (로트가 다르면 나눠서), 수량은 입력 단위 → 기본단위
// - 로트·유통기한: 품목 설정에 따라 필수 또는 비움 (CLAUDE.md)
// - 마감된 ASN은 검수할 수 없다. 첫 검수가 들어오면 ASN은 예정 → 검수중
// - 확정하지 않은 검수만 지울 수 있다 (실수 정정)

export async function addInspection(data: InspectionData) {
  const operatorId = requireOperatorId()
  return prisma.$transaction(async (tx) => {
    const line = await tx.asnLine.findUnique({
      where: { id: data.asnLineId },
      select: {
        id: true,
        asnId: true,
        asn: { select: { status: true, delYn: true } },
        item: { select: ASN_ITEM_SELECT },
      },
    })
    if (!line || line.asn.delYn === 'Y')
      throw new ActionError('NOT_FOUND', 'ASN 줄을 찾을 수 없습니다.')
    if (line.asn.status === 'CLOSED') {
      throw new ActionError('CONFLICT', '마감된 ASN은 검수할 수 없습니다.')
    }
    const item = line.item
    const good = entryToBase(item, data.unit, data.qty)
    const defect = entryToBase(item, data.unit, data.defectQty)

    // 로트·유통기한: 관리 품목은 필수, 아니면 비움
    const options = itemLotOptions(item)
    if (options.useLot && !data.lotNo) {
      throw new ActionError('VALIDATION', `로트번호를 넣어 주세요 (로트 관리 품목: ${item.code}).`)
    }
    if (!options.useLot && data.lotNo) {
      throw new ActionError('VALIDATION', `로트를 관리하지 않는 품목입니다 (${item.code}).`)
    }
    if (options.useExpiry && !data.expiryOn) {
      throw new ActionError(
        'VALIDATION',
        `유통기한을 넣어 주세요 (유통기한 관리 품목: ${item.code}).`,
      )
    }
    if (!options.useExpiry && data.expiryOn) {
      throw new ActionError('VALIDATION', `유통기한을 관리하지 않는 품목입니다 (${item.code}).`)
    }

    const created = await tx.inboundInspection.create({
      data: {
        operatorId,
        asnId: line.asnId,
        asnLineId: line.id,
        itemId: item.id,
        lotNo: data.lotNo,
        expiryOn: data.expiryOn ? new Date(`${data.expiryOn}T00:00:00.000Z`) : null,
        inspectedQty: good.baseQty,
        defectQty: defect.baseQty,
        entryUnit: good.entryUnit,
        entryQty: good.entryUnit && parseQty(data.qty) > 0n ? data.qty : null,
        remark: data.remark,
        inspectedBy: currentActor(),
      },
      select: { id: true },
    })
    // 첫 검수: 예정 → 검수중
    if (line.asn.status === 'PLANNED') {
      await tx.asn.update({ where: { id: line.asnId }, data: { status: 'INSPECTING' } })
    }
    return created
  })
}

// 지우기: 확정하지 않은 검수만, 마감된 ASN은 불가. 남은 검수·확정이 없으면 ASN은 다시 예정
export async function deleteInspection(id: bigint) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.inboundInspection.findUnique({
      where: { id },
      select: { asnId: true, confirmedQty: true, asn: { select: { status: true } } },
    })
    if (!found) throw new ActionError('NOT_FOUND', '검수 기록을 찾을 수 없습니다.')
    if (parseQty(found.confirmedQty.toString()) > 0n) {
      throw new ActionError('CONFLICT', '입고 확정한 검수는 지울 수 없습니다.')
    }
    if (found.asn.status === 'CLOSED') {
      throw new ActionError('CONFLICT', '마감된 ASN의 검수는 지울 수 없습니다.')
    }
    await tx.inboundInspection.delete({ where: { id } })
    const left = await tx.inboundInspection.count({ where: { asnId: found.asnId } })
    if (left === 0 && found.asn.status === 'INSPECTING') {
      await tx.asn.update({ where: { id: found.asnId }, data: { status: 'PLANNED' } })
    }
    return { count: 1 }
  })
}

// 검수 기록이 범위 안의 ASN 것인지 (서버 액션에서 먼저 확인)
export async function asnIdOfInspection(id: bigint) {
  const found = await prisma.inboundInspection.findUnique({
    where: { id },
    select: { asnId: true },
  })
  if (!found) throw new ActionError('NOT_FOUND', '검수 기록을 찾을 수 없습니다.')
  return found.asnId
}

export async function asnIdOfLine(id: bigint) {
  const found = await prisma.asnLine.findUnique({ where: { id }, select: { asnId: true } })
  if (!found) throw new ActionError('NOT_FOUND', 'ASN 줄을 찾을 수 없습니다.')
  return found.asnId
}
