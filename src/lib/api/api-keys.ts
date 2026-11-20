import 'server-only'
import { addDays } from '@/lib/items/expiry-dates'
import { getOperatorSetting } from '@/lib/settings/operator-settings'
import { kstToday } from '@/lib/stock/expiry'
import { ActionError } from '@/lib/actions/action-error'
import { currentActor, requireOperatorId } from '@/lib/actor'
import { prisma, type Db } from '@/lib/prisma'
import { assertRowVersion, withVersionGuard } from '@/lib/row-version'
import { MAX_ACTIVE_KEYS } from './api-codes'
import { generateApiKey } from './api-key'
import { endOfKstDay, type ApiKeyIssueData, type ApiKeyUpdateData } from './api-key-schema'

// API 키 발급·수정·폐기 (docs/decisions/0081) — 서버 액션(운영사 출입증) 안에서 부른다
// 모든 변경은 키 이력(tb_api_client_event)에 누가·언제·무엇을 남긴다. 키 원문은 어디에도 남기지 않는다

type EventCode = 'ISSUED' | 'UPDATED' | 'REVOKED' | 'EXPIRED'

async function addEvent(db: Db, apiClientId: bigint, event: EventCode, detail?: object) {
  await db.apiClientEvent.create({
    data: {
      operatorId: requireOperatorId(),
      apiClientId,
      event,
      actor: currentActor(),
      ...(detail && { detail }),
    },
  })
}

// 만료일이 지났는데 아직 ACTIVE인 키 → EXPIRED (발급 개수를 셀 때·호출할 때)
export async function expireDueKeys(db: Db, where: { shipperId?: bigint; id?: bigint }) {
  const due = await db.apiClient.findMany({
    where: { ...where, status: 'ACTIVE', expiresAt: { lt: new Date() } },
    select: { id: true, operatorId: true },
  })
  for (const key of due) {
    await db.apiClient.update({ where: { id: key.id }, data: { status: 'EXPIRED' } })
    await db.apiClientEvent.create({
      data: { operatorId: key.operatorId, apiClientId: key.id, event: 'EXPIRED', actor: 'system' },
    })
  }
  return due.length
}

const expiresAtOf = (day: string | null) => (day ? endOfKstDay(day) : null)

// 발급: 화주가 해지가 아니어야 하고, 화주·환경별 사용 중인 키가 2개 미만이어야 한다
// 돌려주는 fullKey는 이 응답에서만 볼 수 있다 (저장은 해시만)
export async function issueApiKey(data: ApiKeyIssueData) {
  return prisma.$transaction(async (tx) => {
    const shipper = await tx.shipper.findUnique({
      where: { id: data.shipperId },
      select: { id: true, code: true, status: true },
    })
    if (!shipper) throw new ActionError('NOT_FOUND', '화주사를 찾을 수 없습니다.')
    if (shipper.status === 'TERMINATED') {
      throw new ActionError('CONFLICT', '해지된 화주사에는 키를 발급할 수 없습니다.')
    }
    if (data.expiresOn && endOfKstDay(data.expiresOn) < new Date()) {
      throw new ActionError('VALIDATION', '만료일이 이미 지났습니다.')
    }
    // 운영 설정의 최대 유효기간 (0092): 정해져 있으면 만료일 필수, 오늘부터 그 일수 안
    const maxDays = await getOperatorSetting(requireOperatorId(), 'apiKeyMaxDays', tx)
    if (maxDays !== null) {
      const limit = addDays(kstToday(), maxDays)
      if (!data.expiresOn) {
        throw new ActionError('VALIDATION', `만료일을 넣어 주세요 (운영 설정: 최대 ${maxDays}일).`)
      }
      if (data.expiresOn > limit) {
        throw new ActionError(
          'VALIDATION',
          `만료일은 ${limit}까지입니다 (운영 설정: 최대 ${maxDays}일).`,
        )
      }
    }
    await expireDueKeys(tx, { shipperId: shipper.id })
    const active = await tx.apiClient.count({
      where: { shipperId: shipper.id, env: data.env, status: 'ACTIVE' },
    })
    if (active >= MAX_ACTIVE_KEYS) {
      throw new ActionError(
        'CONFLICT',
        `${data.env} 키가 이미 ${MAX_ACTIVE_KEYS}개 사용 중입니다. 기존 키를 먼저 폐기하세요.`,
      )
    }
    const { fullKey, prefix, hash } = generateApiKey(data.env as 'TEST' | 'LIVE')
    const key = await tx.apiClient.create({
      data: {
        operatorId: requireOperatorId(),
        shipperId: shipper.id,
        name: data.name,
        env: data.env,
        keyPrefix: prefix,
        keyHash: hash,
        expiresAt: expiresAtOf(data.expiresOn),
        rateLimitPerMin: data.rateLimitPerMin,
        issuedBy: currentActor(),
        scopes: { create: data.scopes.map((scope) => ({ scope })) },
        ips: { create: data.ips },
      },
      select: { id: true, keyPrefix: true, env: true },
    })
    await addEvent(tx, key.id, 'ISSUED', {
      name: data.name,
      env: data.env,
      scopes: data.scopes,
      ips: data.ips.map((ip) => ip.ipCidr),
      expiresOn: data.expiresOn,
      rateLimitPerMin: data.rateLimitPerMin,
    })
    // TODO(알림 기능): 연동 담당자에게 발급 알림 메일 (키 원문은 넣지 않는다)
    return { id: key.id, keyPrefix: key.keyPrefix, env: key.env, fullKey }
  })
}

