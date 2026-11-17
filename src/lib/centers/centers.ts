import 'server-only'
import { looksLikeSystemCode } from '@/config/master-codes'
import { TEMP_ZONE, type TempZoneKey } from '@/config/operator-codes'
import { ActionError } from '@/lib/actions/action-error'
import { currentActor, requireOperatorId } from '@/lib/actor'
import { assertCodeValues } from '@/lib/common-code/common-codes'
import { timeToDate } from '@/lib/format/time'
import { nextSystemCode } from '@/lib/master-code/system-code'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { prisma, type Db } from '@/lib/prisma'
import { DELETED_ONLY } from '@/lib/status'
import { toYn } from '@/lib/yn'
import { ensureCenterDefaults } from './center-defaults'
import {
  CENTER_CONTACT_ROLE_GROUP,
  type CenterCreateData,
  type CenterData,
  type CenterStatusInput,
} from './center-schema'

// 센터 저장 (docs/decisions/0026, 0073). 권한·데이터 범위 검사는 서버 액션에서 한다

// 센터코드 검사: 시스템 코드 모양 금지, 같은 운영사의 다른 센터와 중복 금지
async function assertCenterCode(db: Db, code: string) {
  if (looksLikeSystemCode('CENTER', code)) {
    throw new ActionError(
      'VALIDATION',
      `'${code}'는 시스템 코드 모양이라 센터코드로 쓸 수 없습니다.`,
    )
  }
  const owner = await db.center.findFirst({
    where: { operatorId: requireOperatorId(), code },
    select: { id: true },
  })
  if (owner) throw new ActionError('CONFLICT', `이미 사용 중인 센터코드입니다: ${code}`)
}

// 운영사 센터 수 제한 (max_center_cnt, NULL = 무제한)
async function assertCenterLimit(db: Db) {
  const operator = await db.operator.findUniqueOrThrow({
    where: { id: requireOperatorId() },
    select: { maxCenterCount: true },
  })
  if (operator.maxCenterCount === null) return
  const count = await db.center.count({ where: { operatorId: requireOperatorId() } })
  if (count >= operator.maxCenterCount) {
    throw new ActionError(
      'CONFLICT',
      `센터는 최대 ${operator.maxCenterCount}개까지 등록할 수 있습니다. (요금제 한도) 플랫폼 관리자에게 문의하세요.`,
    )
  }
}

// DB 칸으로 옮길 값 (담당자·온도대·기본 로케이션은 따로). 2차 칸은 보낸 것만 (undefined = 그대로)
function centerFields(data: CenterData) {
  const ynOrUndefined = (value: boolean | undefined) =>
    value === undefined ? undefined : toYn(value)
  const inheritYn = (value: boolean | null | undefined) =>
    value === undefined ? undefined : value === null ? null : toYn(value)
  return {
    name: data.name,
    nameEn: data.nameEn,
    shortName: data.shortName,
    type: data.type,
    openedOn: data.openedOn ? new Date(`${data.openedOn}T00:00:00.000Z`) : null,
    businessNumber: data.businessNumber,
    subBizNo: data.subBizNo,
    sortOrder: data.sortOrder,
    remark: data.remark,
    zipCode: data.zipCode,
    address: data.address,
    addressDetail: data.addressDetail,
    addressJibun: data.addressJibun,
    regionName: data.regionName,
    phone: data.phone,
    fax: data.fax,
    email: data.email,
    directions: data.directions,
    floorAreaM2: data.floorAreaM2,
    storageAreaM2: data.storageAreaM2,
    dockCount: data.dockCount,
    bondedYn: toYn(data.bondedYn),
    workStartTime: timeToDate(data.workStartTime),
    workEndTime: timeToDate(data.workEndTime),
    workDays: data.workDays,
    inboundCutoffTime: timeToDate(data.inboundCutoffTime),
    shipCutoffTime: timeToDate(data.shipCutoffTime),
    // 2차
    landAreaM2: data.landAreaM2,
    floorCount: data.floorCount,
    ceilingHeightM: data.ceilingHeightM,
    palletCapacity: data.palletCapacity,
    warehouseRegNo: data.warehouseRegNo,
    glnCode: data.glnCode,
    hazmatYn: ynOrUndefined(data.hazmatYn),
    foodStorageYn: ynOrUndefined(data.foodStorageYn),
    pharmaYn: ynOrUndefined(data.pharmaYn),
    timezone: data.timezone,
    allocRule: data.allocRule,
    useLot: inheritYn(data.useLot),
    useExpiry: inheritYn(data.useExpiry),
    useSerial: inheritYn(data.useSerial),
    // 보세가 아니면 보세 칸은 비운다 (DB 검사 조건 tb_center_bonded_check)
    ...(data.bondedYn
      ? {
          bondedType: data.bondedType,
          bondedLicenseNo: data.bondedLicenseNo,
          bondedAreaCode: data.bondedAreaCode,
          customsOfficeCode: data.customsOfficeCode,
        }
      : { bondedType: null, bondedLicenseNo: null, bondedAreaCode: null, customsOfficeCode: null }),
  }
}

