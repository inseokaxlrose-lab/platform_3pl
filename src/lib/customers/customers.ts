import 'server-only'
import { looksLikeSystemCode } from '@/config/master-codes'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { assertCodeValues } from '@/lib/common-code/common-codes'
import { CONTACT_ROLE_GROUP } from '@/lib/contacts/contact-schema'
import { deleteExternalCodes, saveExternalCodes } from '@/lib/master-code/external-codes'
import { nextSystemCode } from '@/lib/master-code/system-code'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { assertAllFound, assertNoCodeConflict } from '@/lib/soft-delete'
import { DELETED_ONLY, NOT_DELETED, isActiveStatus, toStatus } from '@/lib/status'
import { toYn } from '@/lib/yn'
import type { CustomerCreateData, CustomerData } from './customer-schema'

// 거래처 저장 (docs/decisions/0043). 권한·데이터 범위 검사는 서버 액션에서 한다
// - 화주사는 등록 후 바꿀 수 없다 (출고 기록이 화주사에 묶인다)
// - 담당자는 저장할 때마다 통째로 바꾼다 (거래처의 이력으로 본다)

// 거래처코드: 시스템 코드 모양 금지(자기 것 제외), 같은 화주사 안에서 중복 금지
async function assertCustomerCode(
  db: Db,
  shipperId: bigint,
  code: string,
  ownSystemCode: string,
  exceptId?: bigint,
) {
  if (code !== ownSystemCode && looksLikeSystemCode('CUSTOMER', code)) {
    throw new ActionError(
      'VALIDATION',
      `'${code}'는 시스템 코드 모양이라 거래처코드로 쓸 수 없습니다.`,
    )
  }
  const owner = await db.customer.findFirst({ where: { shipperId, code }, select: { id: true } })
  if (owner && owner.id !== exceptId) {
    throw new ActionError('CONFLICT', `이 화주사에 이미 있는 거래처코드입니다: ${code}`)
  }
}

// DB 칸으로 옮길 값 (담당자·외부 코드·코드 제외)
function fieldsOf(data: CustomerData) {
  const { contacts, externalCodes, code, ...fields } = data
  void contacts
  void externalCodes
  void code
  return fields
}

const contactRows = (customerId: bigint, contacts: CustomerData['contacts']) =>
  contacts.map((contact, index) => ({
    ...contact,
    isPrimary: toYn(contact.isPrimary),
    customerId,
    sortOrder: index,
  }))

// 등록 (한 트랜잭션: 시스템 코드 → 거래처 → 담당자 → 외부 코드)
export async function createCustomer(data: CustomerCreateData) {
  return prisma.$transaction(async (tx) => {
    const shipper = await tx.shipper.findUnique({
      where: { id: data.shipperId },
      select: { status: true },
    })
    if (!shipper) throw new ActionError('NOT_FOUND', '화주사를 찾을 수 없습니다.')
    if (!isActiveStatus(shipper.status)) {
      throw new ActionError('CONFLICT', '사용 중지된 화주사에는 거래처를 등록할 수 없습니다.')
    }
    const systemCode = await nextSystemCode('CUSTOMER', tx)
    const code = data.code || systemCode
    await assertCustomerCode(tx, data.shipperId, code, systemCode)
    await assertCodeValues(
      tx,
      CONTACT_ROLE_GROUP,
      data.contacts.map((c) => c.duty),
      { label: '담당 업무' },
    )
    const { shipperId, ...rest } = data
    const customer = await tx.customer.create({
      data: {
        ...fieldsOf(rest),
        operatorId: requireOperatorId(),
        shipperId,
        systemCode,
        code,
      },
      select: { id: true, systemCode: true, code: true, rowVersion: true },
    })
    await tx.customerContact.createMany({ data: contactRows(customer.id, data.contacts) })
    await saveExternalCodes(tx, 'CUSTOMER', customer.id, data.externalCodes)
    return customer
  })
}

// 수정: 시스템 코드·화주사는 바뀌지 않는다. 거래처코드를 비우면 시스템 코드로
// rowVersion: 화면이 불러온 버전 (그 사이 다른 사람이 저장했으면 충돌)
export async function updateCustomer(id: bigint, rowVersion: number, data: CustomerData) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.customer.findUnique({
      where: { id },
      select: {
        rowVersion: true,
        systemCode: true,
        shipperId: true,
        contacts: { select: { duty: true } },
      },
    })
    assertRowVersion(found, rowVersion, '거래처를 찾을 수 없습니다.')
    const current = found!
    const code = data.code || current.systemCode
    await assertCustomerCode(tx, current.shipperId, code, current.systemCode, id)
    await assertCodeValues(
      tx,
      CONTACT_ROLE_GROUP,
      data.contacts.map((c) => c.duty),
      { label: '담당 업무', keep: current.contacts.map((c) => c.duty) },
    )
    const saved = await withVersionGuard(() =>
      tx.customer.update({
        where: { id, rowVersion },
        data: { ...fieldsOf(data), code },
        select: { id: true, code: true, rowVersion: true },
      }),
    )
    await tx.customerContact.deleteMany({ where: { customerId: id } })
    await tx.customerContact.createMany({ data: contactRows(id, data.contacts) })
    await saveExternalCodes(tx, 'CUSTOMER', id, data.externalCodes)
    return saved
  })
}

// 사용 중지 / 다시 사용 (여러 건)
export async function setCustomersActive(ids: bigint[], isActive: boolean) {
  const { count } = await prisma.customer.updateMany({
    where: { id: { in: ids } },
    data: { status: toStatus(isActive) },
  })
  return { count }
}

// 쓰인 적 있는 거래처 id (출고 기록이 있음)
// TODO(출고 작업, MVP 이후): 출고·배송요청 표가 생기면 여기서 검사한다. 지금은 쓰일 곳이 없어 빈 목록
export async function findUsedCustomerIds(ids: bigint[]): Promise<bigint[]> {
  void ids
  return []
}

// 지우기: 쓰인 적 없는 거래처만, 논리 삭제 (되살릴 수 있다). 외부 코드는 지운다
export async function deleteCustomers(ids: bigint[]) {
  if ((await findUsedCustomerIds(ids)).length > 0) {
    throw new ActionError(
      'CONFLICT',
      '출고 기록이 있는 거래처는 지울 수 없습니다. 사용 중지하세요.',
    )
  }
  return prisma.$transaction(async (tx) => {
    for (const id of ids) await deleteExternalCodes(tx, 'CUSTOMER', id)
    const { count } = await tx.customer.updateMany({
      where: { id: { in: ids } },
      data: DELETED_ONLY,
    })
    return { count }
  })
}

// 되살리기: 같은 화주사에 같은 거래처코드가 이미 다시 생겼으면 거부
export async function restoreCustomers(ids: bigint[]) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.customer.findMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      select: { shipperId: true, code: true },
    })
    assertAllFound(rows.length, ids.length, '거래처')
    const taken = await tx.customer.findMany({
      where: { OR: rows.map((r) => ({ shipperId: r.shipperId, code: r.code })) },
      select: { code: true },
    })
    assertNoCodeConflict(
      taken.map((t) => t.code),
      '거래처코드',
    )
    const { count } = await tx.customer.updateMany({
      where: { id: { in: ids }, ...DELETED_ONLY },
      data: NOT_DELETED,
    })
    return { count }
  })
}
