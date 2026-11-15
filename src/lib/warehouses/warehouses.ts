import 'server-only'
import { looksLikeSystemCode } from '@/config/master-codes'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { saveExternalCodes } from '@/lib/master-code/external-codes'
import { nextSystemCode } from '@/lib/master-code/system-code'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { prisma } from '@/lib/prisma'
import type { WarehouseUpdateData } from './warehouse-schema'
import { toStatus } from '@/lib/status'

// 창고 저장 (docs/decisions/0027). 권한·데이터 범위 검사는 서버 액션에서 한다
// 입고대기 창고 보호: 새로 만들 수 없고(센터 등록 때 자동으로만), 코드를 바꾸거나 사용 중지할 수 없다

// 사용자 코드 검사: 시스템 코드 모양 금지(자기 것 제외), 같은 센터 안 중복 금지
async function assertWarehouseCode(
  centerId: bigint,
  code: string,
  ownSystemCode: string,
  exceptId?: bigint,
) {
  if (code !== ownSystemCode && looksLikeSystemCode('WAREHOUSE', code)) {
    throw new ActionError(
      'VALIDATION',
      `'${code}'는 시스템 코드 모양이라 창고 코드로 쓸 수 없습니다.`,
    )
  }
  const owner = await prisma.warehouse.findUnique({
    where: { centerId_code: { centerId, code } },
    select: { id: true },
  })
  if (owner && owner.id !== exceptId) {
    throw new ActionError('CONFLICT', `이 센터에 이미 있는 창고 코드입니다: ${code}`)
  }
}

// 등록: 사용자가 만드는 창고는 항상 일반 유형 (한 트랜잭션: 시스템 코드 → 창고 → 외부 코드)
export async function createWarehouse(centerId: bigint, data: WarehouseUpdateData) {
  return prisma.$transaction(async (tx) => {
    const systemCode = await nextSystemCode('WAREHOUSE', tx)
    const code = data.code || systemCode
    await assertWarehouseCode(centerId, code, systemCode)
    const warehouse = await tx.warehouse.create({
      data: {
        operatorId: requireOperatorId(),
        centerId,
        systemCode,
        code,
        name: data.name,
        type: 'GENERAL',
        storageCondition: data.storageCondition,
      },
      select: { id: true, systemCode: true, code: true, rowVersion: true },
    })
    await saveExternalCodes(tx, 'WAREHOUSE', warehouse.id, data.externalCodes)
    return warehouse
  })
}

// 수정: 센터·유형·시스템 코드는 바뀌지 않는다. 입고대기 창고는 코드도 고정
// rowVersion: 화면이 불러온 버전 (그 사이 다른 사람이 저장했으면 충돌)
export async function updateWarehouse(id: bigint, rowVersion: number, data: WarehouseUpdateData) {
  const found = await prisma.warehouse.findUnique({
    where: { id },
    select: { centerId: true, systemCode: true, code: true, type: true, rowVersion: true },
  })
  assertRowVersion(found, rowVersion, '창고를 찾을 수 없습니다.')
  const current = found!

  let code = data.code || current.systemCode
  if (current.type === 'INBOUND_STAGING') {
    if (data.code && data.code !== current.code) {
      throw new ActionError('VALIDATION', '입고대기 창고의 코드는 바꿀 수 없습니다.')
    }
    code = current.code
  }
  await assertWarehouseCode(current.centerId, code, current.systemCode, id)

  return prisma.$transaction(async (tx) => {
    const saved = await withVersionGuard(() =>
      tx.warehouse.update({
        where: { id, rowVersion },
        data: {
          code,
          name: data.name,
          storageCondition: data.storageCondition,
        },
        select: { rowVersion: true },
      }),
    )
    await saveExternalCodes(tx, 'WAREHOUSE', id, data.externalCodes)
    return { id, code, rowVersion: saved.rowVersion }
  })
}

// 사용 중지 / 다시 사용: 입고대기 창고는 늘 사용 중이어야 한다 (입고 확정이 들어갈 곳)
export async function setWarehouseActive(id: bigint, isActive: boolean) {
  const current = await prisma.warehouse.findUnique({ where: { id }, select: { type: true } })
  if (!current) throw new ActionError('NOT_FOUND', '창고를 찾을 수 없습니다.')
  if (current.type === 'INBOUND_STAGING' && !isActive) {
    throw new ActionError('CONFLICT', '입고대기 창고는 사용 중지할 수 없습니다.')
  }
  await prisma.warehouse.update({ where: { id }, data: { status: toStatus(isActive) } })
  return { id, isActive }
}