// 담당자 저장: 줄 키가 있으면 고치고, 없으면 새로, 목록에서 빠진 줄은 지운다 (등록 정보 유지)
async function saveContacts(db: Db, centerId: bigint, contacts: CenterData['contacts']) {
  const existing = await db.centerContact.findMany({
    where: { centerId },
    select: { id: true, duty: true },
  })
  await assertCodeValues(
    db,
    CENTER_CONTACT_ROLE_GROUP,
    contacts.map((c) => c.duty),
    { label: '담당 업무', keep: existing.map((c) => c.duty) },
  )
  const existingIds = new Set(existing.map((c) => c.id))
  const keepIds = contacts.flatMap((c) => (c.id && existingIds.has(c.id) ? [c.id] : []))
  // 대표는 센터당 1명(고유 색인) → 지우고·내리는 것을 먼저
  await db.centerContact.deleteMany({ where: { centerId, id: { notIn: keepIds } } })
  await db.centerContact.updateMany({ where: { centerId }, data: { isPrimary: 'N' } })
  const actor = currentActor()
  const ids: bigint[] = []
  for (const [index, contact] of contacts.entries()) {
    const fields = {
      sortOrder: index,
      duty: contact.duty,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      isPrimary: toYn(contact.isPrimary),
      updatedBy: actor,
      updatedAt: new Date(),
    }
    if (contact.id && existingIds.has(contact.id)) {
      await db.centerContact.update({ where: { id: contact.id }, data: fields })
      ids.push(contact.id)
    } else {
      const created = await db.centerContact.create({
        data: { ...fields, centerId, createdBy: actor },
        select: { id: true },
      })
      ids.push(created.id)
    }
  }
  // 저장한 순서대로의 줄 키 (화면이 새 줄에 키를 채워 다음 저장에서 같은 줄로 고치게)
  return ids
}

// 취급 온도대 저장: 빠진 것은 지우고 새것만 만든다 (있던 것은 등록 정보 유지)
// 창고 온도대는 센터 취급 온도대 안에서만 (0074): 창고가 쓰는 온도대는 뺄 수 없다
async function saveTempZones(db: Db, centerId: bigint, zones: readonly string[]) {
  const inUse = await db.warehouse.findMany({
    where: { centerId, tempZone: { notIn: [...zones] } },
    select: { tempZone: true, name: true },
  })
  if (inUse.length > 0) {
    const names = [...new Set(inUse.map((w) => TEMP_ZONE.labels[w.tempZone as TempZoneKey]))]
    throw new ActionError(
      'CONFLICT',
      `창고가 쓰고 있는 온도대는 뺄 수 없습니다: ${names.join(', ')} (${inUse
        .slice(0, 3)
        .map((w) => w.name)
        .join(', ')}${inUse.length > 3 ? ` 외 ${inUse.length - 3}곳` : ''})`,
    )
  }
  // 권역설정에서 이 센터에 온도대별로 배정한 우편번호가 있으면 그 온도대도 뺄 수 없다 (0076)
  const assigned = await db.regionCenterMap.groupBy({
    by: ['tempZone'],
    where: { centerId, tempZone: { notIn: [...zones, 'ALL'] } },
    _count: true,
  })
  if (assigned.length > 0) {
    throw new ActionError(
      'CONFLICT',
      `권역설정에 배정된 온도대는 뺄 수 없습니다: ${assigned
        .map((a) => `${TEMP_ZONE.labels[a.tempZone as TempZoneKey] ?? a.tempZone} ${a._count}건`)
        .join(', ')}. 권역설정에서 먼저 다른 센터로 옮기세요.`,
    )
  }
  await db.centerTempZone.deleteMany({ where: { centerId, tempZoneCd: { notIn: [...zones] } } })
  const existing = await db.centerTempZone.findMany({
    where: { centerId },
    select: { tempZoneCd: true },
  })
  const have = new Set(existing.map((z) => z.tempZoneCd))
  const actor = currentActor()
  const add = zones.filter((z) => !have.has(z))
  if (add.length > 0) {
    await db.centerTempZone.createMany({
      data: add.map((tempZoneCd) => ({ centerId, tempZoneCd, createdBy: actor, updatedBy: actor })),
    })
  }
}

