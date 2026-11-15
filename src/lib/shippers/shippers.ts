import 'server-only'
import { looksLikeSystemCode } from '@/config/master-codes'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { assertCodeValues } from '@/lib/common-code/common-codes'
import { CONTACT_ROLE_GROUP } from '@/lib/contacts/contact-schema'
import { saveExternalCodes } from '@/lib/master-code/external-codes'
import { nextSystemCode } from '@/lib/master-code/system-code'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { prisma, type Db } from '@/lib/prisma'
import { isActiveStatus } from '@/lib/status'
import { toYn } from '@/lib/yn'
import type { ShipperData } from './shipper-schema'

// 화주사 저장 (docs/decisions/0035). 권한·데이터 범위 검사는 서버 액션에서 한다

// 사용자 코드: 시스템 코드 모양 금지(자기 것 제외), 전체에서 중복 금지
async function assertShipperCode(db: Db, code: string, ownSystemCode: string, exceptId?: bigint) {
  if (code !== ownSystemCode && looksLikeSystemCode('SHIPPER', code)) {
    throw new ActionError(
      'VALIDATION',
      `'${code}'는 시스템 코드 모양이라 화주사 코드로 쓸 수 없습니다.`,
    )
  }
  const owner = await db.shipper.findFirst({
    where: { operatorId: requireOperatorId(), code },
    select: { id: true },
  })
  if (owner && owner.id !== exceptId) {
    throw new ActionError('CONFLICT', `이미 있는 화주사 코드입니다: ${code}`)
  }
}

// 이용 센터: 모두 있어야 하고, 새로 붙이는 센터는 사용 중이어야 한다 (이미 연결된 센터는 그대로 둘 수 있다)
async function assertCenters(db: Db, centerIds: bigint[], keep: bigint[] = []) {
  const centers = await db.center.findMany({
    where: { id: { in: centerIds } },
    select: { id: true, code: true, status: true },
  })
  if (centers.length !== centerIds.length) {
    throw new ActionError('NOT_FOUND', '찾을 수 없는 센터가 섞여 있습니다.')
  }
  const inactive = centers.filter((c) => !isActiveStatus(c.status) && !keep.includes(c.id))
  if (inactive.length > 0) {
    throw new ActionError(
      'CONFLICT',
      `사용 중지된 센터는 이용 센터로 붙일 수 없습니다: ${inactive.map((c) => c.code).join(', ')}`,
    )
  }
}

// 화주사 본문 칸 (이용 센터·담당자·외부 코드 제외)
function fieldsOf(data: ShipperData) {
  const { centerIds, contacts, externalCodes, code, ...fields } = data
  void centerIds
  void contacts
  void externalCodes
  void code
  // 예/아니오 칸은 DB에 'Y'/'N'으로
  return { ...fields, useLot: toYn(fields.useLot), useExpiry: toYn(fields.useExpiry) }
}

const contactRows = (shipperId: bigint, contacts: ShipperData['contacts']) =>
  contacts.map((contact, index) => ({
    ...contact,
    isPrimary: toYn(contact.isPrimary),
    shipperId,
    sortOrder: index,
  }))

// 등록 (한 트랜잭션: 시스템 코드 → 화주사 → 이용 센터 → 담당자 → 외부 코드)
export async function createShipper(data: ShipperData) {
  return prisma.$transaction(async (tx) => {
    const systemCode = await nextSystemCode('SHIPPER', tx)
    const code = data.code || systemCode
    await assertShipperCode(tx, code, systemCode)
    await assertCenters(tx, data.centerIds)
    await assertCodeValues(
      tx,
      CONTACT_ROLE_GROUP,
      data.contacts.map((c) => c.duty),
      { label: '담당 업무' },
    )
    const shipper = await tx.shipper.create({
      data: {
        ...fieldsOf(data),
        operatorId: requireOperatorId(),
        systemCode,
        code,
        centers: { create: data.centerIds.map((centerId) => ({ centerId })) },
      },
      select: { id: true, systemCode: true, code: true, rowVersion: true },
    })
    await tx.shipperContact.createMany({ data: contactRows(shipper.id, data.contacts) })
    await saveExternalCodes(tx, 'SHIPPER', shipper.id, data.externalCodes)
    return shipper
  })
}

// 수정: 시스템 코드는 바뀌지 않는다. 이용 센터·담당자는 통째로 바꾼다
// TODO(재고 작업, ROADMAP M4): 이용 센터를 뺄 때 그 센터에 이 화주사 재고가 있으면 막는다
// rowVersion: 화면이 불러온 버전 (그 사이 다른 사람이 저장했으면 충돌)
export async function updateShipper(id: bigint, rowVersion: number, data: ShipperData) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.shipper.findUnique({
      where: { id },
      select: {
        rowVersion: true,
        systemCode: true,
        centers: { select: { centerId: true } },
        contacts: { select: { duty: true } },
      },
    })
    assertRowVersion(found, rowVersion, '화주사를 찾을 수 없습니다.')
    const current = found!
    const code = data.code || current.systemCode
    await assertShipperCode(tx, code, current.systemCode, id)
    await assertCenters(
      tx,
      data.centerIds,
      current.centers.map((c) => c.centerId),
    )
    await assertCodeValues(
      tx,
      CONTACT_ROLE_GROUP,
      data.contacts.map((c) => c.duty),
      { label: '담당 업무', keep: current.contacts.map((c) => c.duty) },
    )
    const saved = await withVersionGuard(() =>
      tx.shipper.update({
        where: { id, rowVersion },
        data: { ...fieldsOf(data), code },
        select: { rowVersion: true },
      }),
    )
    await tx.shipperCenter.deleteMany({ where: { shipperId: id } })
    await tx.shipperCenter.createMany({
      data: data.centerIds.map((centerId) => ({ shipperId: id, centerId })),
    })
    await tx.shipperContact.deleteMany({ where: { shipperId: id } })
    await tx.shipperContact.createMany({ data: contactRows(id, data.contacts) })
    await saveExternalCodes(tx, 'SHIPPER', id, data.externalCodes)
    return { id, code, rowVersion: saved.rowVersion }
  })
}
