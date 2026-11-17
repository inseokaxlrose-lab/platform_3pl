import 'server-only'
import {
  shipperDefaultsSelect,
  shipperItemDefaults,
  type ShipperDefaultsRow,
} from '@/lib/shippers/shipper-defaults'
import { resolveUnitDecimals, unitDecimalsSelect } from '@/lib/units/unit-status'
import { ActionError } from '@/lib/actions/action-error'
import { currentActor, requireOperatorId } from '@/lib/actor'
import { nextDocumentNumber } from '@/lib/documents/doc-no'
import { effectiveItemOptions } from '@/lib/items/item-schema'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { ACTIVE_ONLY, DELETED_ONLY, isActiveStatus } from '@/lib/status'
import { checkQtyDecimals, parseQty, qtyText, toBaseQty } from '@/lib/units/convert'
import { isYes } from '@/lib/yn'
import type { AsnCreateData, AsnData } from './asn-schema'
import { refreshPutawayStatus } from './putaways'

// ASN 등록·수정·삭제 (docs/decisions/0047·0048) — 운영사 화면(대리 등록)·화주 포털·엑셀 업로드 공용
// 수량은 입력 단위 그대로 받아 기본단위로 바꿔 저장한다 (예정 수량 = 입력 수량 × 입수량, convert.ts)

// 데이터 범위: 센터 직원 = 소속 센터의 ASN, 화주사 사용자 = 자기 화주사의 ASN
export const ASN_SCOPE = { center: 'centerId', shipper: 'shipperId' }

export type AsnChannelValue = 'PORTAL' | 'PROXY' | 'EXCEL'

// 고른 ASN이 모두 범위 안에 있어야 한다 (하나라도 밖·없음이면 전체 거부). deleted: 지운 것 중에서
export async function assertAsnsInScope(ids: bigint[], scope: DataScope, deleted = false) {
  const unique = [...new Set(ids)]
  const count = await prisma.asn.count({
    where: {
      AND: [{ id: { in: unique } }, scopeFilter(scope, ASN_SCOPE), deleted ? DELETED_ONLY : {}],
    },
  })
  if (count !== unique.length)
    throw new ActionError('NOT_FOUND', '찾을 수 없는 ASN이 섞여 있습니다.')
  return unique
}

// 센터 검사: 사용 중이고, 사용자 범위 안이고, 화주사가 이용하는 센터
async function assertCenter(db: Db, shipperId: bigint, centerId: bigint, scope: DataScope) {
  if (scope.kind === 'CENTERS' && !scope.centerIds.includes(centerId)) {
    throw new ActionError('NOT_FOUND', '센터를 찾을 수 없습니다.')
  }
  const center = await db.center.findFirst({
    where: { id: centerId, ...ACTIVE_ONLY, shippers: { some: { shipperId } } },
    select: { id: true },
  })
  if (!center) {
    throw new ActionError('VALIDATION', '이 화주사가 이용하는 사용 중인 센터를 골라 주세요.')
  }
}

// ASN 라인에 쓸 품목 정보 (단위·환산·관리 옵션)
// operatorId: 단위 소수 자리수를 이 운영사의 값으로 읽기 위해 (0079) — 조회 뒤 resolveUnitDecimals
export const asnItemSelect = (operatorId: bigint) =>
  ({
    id: true,
    code: true,
    status: true,
    useLot: true,
    useExpiry: true,
    labelUnit: true,
    baseUnit: { select: { code: true, ...unitDecimalsSelect(operatorId) } },
    units: {
      select: {
        convQty: true,
        unit: { select: { code: true, ...unitDecimalsSelect(operatorId) } },
      },
    },
    shipper: { select: shipperDefaultsSelect },
  }) as const

export type AsnLineItem = {
  id: bigint
  code: string
  status: string
  useLot: string | null
  useExpiry: string | null
  labelUnit: 'PLT' | 'BOX' | null
  baseUnit: { code: string; decimals: number }
  units: { convQty: { toString(): string }; unit: { code: string; decimals: number } }[]
  shipper: ShipperDefaultsRow
}

type AsnLineValue = AsnData['lines'][number]

// 입력 단위·수량 → 기본단위 수량 (단위는 품목의 기본단위 또는 환산단위, 소수 자리 검사 두 번)
// 예: BOX 3 (입수량 24) → 72 EA. 기본단위로 바꾼 수가 기본단위 소수 자리를 넘으면 거부 (EA인데 BOX 0.3 = 7.2)
// 결과의 entryUnit·entryQty는 환산단위로 넣었을 때만 (화면 표시용)
export function entryToBase(item: AsnLineItem, unit: string, qty: string) {
  const fail = (message: string): never => {
    throw new ActionError('VALIDATION', message)
  }
  const isBase = unit === item.baseUnit.code
  const pack = item.units.find((u) => u.unit.code === unit)
  if (!isBase && !pack) fail(`${item.code}에 없는 단위입니다 (${unit}).`)
  const unitDecimals = isBase ? item.baseUnit.decimals : pack!.unit.decimals
  if (!checkQtyDecimals(qty, unitDecimals)) {
    fail(
      unitDecimals === 0
        ? `${unit} 수량은 정수만 넣을 수 있습니다.`
        : `${unit} 수량은 소수 ${unitDecimals}자리까지입니다.`,
    )
  }
  const baseQty = isBase ? qty : toBaseQty(qty, pack!.convQty.toString())
  if (!checkQtyDecimals(baseQty, item.baseUnit.decimals)) {
    fail(`기본단위로 바꾸면 ${baseQty} ${item.baseUnit.code}라 소수 자리가 맞지 않습니다.`)
  }
  return { baseQty, entryUnit: isBase ? null : unit, entryQty: isBase ? null : qty }
}