// 기본 로케이션: 이 센터의 사용 중인 로케이션만, 기본 입고 로케이션은 필수
async function assertDefaultLocations(db: Db, centerId: bigint, data: CenterData) {
  if (!data.defaultInboundLocId) {
    throw new ActionError('VALIDATION', '기본 입고 로케이션을 골라 주세요.')
  }
  const ids = [data.defaultInboundLocId, data.defaultOutboundLocId, data.defaultReturnLocId].filter(
    (id): id is bigint => id !== null,
  )
  const found = await db.location.count({
    where: { id: { in: ids }, status: 'ACTIVE', warehouse: { centerId, delYn: 'N' } },
  })
  if (found !== new Set(ids).size) {
    throw new ActionError(
      'VALIDATION',
      '기본 로케이션은 이 센터의 사용 중인 로케이션에서 골라 주세요.',
    )
  }
}

// 등록: 센터 수 제한 → 코드 검사 → 센터·담당자·온도대 → 대기 창고 3개·기본 로케이션 (한 트랜잭션)
// 기본 로케이션은 대기 창고의 DEFAULT로 자동 연결된다 (등록 화면에서는 고르지 않는다)
export async function createCenter(data: CenterCreateData) {
  return prisma.$transaction(async (tx) => {
    await assertCenterLimit(tx)
    await assertCenterCode(tx, data.code)
    const systemCode = await nextSystemCode('CENTER', tx)
    const center = await tx.center.create({
      data: {
        operatorId: requireOperatorId(),
        systemCode,
        code: data.code,
        status: 'PREPARING',
        ...centerFields(data),
      },
      select: { id: true },
    })
    await saveContacts(tx, center.id, data.contacts)
    await saveTempZones(tx, center.id, data.tempZones)
    await ensureCenterDefaults(tx, center.id)
    // 기본 로케이션 연결로 버전이 올라가므로 마지막 값을 돌려준다
    return tx.center.findUniqueOrThrow({
      where: { id: center.id },
      select: { id: true, systemCode: true, code: true, rowVersion: true },
    })
  })
}

// 수정: 코드·시스템 코드·상태는 바뀌지 않는다 (상태는 changeCenterStatus)
// rowVersion: 화면이 불러온 버전 (그 사이 다른 사람이 저장했으면 충돌)
export async function updateCenter(id: bigint, rowVersion: number, data: CenterData) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.center.findUnique({
      where: { id },
      select: { code: true, rowVersion: true },
    })
    assertRowVersion(current, rowVersion, '센터를 찾을 수 없습니다.')
    await assertDefaultLocations(tx, id, data)
    const saved = await withVersionGuard(() =>
      tx.center.update({
        where: { id, rowVersion },
        data: {
          ...centerFields(data),
          defaultInboundLocId: data.defaultInboundLocId,
          defaultOutboundLocId: data.defaultOutboundLocId,
          defaultReturnLocId: data.defaultReturnLocId,
        },
        select: { rowVersion: true },
      }),
    )
    const contactIds = await saveContacts(tx, id, data.contacts)
    await saveTempZones(tx, id, data.tempZones)
    return { id, code: current!.code, rowVersion: saved.rowVersion, contactIds }
  })
}

// 폐쇄할 수 없는 이유 (재고가 남았거나, 끝나지 않은 입고가 있거나, 권역설정에 배정된 우편번호가 있으면)
async function closeBlockers(db: Db, centerId: bigint) {
  const [stock, openAsns, regionMaps] = await Promise.all([
    db.stock.count({ where: { centerId, qty: { gt: 0 } } }),
    db.asn.count({ where: { centerId, status: { notIn: ['COMPLETED', 'CLOSED'] } } }),
    db.regionCenterMap.count({ where: { centerId } }),
  ])
  const reasons: string[] = []
  if (stock > 0) reasons.push(`재고가 남은 줄 ${stock}개`)
  if (openAsns > 0) reasons.push(`끝나지 않은 입고(ASN) ${openAsns}건`)
  if (regionMaps > 0) reasons.push(`권역설정에 배정된 우편번호 ${regionMaps}개(권역 재배정 필요)`)
  return reasons
}

