import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { currentActor, requireOperatorId } from '@/lib/actor'
import { nextDocumentNumber } from '@/lib/documents/doc-no'
import { ASN_ITEM_SELECT, itemLotOptions } from '@/lib/inbound/asns'
import { prisma } from '@/lib/prisma'
import { labelQuantities, parseQty, qtyText } from '@/lib/units/convert'
import { buildLabelPayload, LABEL_FORMAT_VERSION } from './label-payload'

// 관리 라벨 발행 (docs/decisions/0054, 0003 결정 6)
// 검수 결과 하나 → 라벨 여러 장: 정상 검수 수량 ÷ 라벨 단위(PLT·BOX) 입수량, 올림, 마지막 장은 나머지
// 예: 검수 3,000 EA, PLT = 1,440 EA → 3장 (1,440 / 1,440 / 120)
// 한 번 만든 라벨은 그대로 두고(번호 고정), 다시 인쇄하면 인쇄 횟수만 는다 (재발행)

export async function ensureLabels(inspectionId: bigint) {
  const operatorId = requireOperatorId()
  return prisma.$transaction(async (tx) => {
    const existing = await tx.inboundLabel.findMany({
      where: { inspectionId },
      orderBy: { seq: 'asc' },
      select: { id: true },
    })
    if (existing.length > 0) return { ids: existing.map((l) => l.id), created: 0 }

    const inspection = await tx.inboundInspection.findUnique({
      where: { id: inspectionId },
      select: {
        lotNo: true,
        expiryOn: true,
        inspectedQty: true,
        item: { select: ASN_ITEM_SELECT },
        asn: {
          select: { center: { select: { code: true } }, shipper: { select: { code: true } } },
        },
      },
    })
    if (!inspection) throw new ActionError('NOT_FOUND', '검수 기록을 찾을 수 없습니다.')
    const item = inspection.item
    const total = parseQty(inspection.inspectedQty.toString())
    if (total <= 0n) {
      throw new ActionError(
        'CONFLICT',
        '정상 검수 수량이 없어 라벨을 만들 수 없습니다 (불량만 있음).',
      )
    }
    const labelUnit = itemLotOptions(item).labelUnit
    const pack = item.units.find((u) => u.unit.code === labelUnit)
    if (!pack) {
      throw new ActionError(
        'CONFLICT',
        `품목 ${item.code}에 라벨 단위(${labelUnit})의 입수량이 없습니다. 품목에 ${labelUnit} 환산단위를 넣어 주세요.`,
      )
    }
    let quantities: string[]
    try {
      quantities = labelQuantities(qtyText(total), pack.convQty.toString())
    } catch (error) {
      throw new ActionError('CONFLICT', (error as Error).message)
    }

    const ids: bigint[] = []
    for (const [index, qty] of quantities.entries()) {
      const labelNo = await nextDocumentNumber('LABEL', tx)
      const created = await tx.inboundLabel.create({
        data: {
          operatorId,
          labelNo,
          inspectionId,
          seq: index + 1,
          total: quantities.length,
          labelUnit,
          qty,
          formatVersion: LABEL_FORMAT_VERSION,
          payload: buildLabelPayload({
            labelNo,
            centerCode: inspection.asn.center.code,
            shipperCode: inspection.asn.shipper.code,
            itemCode: item.code,
            lotNo: inspection.lotNo,
            expiryOn: inspection.expiryOn?.toISOString().slice(0, 10) ?? null,
            qty,
            unit: item.baseUnit.code,
          }),
          createdBy: currentActor(),
        },
        select: { id: true },
      })
      ids.push(created.id)
    }
    return { ids, created: ids.length }
  })
}

// 인쇄 기록: 인쇄할 때마다 횟수 +1, 마지막 인쇄 일시·사람
export async function markLabelsPrinted(ids: bigint[]) {
  const { count } = await prisma.inboundLabel.updateMany({
    where: { id: { in: ids } },
    data: {
      printCount: { increment: 1 },
      lastPrintedAt: new Date(),
      lastPrintedBy: currentActor(),
    },
  })
  return { count }
}