// 품목에 실제로 적용되는 로트·유통기한 관리 여부 (품목이 비어 있으면 화주사 기본값)
export function itemLotOptions(item: AsnLineItem) {
  return effectiveItemOptions(
    {
      useLot: item.useLot as 'Y' | 'N' | null,
      useExpiry: item.useExpiry as 'Y' | 'N' | null,
      labelUnit: item.labelUnit,
    },
    shipperItemDefaults(item.shipper),
  )
}

// 라인 하나 → 저장할 값 (문제가 있으면 그 문구로 ActionError — 줄 번호는 부르는 쪽이 붙인다)
// 품목은 그 화주사의 사용 중인 품목, 단위는 기본단위 또는 품목의 환산단위
// 기본단위로 바꾼 수량이 기본단위 소수 자리를 넘으면 거부 (예: EA 정수인데 BOX 0.3 × 24 = 7.2)
export function resolveAsnLine(item: AsnLineItem | undefined, line: AsnLineValue) {
  const fail = (message: string): never => {
    throw new ActionError('VALIDATION', message)
  }
  if (!item) return fail('이 화주사의 품목이 아닙니다.')
  if (!isActiveStatus(item.status)) fail(`사용 중지된 품목입니다 (${item.code}).`)

  const { baseQty: expectedQty, entryUnit, entryQty } = entryToBase(item, line.unit, line.qty)

  // 로트·유통기한: 관리하지 않는 품목은 비워야 한다 (관리 품목은 ASN에서는 선택 — 실제 값은 검수에서)
  const options = itemLotOptions(item)
  if (!options.useLot && line.lotNo) fail(`로트를 관리하지 않는 품목입니다 (${item.code}).`)
  if (!options.useExpiry && line.expiryOn) {
    fail(`유통기한을 관리하지 않는 품목입니다 (${item.code}).`)
  }

  return {
    itemId: item.id,
    expectedQty,
    entryUnit,
    entryQty,
    lotNo: line.lotNo,
    expiryOn: line.expiryOn ? new Date(`${line.expiryOn}T00:00:00.000Z`) : null,
    remark: line.remark,
  }
}