// 상태 변경 (헤더 배지 → 상태 변경 팝업): 일시중지·폐쇄는 사유, 폐쇄는 운영 종료일·재고·입고 확인
export async function changeCenterStatus(
  id: bigint,
  rowVersion: number,
  input: { status: string; reason: string | null; closedOn: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.center.findUnique({
      where: { id },
      select: { rowVersion: true, status: true },
    })
    assertRowVersion(current, rowVersion, '센터를 찾을 수 없습니다.')
    if (input.status === 'CLOSED') {
      const reasons = await closeBlockers(tx, id)
      if (reasons.length > 0) {
        throw new ActionError(
          'CONFLICT',
          `폐쇄할 수 없습니다: ${reasons.join(', ')}. 정리한 뒤 다시 시도하세요.`,
        )
      }
    }
    const saved = await withVersionGuard(() =>
      tx.center.update({
        where: { id, rowVersion },
        data: {
          status: input.status,
          // 준비중·운영중으로 돌아가면 사유는 지운다
          statusReason:
            input.status === 'SUSPENDED' || input.status === 'CLOSED' ? input.reason : null,
          ...(input.status === 'CLOSED'
            ? { closedOn: new Date(`${input.closedOn}T00:00:00.000Z`) }
            : { closedOn: null }),
        },
        select: { rowVersion: true, status: true },
      }),
    )
    return { id, ...saved }
  })
}

// 여러 센터 상태를 한꺼번에 운영중·일시중지로 (목록 일괄 처리, 폐쇄는 개별 화면에서만)
export async function changeCentersStatus(
  ids: bigint[],
  status: 'ACTIVE' | 'SUSPENDED',
  reason: string | null,
) {
  const { count } = await prisma.center.updateMany({
    where: { id: { in: ids }, status: { not: 'CLOSED' } },
    data: { status, statusReason: status === 'SUSPENDED' ? reason : null },
  })
  return { count }
}

// 삭제할 수 없는 이유: 쓰인 적 있으면 (일반 창고·재고 이력·입고·권역설정 배정·이용 화주사·소속 사용자)
async function deleteBlockers(db: Db, centerId: bigint) {
  const [general, stock, asns, zones, shippers, users] = await Promise.all([
    db.warehouse.count({ where: { centerId, systemYn: 'N' } }),
    db.stock.count({ where: { centerId } }),
    db.asn.count({ where: { centerId } }),
    db.regionCenterMap.count({ where: { centerId } }),
    db.shipperCenter.count({ where: { centerId } }),
    db.userCenter.count({ where: { centerId } }),
  ])
  return [
    general > 0 && `보관 창고 ${general}개`,
    stock > 0 && `재고 이력`,
    asns > 0 && `입고(ASN) ${asns}건`,
    zones > 0 && `권역설정 배정 우편번호 ${zones}개`,
    shippers > 0 && `이용 화주사 ${shippers}곳`,
    users > 0 && `소속 사용자 ${users}명`,
  ].filter((reason): reason is string => Boolean(reason))
}

// 삭제 (논리 삭제): 한 번도 쓰이지 않은 센터만. 대기 창고·기본 로케이션도 함께 숨긴다
export async function deleteCenter(id: bigint) {
  return prisma.$transaction(async (tx) => {
    const center = await tx.center.findUnique({ where: { id }, select: { id: true } })
    if (!center) throw new ActionError('NOT_FOUND', '센터를 찾을 수 없습니다.')
    const reasons = await deleteBlockers(tx, id)
    if (reasons.length > 0) {
      throw new ActionError(
        'CONFLICT',
        `쓰인 적 있는 센터는 삭제할 수 없습니다 (${reasons.join(', ')}). 운영 상태를 '폐쇄'로 바꿔 주세요.`,
      )
    }
    await tx.location.updateMany({ where: { warehouse: { centerId: id } }, data: DELETED_ONLY })
    await tx.warehouse.updateMany({ where: { centerId: id }, data: DELETED_ONLY })
    await tx.center.update({ where: { id }, data: DELETED_ONLY })
    return { id }
  })
}

export type { CenterStatusInput }
