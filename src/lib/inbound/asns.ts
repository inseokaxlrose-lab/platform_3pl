import 'server-only'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { nextDocumentNumber } from '@/lib/documents/doc-no'
import { effectiveItemOptions } from '@/lib/items/item-schema'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { scopeFilter, type DataScope } from '@/lib/scope/data-scope'
import { ACTIVE_ONLY, DELETED_ONLY, isActiveStatus } from '@/lib/status'
import { checkQtyDecimals, toBaseQty } from '@/lib/units/convert'
import { isYes } from '@/lib/yn'
import type { AsnCreateData, AsnData } from './asn-schema'

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

// 라인 → 저장할 값: 품목은 그 화주사의 사용 중인 품목, 단위는 기본단위 또는 품목의 환산단위
// 기본단위로 바꾼 수량이 기본단위 소수 자리를 넘으면 거부 (예: EA 정수인데 BOX 0.3 × 24 = 7.2)
async function lineRows(db: Db, shipperId: bigint, lines: AsnData['lines']) {
  const items = await db.item.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.itemId))] }, shipperId },
    select: {
      id: true,
      code: true,
      status: true,
      useLot: true,
      useExpiry: true,
      labelUnit: true,
      baseUnit: { select: { code: true, decimals: true } },
      units: { select: { convQty: true, unit: { select: { code: true, decimals: true } } } },
      shipper: { select: { useLot: true, useExpiry: true, labelUnit: true } },
    },
  })
  const byId = new Map(items.map((item) => [item.id, item]))

  return lines.map((line, index) => {
    const at = `${index + 1}번째 줄`
    const item = byId.get(line.itemId)
    if (!item) throw new ActionError('VALIDATION', `${at}: 이 화주사의 품목이 아닙니다.`)
    if (!isActiveStatus(item.status)) {
      throw new ActionError('VALIDATION', `${at}: 사용 중지된 품목입니다 (${item.code}).`)
    }

    // 입력 단위 → 입수량
    const isBase = line.unit === item.baseUnit.code
    const pack = item.units.find((u) => u.unit.code === line.unit)
    if (!isBase && !pack) {
      throw new ActionError('VALIDATION', `${at}: ${item.code}에 없는 단위입니다 (${line.unit}).`)
    }
    const unitDecimals = isBase ? item.baseUnit.decimals : pack!.unit.decimals
    if (!checkQtyDecimals(line.qty, unitDecimals)) {
      throw new ActionError(
        'VALIDATION',
        unitDecimals === 0
          ? `${at}: ${line.unit} 수량은 정수만 넣을 수 있습니다.`
          : `${at}: ${line.unit} 수량은 소수 ${unitDecimals}자리까지입니다.`,
      )
    }
    const expectedQty = isBase ? line.qty : toBaseQty(line.qty, pack!.convQty.toString())
    if (!checkQtyDecimals(expectedQty, item.baseUnit.decimals)) {
      throw new ActionError(
        'VALIDATION',
        `${at}: 기본단위로 바꾸면 ${expectedQty} ${item.baseUnit.code}라 소수 자리가 맞지 않습니다.`,
      )
    }

    // 로트·유통기한: 관리하지 않는 품목은 비워야 한다 (관리 품목은 ASN에서는 선택 — 실제 값은 검수에서)
    const options = effectiveItemOptions(
      {
        useLot: item.useLot as 'Y' | 'N' | null,
        useExpiry: item.useExpiry as 'Y' | 'N' | null,
        labelUnit: item.labelUnit,
      },
      {
        useLot: isYes(item.shipper.useLot),
        useExpiry: isYes(item.shipper.useExpiry),
        labelUnit: item.shipper.labelUnit,
      },
    )
    if (!options.useLot && line.lotNo) {
      throw new ActionError('VALIDATION', `${at}: 로트를 관리하지 않는 품목입니다 (${item.code}).`)
    }
    if (!options.useExpiry && line.expiryOn) {
      throw new ActionError(
        'VALIDATION',
        `${at}: 유통기한을 관리하지 않는 품목입니다 (${item.code}).`,
      )
    }

    return {
      lineNo: index + 1,
      itemId: item.id,
      expectedQty,
      entryUnit: isBase ? null : line.unit,
      entryQty: isBase ? null : line.qty,
      lotNo: line.lotNo,
      expiryOn: line.expiryOn ? new Date(`${line.expiryOn}T00:00:00.000Z`) : null,
      remark: line.remark,
    }
  })
}

const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`)

// 등록: 화주사는 사용 중이고 범위 안이어야 한다 (서버 액션이 범위를 먼저 검사)
export async function createAsn(data: AsnCreateData, channel: AsnChannelValue, scope: DataScope) {
  const operatorId = requireOperatorId()
  return prisma.$transaction(async (tx) => {
    const shipper = await tx.shipper.findFirst({
      where: { id: data.shipperId, ...ACTIVE_ONLY },
      select: { id: true },
    })
    if (!shipper) throw new ActionError('VALIDATION', '사용 중인 화주사를 골라 주세요.')
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
  })
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