// 라인 전체 → 저장할 값 (오류 문구 앞에 "N번째 줄")
async function lineRows(db: Db, shipperId: bigint, lines: AsnData['lines']) {
  const items = await db.item.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.itemId))] }, shipperId },
    select: asnItemSelect(requireOperatorId()),
  })
  // 단위 소수 자리수: 시스템 단위는 이 운영사의 값 (0079)
  resolveUnitDecimals(items)
  const byId = new Map(items.map((item) => [item.id, item]))
  return lines.map((line, index) => {
    try {
      return { lineNo: index + 1, ...resolveAsnLine(byId.get(line.itemId), line) }
    } catch (error) {
      if (error instanceof ActionError) {
        throw new ActionError(error.code, `${index + 1}번째 줄: ${error.message}`)
      }
      throw error
    }
  })
}

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`)

// 등록: 화주사는 사용 중이고 범위 안이어야 한다 (서버 액션이 범위를 먼저 검사)
export async function createAsn(data: AsnCreateData, channel: AsnChannelValue, scope: DataScope) {
  return prisma.$transaction((tx) => createAsnInTx(tx, data, channel, scope))
}

// 등록 (부르는 쪽의 트랜잭션 안에서 — 엑셀 업로드는 여러 ASN을 한 트랜잭션으로 전부 아니면 하나도 안)
export async function createAsnInTx(
  tx: Db,
  data: AsnCreateData,
  channel: AsnChannelValue,
  scope: DataScope,
) {
  const operatorId = requireOperatorId()
  const shipper = await tx.shipper.findFirst({
    where: { id: data.shipperId, ...ACTIVE_ONLY },
    select: { id: true },
  })
  if (!shipper)
    throw new ActionError(
      'VALIDATION',
      '운영중인 화주사를 골라 주세요. (준비중·일시정지 화주사는 입고를 받지 않습니다)',
    )
  await assertCenter(tx, data.shipperId, data.centerId, scope)
  const lines = await lineRows(tx, data.shipperId, data.lines)
  const asn = await tx.asn.create({
    data: {
      operatorId,
      centerId: data.centerId,
      shipperId: data.shipperId,
      asnNo: await nextDocumentNumber('ASN', tx),
      channel,
      expectedOn: toDate(data.expectedOn),
      shipperRefNo: data.shipperRefNo,
      remark: data.remark,
    },
    select: { id: true, asnNo: true, rowVersion: true },
  })
  await tx.asnLine.createMany({
    data: lines.map((line) => ({ ...line, operatorId, asnId: asn.id })),
  })
  return asn
}

// 수정: 예정(PLANNED) 상태에서만, 라인은 통째로 바꾼다
export async function updateAsn(id: bigint, rowVersion: number, data: AsnData, scope: DataScope) {
  const operatorId = requireOperatorId()
  return prisma.$transaction(async (tx) => {
    const found = await tx.asn.findUnique({
      where: { id },
      select: { rowVersion: true, status: true, shipperId: true },
    })
    assertRowVersion(found, rowVersion, 'ASN을 찾을 수 없습니다.')
    const current = found!
    if (current.status !== 'PLANNED') {
      throw new ActionError('CONFLICT', '검수가 시작된 ASN은 고칠 수 없습니다.')
    }
    await assertCenter(tx, current.shipperId, data.centerId, scope)
    const lines = await lineRows(tx, current.shipperId, data.lines)
    const saved = await withVersionGuard(() =>
      tx.asn.update({
        where: { id, rowVersion },
        data: {
          centerId: data.centerId,
          expectedOn: toDate(data.expectedOn),
          shipperRefNo: data.shipperRefNo,
          remark: data.remark,
        },
        select: { id: true, asnNo: true, rowVersion: true },
      }),
    )
    await tx.asnLine.deleteMany({ where: { asnId: id } })
    await tx.asnLine.createMany({ data: lines.map((line) => ({ ...line, operatorId, asnId: id })) })
    return saved
  })
}

// 지우기: 예정(PLANNED) 상태만, 논리 삭제
export async function deleteAsns(ids: bigint[]) {
  const started = await prisma.asn.count({ where: { id: { in: ids }, status: { not: 'PLANNED' } } })
  if (started > 0) {
    throw new ActionError(
      'CONFLICT',
      '검수가 시작된 ASN은 지울 수 없습니다. 잔량 마감으로 끝내 주세요.',
    )
  }
  const { count } = await prisma.asn.updateMany({
    where: { id: { in: ids }, status: 'PLANNED' },
    data: DELETED_ONLY,
  })
  return { count }
}

// 잔량 마감 (0052): 더 도착하지 않을 잔량을 사유와 함께 마감한다
// - 마감할 수 있는 상태: 예정·검수중·부분확정 (확정완료·마감은 불가), 잔량이 하나라도 있어야 한다
// - 줄마다 지금 잔량(예정 − 누적 확정, 0 이상)을 마감 수량으로 남긴다 (보고서용)
// - 마감 후에는 검수·확정 불가, 이미 확정된 재고의 적치는 계속 가능 (0003 결정 5)
export async function closeAsn(id: bigint, rowVersion: number, reason: string) {
  const text = reason.trim()
  if (!text) throw new ActionError('VALIDATION', '마감 사유를 입력해 주세요.')
  if (text.length > 200) throw new ActionError('VALIDATION', '마감 사유는 200자까지입니다.')
  return prisma.$transaction(async (tx) => {
    const found = await tx.asn.findUnique({
      where: { id },
      select: {
        rowVersion: true,
        status: true,
        lines: { select: { id: true, expectedQty: true, confirmedQty: true } },
      },
    })
    assertRowVersion(found, rowVersion, 'ASN을 찾을 수 없습니다.')
    const asn = found!
    if (asn.status === 'CLOSED') throw new ActionError('CONFLICT', '이미 마감된 ASN입니다.')
    if (asn.status === 'COMPLETED') {
      throw new ActionError('CONFLICT', '확정완료된 ASN은 마감할 잔량이 없습니다.')
    }
    const remains = asn.lines.map((line) => {
      const left = parseQty(line.expectedQty.toString()) - parseQty(line.confirmedQty.toString())
      return { id: line.id, closedQty: left > 0n ? qtyText(left) : '0' }
    })
    if (remains.every((r) => r.closedQty === '0')) {
      throw new ActionError('CONFLICT', '마감할 잔량이 없습니다.')
    }
    const saved = await withVersionGuard(() =>
      tx.asn.update({
        where: { id, rowVersion },
        data: {
          status: 'CLOSED',
          closeReason: text,
          closedAt: new Date(),
          closedBy: currentActor(),
        },
        select: { id: true, asnNo: true, rowVersion: true },
      }),
    )
    for (const r of remains) {
      await tx.asnLine.update({ where: { id: r.id }, data: { closedQty: r.closedQty } })
    }
    // 확정분을 이미 모두 적치했으면 마감과 함께 적치완료
    await refreshPutawayStatus(tx, id)
    return { ...saved, rowVersion: saved.rowVersion + 1 }
  })
}
