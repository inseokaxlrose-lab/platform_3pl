import 'server-only'
import {
  OPERATOR_SETTING_KEYS,
  OPERATOR_SETTINGS,
  type OperatorSettingKey,
  type OperatorSettingValue,
  type OperatorSettingsInput,
} from '@/config/operator-settings'
import { currentActor, requireOperatorId } from '@/lib/actor'
import { prisma, type Db } from '@/lib/prisma'

// 운영사 설정 읽기·저장 (docs/decisions/0092)
// 저장된 값이 규칙에 안 맞으면(설정 정의가 바뀐 경우 등) 기본값을 쓴다

function parse<K extends OperatorSettingKey>(key: K, raw: unknown): OperatorSettingValue<K> {
  const parsed = OPERATOR_SETTINGS[key].schema.safeParse(raw)
  return (parsed.success ? parsed.data : OPERATOR_SETTINGS[key].default) as OperatorSettingValue<K>
}

// 한 설정 (운영사를 직접 넘긴다 — 조회 함수는 출입증 밖에서도 부른다)
export async function getOperatorSetting<K extends OperatorSettingKey>(
  operatorId: bigint,
  key: K,
  db: Db = prisma,
): Promise<OperatorSettingValue<K>> {
  const row = await db.operatorSetting.findUnique({
    where: { operatorId_key: { operatorId, key } },
    select: { value: true },
  })
  return row ? parse(key, row.value) : (OPERATOR_SETTINGS[key].default as OperatorSettingValue<K>)
}

// 모든 설정 (화면)
export async function getOperatorSettings(operatorId: bigint) {
  const rows = await prisma.operatorSetting.findMany({
    where: { operatorId },
    select: { key: true, value: true, updatedAt: true, updatedBy: true },
  })
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const values = Object.fromEntries(
    OPERATOR_SETTING_KEYS.map((key) => [
      key,
      byKey.has(key) ? parse(key, byKey.get(key)!.value) : OPERATOR_SETTINGS[key].default,
    ]),
  ) as OperatorSettingsInput
  const last = rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
  return { values, updatedAt: last?.updatedAt ?? null, updatedBy: last?.updatedBy ?? null }
}

// 저장 (운영사 출입증 안, 입력은 operatorSettingsSchema로 검사된 값): 기본값과 같으면 행을 지운다
export async function saveOperatorSettings(values: OperatorSettingsInput) {
  const operatorId = requireOperatorId()
  await prisma.$transaction(async (tx) => {
    for (const key of OPERATOR_SETTING_KEYS) {
      const value = values[key]
      if (value === OPERATOR_SETTINGS[key].default) {
        await tx.operatorSetting.deleteMany({ where: { operatorId, key } })
        continue
      }
      await tx.operatorSetting.upsert({
        where: { operatorId_key: { operatorId, key } },
        create: { operatorId, key, value: value as never, updatedBy: currentActor() },
        update: { value: value as never, updatedBy: currentActor() },
      })
    }
  })
  return { ok: true }
}