// 수정: 사용 중인 키만. 바뀐 칸만 이력에 (이전 → 이후)
export async function updateApiKey(id: bigint, rowVersion: number, data: ApiKeyUpdateData) {
  return prisma.$transaction(async (tx) => {
    const found = await tx.apiClient.findUnique({
      where: { id },
      select: {
        rowVersion: true,
        status: true,
        name: true,
        expiresAt: true,
        rateLimitPerMin: true,
        scopes: { select: { scope: true } },
        ips: { select: { ipCidr: true } },
      },
    })
    assertRowVersion(found, rowVersion, 'API 키를 찾을 수 없습니다.')
    const current = found!
    if (current.status !== 'ACTIVE') {
      throw new ActionError('CONFLICT', '사용 중인 키만 고칠 수 있습니다.')
    }
    const expiresAt = expiresAtOf(data.expiresOn)
    const before = {
      name: current.name,
      scopes: current.scopes.map((s) => s.scope).sort(),
      ips: current.ips.map((i) => i.ipCidr).sort(),
      expiresAt: current.expiresAt?.toISOString() ?? null,
      rateLimitPerMin: current.rateLimitPerMin,
    }
    const after = {
      name: data.name,
      scopes: [...data.scopes].sort(),
      ips: data.ips.map((i) => i.ipCidr).sort(),
      expiresAt: expiresAt?.toISOString() ?? null,
      rateLimitPerMin: data.rateLimitPerMin,
    }
    const changes = Object.fromEntries(
      (Object.keys(before) as (keyof typeof before)[])
        .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
        .map((k) => [k, { from: before[k], to: after[k] }]),
    )
    const saved = await withVersionGuard(() =>
      tx.apiClient.update({
        where: { id, rowVersion },
        data: { name: data.name, expiresAt, rateLimitPerMin: data.rateLimitPerMin },
        select: { rowVersion: true },
      }),
    )
    await tx.apiClientScope.deleteMany({ where: { apiClientId: id } })
    await tx.apiClientScope.createMany({
      data: data.scopes.map((scope) => ({ apiClientId: id, scope })),
    })
    await tx.apiClientIp.deleteMany({ where: { apiClientId: id } })
    await tx.apiClientIp.createMany({ data: data.ips.map((ip) => ({ ...ip, apiClientId: id })) })
    if (Object.keys(changes).length > 0) await addEvent(tx, id, 'UPDATED', changes)
    return { id, rowVersion: saved.rowVersion }
  })
}

// 폐기: 즉시 효력 (다음 호출부터 401). 사유 필수
export async function revokeApiKey(id: bigint, reason: string, db?: Db) {
  const run = async (tx: Db) => {
    const key = await tx.apiClient.findUnique({ where: { id }, select: { status: true } })
    if (!key) throw new ActionError('NOT_FOUND', 'API 키를 찾을 수 없습니다.')
    if (key.status === 'REVOKED') throw new ActionError('CONFLICT', '이미 폐기된 키입니다.')
    await tx.apiClient.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
        revokedBy: currentActor(),
        revokeReason: reason,
      },
    })
    await addEvent(tx, id, 'REVOKED', { reason })
    return { id }
  }
  return db ? run(db) : prisma.$transaction(run)
}

// 화주 해지: 그 화주의 폐기되지 않은 키를 모두 폐기 (shippers.ts changeShipperStatus에서, 같은 트랜잭션)
export async function revokeShipperKeys(db: Db, shipperId: bigint, reason: string) {
  const keys = await db.apiClient.findMany({
    where: { shipperId, status: { not: 'REVOKED' } },
    select: { id: true },
  })
  for (const key of keys) await revokeApiKey(key.id, reason, db)
  return keys.length
}
