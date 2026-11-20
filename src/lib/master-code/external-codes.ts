import 'server-only'
import type { ExternalEntityType } from '@/generated/prisma/client'
import {
  EXTERNAL_SYSTEMS,
  EXTERNAL_SYSTEM_KEYS,
  type ExternalSystemKey,
} from '@/config/external-systems'
import { ActionError } from '@/lib/actions/action-error'
import { requireOperatorId } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { EMPTY_EXTERNAL_CODES, type ExternalCodes } from './external-codes-schema'
import type { Db } from '@/lib/prisma'

// 외부 코드 매핑 (docs/decisions/0025)

// 한 대상의 외부 코드
export async function getExternalCodes(
  entityType: ExternalEntityType,
  entityId: bigint,
  db: Db = prisma,
): Promise<ExternalCodes> {
  const rows = await db.externalCode.findMany({ where: { entityType, entityId } })
  const codes = { ...EMPTY_EXTERNAL_CODES }
  for (const row of rows) {
    if (row.system in codes) codes[row.system as ExternalSystemKey] = row.code
  }
  return codes
}

// 한 대상의 외부 코드 저장: 채운 칸은 넣거나 고치고, 빈 칸은 지운다
// 같은 운영사의 다른 대상이 이미 쓰는 외부 코드면 어느 연동 상대의 무슨 코드인지 알려 주고 거부한다 (0039)
export async function saveExternalCodes(
  db: Db,
  entityType: ExternalEntityType,
  entityId: bigint,
  codes: Partial<ExternalCodes>,
) {
  const operatorId = requireOperatorId()
  for (const system of EXTERNAL_SYSTEM_KEYS) {
    const code = codes[system]?.trim() ?? ''
    if (!code) {
      await db.externalCode.deleteMany({ where: { system, entityType, entityId } })
      continue
    }
    const owner = await db.externalCode.findUnique({
      where: { operatorId_system_entityType_code: { operatorId, system, entityType, code } },
      select: { entityId: true },
    })
    if (owner && owner.entityId !== entityId) {
      throw new ActionError(
        'CONFLICT',
        `${EXTERNAL_SYSTEMS[system].label} 코드 '${code}'는 이미 다른 대상에서 사용 중입니다.`,
      )
    }
    await db.externalCode.upsert({
      where: {
        operatorId_system_entityType_entityId: { operatorId, system, entityType, entityId },
      },
      create: { operatorId, system, entityType, entityId, code },
      update: { code },
    })
  }
}

// 대상이 사라질 때 매핑도 정리
export async function deleteExternalCodes(
  db: Db,
  entityType: ExternalEntityType,
  entityId: bigint,
) {
  await db.externalCode.deleteMany({ where: { entityType, entityId } })
}

// 외부 코드로 우리 대상 찾기 (I/F 수신 때 사용): 없으면 null
// I/F는 로그인 사용자가 없으므로 어느 운영사의 코드인지 직접 받는다
export async function findByExternalCode(
  operatorId: bigint,
  system: ExternalSystemKey,
  entityType: ExternalEntityType,
  code: string,
  db: Db = prisma,
) {
  const row = await db.externalCode.findUnique({
    where: {
      operatorId_system_entityType_code: { operatorId, system, entityType, code: code.trim() },
    },
    select: { entityId: true },
  })
  return row?.entityId ?? null
}
