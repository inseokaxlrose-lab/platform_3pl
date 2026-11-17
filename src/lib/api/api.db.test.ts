import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runInContext } from '@/lib/actor'
import { GET as getMeRoute } from '@/app/api/v1/me/route'
import { GET as getOpenApi } from '@/app/api/v1/openapi.json/route'
import { prisma } from '@/lib/prisma'
import { changeShipperStatus } from '@/lib/shippers/shippers'
import { createTestCenter, createTestShipper } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { apiRoute, flushApiTasks, readItems, writeTransaction } from './api-route'
import { issueApiKey, revokeApiKey, updateApiKey } from './api-keys'

// 화주 연동 API 공통 틀 (0081): 인증·상태·권한·호출 한도·멱등·dry-run·로그

const asOperator = <T>(fn: () => Promise<T>) =>
  runInContext({ actor: 'admin.test', operatorId: TEST_OPERATOR_ID }, fn)

let shipperId = 0n

async function issue(overrides: Partial<Parameters<typeof issueApiKey>[0]> = {}) {
  return asOperator(() =>
    issueApiKey({
      shipperId,
      env: 'LIVE',
      name: 'ERP 연동용',
      scopes: ['ITEM_READ', 'ITEM_WRITE'],
      ips: [],
      expiresOn: null,
      rateLimitPerMin: 120,
      ...overrides,
    }),
  )
}

const call = (
  route: (r: Request) => Promise<Response>,
  key: string | null,
  init: RequestInit = {},
) =>
  route(
    new Request('http://localhost/api/v1/me', {
      ...init,
      headers: {
        ...(key && { 'X-API-Key': key }),
        'X-Forwarded-For': '203.0.113.10',
        ...(init.headers as Record<string, string>),
      },
    }),
  )

async function bodyOf(response: Response) {
  return (await response.json()) as Record<string, unknown> & {
    result: string
    error?: { code: string }
    data?: Record<string, unknown>
  }
}

beforeEach(async () => {
  await resetDatabase()
  const center = await createTestCenter('ICN')
  const shipper = await createTestShipper('GANA')
  shipperId = shipper.id
  await prisma.shipper.update({
    where: { id: shipperId },
    data: {
      apiEnabledYn: 'Y',
      centers: { create: [{ centerId: center.id, isDefault: 'Y' }] },
    },
  })
})

afterAll(async () => {
  await flushApiTasks()
  await prisma.$disconnect()
})

describe('키 발급·인증 · GET /me', () => {
  it('원문은 발급 때만, DB에는 해시만. /me는 화주·환경·권한·이용 센터를 돌려준다', async () => {
    const key = await issue()
    expect(key.fullKey).toMatch(/^live_/)
    const saved = await prisma.apiClient.findUniqueOrThrow({ where: { id: key.id } })
    expect(saved.keyHash).toHaveLength(64)
    // 비밀부 원문은 어떤 칸에도 없다
    expect(Object.values(saved).map(String).join('|')).not.toContain(key.fullKey.split('_')[2])

    const response = await call(getMeRoute, key.fullKey)
    expect(response.status).toBe(200)
    expect(response.headers.get('X-RateLimit-Limit')).toBe('120')
    expect(response.headers.get('X-Request-Id')).toMatch(/^req_\d{8}_[0-9a-f]{16}$/)
    const body = await bodyOf(response)
    expect(body).toMatchObject({
      result: 'SUCCESS',
      data: {
        client: { code: 'GANA', status: 'ACTIVE' },
        key: { env: 'LIVE', prefix: key.keyPrefix, scopes: ['ITEM_READ', 'ITEM_WRITE'] },
        centers: [{ code: 'ICN', isDefault: true }],
      },
    })
    expect(body.dryRun).toBeUndefined()

    // 로그 (응답 뒤 저장), 키 최근 사용 — 버전은 그대로
    await flushApiTasks()
    const log = await prisma.apiRequestLog.findUniqueOrThrow({
      where: { requestId: body.requestId as string },
    })
    expect(log).toMatchObject({
      apiCode: 'ME',
      httpStatus: 200,
      result: 'SUCCESS',
      clientIp: '203.0.113.10',
    })
    const used = await prisma.apiClient.findUniqueOrThrow({ where: { id: key.id } })
    expect(used.lastUsedIp).toBe('203.0.113.10')
    expect(used.rowVersion).toBe(saved.rowVersion)
  })

  it('키 없음·형식·틀린 키는 401, 이력에 발급이 남는다', async () => {
    const key = await issue()
    expect((await bodyOf(await call(getMeRoute, null))).error?.code).toBe('API_KEY_MISSING')
    expect((await bodyOf(await call(getMeRoute, 'abc'))).error?.code).toBe('API_KEY_INVALID')
    const wrong = `${key.fullKey.slice(0, -1)}${key.fullKey.endsWith('a') ? 'b' : 'a'}`
    const response = await call(getMeRoute, wrong)
    expect(response.status).toBe(401)
    const events = await prisma.apiClientEvent.findMany({ where: { apiClientId: key.id } })
    expect(events.map((e) => e.event)).toEqual(['ISSUED'])
    expect(events[0].actor).toBe('admin.test')
  })

  it('화주·환경별 사용 중 키 최대 2개, 폐기하면 즉시 401', async () => {
    const first = await issue()
    await issue({ name: '두 번째' })
    await expect(issue({ name: '세 번째' })).rejects.toThrow('2개 사용 중')
    // TEST 환경은 따로 센다
    await expect(issue({ env: 'TEST', name: '테스트' })).resolves.toMatchObject({ env: 'TEST' })

    await asOperator(() => revokeApiKey(first.id, '유출 의심'))
    const revoked = await bodyOf(await call(getMeRoute, first.fullKey))
    expect(revoked.error?.code).toBe('API_KEY_REVOKED')
    // 거부해도 어느 화주·키였는지 로그에 남는다 (유출 의심 추적), 최근 사용은 그대로
    await flushApiTasks()
    expect(
      await prisma.apiRequestLog.findUniqueOrThrow({
        where: { requestId: revoked.requestId as string },
      }),
    ).toMatchObject({
      shipperId,
      apiClientId: first.id,
      httpStatus: 401,
      errorCode: 'API_KEY_REVOKED',
    })
    expect(
      (await prisma.apiClient.findUniqueOrThrow({ where: { id: first.id } })).lastUsedAt,
    ).toBeNull()
    await expect(issue({ name: '세 번째' })).resolves.toBeTruthy()
  })

  it('만료일이 지나면 EXPIRED로 바뀌고 401', async () => {
    const key = await issue()
    await prisma.apiClient.update({
      where: { id: key.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect((await bodyOf(await call(getMeRoute, key.fullKey))).error?.code).toBe('API_KEY_EXPIRED')
    expect((await prisma.apiClient.findUniqueOrThrow({ where: { id: key.id } })).status).toBe(
      'EXPIRED',
    )
  })

  it('허용 IP·API 사용·화주 상태(준비중 TEST만, 해지 시 키 자동 폐기)', async () => {
    const key = await issue({ ips: [{ ipCidr: '198.51.100.0/24', description: null }] })
    expect((await bodyOf(await call(getMeRoute, key.fullKey))).error?.code).toBe('IP_NOT_ALLOWED')
    await asOperator(() =>
      updateApiKey(key.id, 1, {
        name: 'ERP 연동용',
        scopes: ['ITEM_READ'],
        ips: [{ ipCidr: '203.0.113.0/24', description: '본사' }],
        expiresOn: null,
        rateLimitPerMin: 120,
      }),
    )
    expect((await call(getMeRoute, key.fullKey)).status).toBe(200)
    const updated = await prisma.apiClientEvent.findFirstOrThrow({
      where: { apiClientId: key.id, event: 'UPDATED' },
    })
    expect(updated.detail).toMatchObject({
      scopes: { from: ['ITEM_READ', 'ITEM_WRITE'], to: ['ITEM_READ'] },
    })

    await prisma.shipper.update({ where: { id: shipperId }, data: { apiEnabledYn: 'N' } })
    expect((await bodyOf(await call(getMeRoute, key.fullKey))).error?.code).toBe('API_DISABLED')
    await prisma.shipper.update({
      where: { id: shipperId },
      data: { apiEnabledYn: 'Y', status: 'PREPARING' },
    })
    expect((await bodyOf(await call(getMeRoute, key.fullKey))).error?.code).toBe(
      'CLIENT_NOT_ACTIVE',
    )
    const test = await issue({ env: 'TEST' })
    const testBody = await bodyOf(await call(getMeRoute, test.fullKey))
    expect(testBody).toMatchObject({ result: 'SUCCESS', dryRun: true })

    // 해지 → 키 모두 폐기
    await prisma.shipper.update({ where: { id: shipperId }, data: { status: 'ACTIVE' } })
    const version = (await prisma.shipper.findUniqueOrThrow({ where: { id: shipperId } }))
      .rowVersion
    await asOperator(() =>
      changeShipperStatus(shipperId, version, { status: 'TERMINATED', reason: '계약 종료' }),
    )
    const keys = await prisma.apiClient.findMany({ where: { shipperId } })
    expect(keys.every((k) => k.status === 'REVOKED')).toBe(true)
    expect((await bodyOf(await call(getMeRoute, test.fullKey))).error?.code).toBe('API_KEY_REVOKED')
  })

  it('분당 호출 한도를 넘으면 429 + Retry-After', async () => {
    const key = await issue({ rateLimitPerMin: 2 })
    expect((await call(getMeRoute, key.fullKey)).status).toBe(200)
    const second = await call(getMeRoute, key.fullKey)
    expect(second.headers.get('X-RateLimit-Remaining')).toBe('0')
    const third = await call(getMeRoute, key.fullKey)
    expect(third.status).toBe(429)
    expect(Number(third.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect((await bodyOf(third)).error?.code).toBe('RATE_LIMITED')
  })
})

describe('쓰기 공통 틀: 권한·일시정지·dry-run·멱등·건별 결과', () => {
  // 시험용 쓰기 API: 화주 비고를 바꾸고 건별 결과를 돌려준다 (실제 리소스 API는 각 작업에서)
  const writeRoute = apiRoute({
    apiCode: 'TEST_WRITE',
    scope: 'ITEM_WRITE',
    write: true,
    handler: async (ctx) => {
      const rows = readItems(ctx.body) as { code: string; remark?: string }[]
      return {
        items: await writeTransaction(ctx, async (tx) => {
          const results = []
          for (const [index, row] of rows.entries()) {
            if (!row.remark) {
              results.push({
                seq: index + 1,
                docNo: row.code,
                result: 'FAIL' as const,
                errors: [
                  {
                    code: 'VALIDATION_FAILED',
                    field: `items[${index}].remark`,
                    message: '비고가 없습니다.',
                  },
                ],
              })
              continue
            }
            await tx.shipper.update({
              where: { id: ctx.api.shipperId },
              data: { remark: row.remark },
            })
            results.push({
              seq: index + 1,
              docNo: row.code,
              result: 'UPDATED' as const,
              internalId: ctx.api.shipperId,
            })
          }
          return results
        }),
      }
    },
  })
  const post = (key: string, body: unknown, headers: Record<string, string> = {}) =>
    call(writeRoute, key, { method: 'POST', body: JSON.stringify(body), headers })

  it('건별 결과(PARTIAL), LIVE는 저장 · TEST는 되돌림, 개인정보는 가려서 로그', async () => {
    const live = await issue()
    const response = await post(live.fullKey, {
      items: [{ code: 'A', remark: '라이브' }, { code: 'B' }],
      receiverName: '홍길동',
    })
    const body = await bodyOf(response)
    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      result: 'PARTIAL',
      summary: { total: 2, success: 1, fail: 1 },
      items: [
        { seq: 1, docNo: 'A', result: 'UPDATED', id: String(shipperId) },
        { seq: 2, docNo: 'B', result: 'FAIL', errors: [{ code: 'VALIDATION_FAILED' }] },
      ],
    })
    expect((await prisma.shipper.findUniqueOrThrow({ where: { id: shipperId } })).remark).toBe(
      '라이브',
    )

    const test = await issue({ env: 'TEST' })
    const dry = await bodyOf(await post(test.fullKey, [{ code: 'A', remark: '테스트' }]))
    expect(dry).toMatchObject({ result: 'SUCCESS', dryRun: true })
    expect((await prisma.shipper.findUniqueOrThrow({ where: { id: shipperId } })).remark).toBe(
      '라이브',
    )

    await flushApiTasks()
    const log = await prisma.apiRequestLog.findUniqueOrThrow({
      where: { requestId: body.requestId as string },
      include: { items: { orderBy: { seq: 'asc' } } },
    })
    expect(log).toMatchObject({ result: 'PARTIAL', totalCount: 2, successCount: 1, failCount: 1 })
    expect(log.requestBody).toContain('홍*동')
    expect(log.requestBody).not.toContain('홍길동')
    expect(log.items.map((i) => i.result)).toEqual(['UPDATED', 'FAIL'])
  })

  it('Idempotency-Key: 같은 본문은 처음 응답 그대로, 다른 본문은 409', async () => {
    const key = await issue()
    const first = await bodyOf(
      await post(key.fullKey, [{ code: 'A', remark: '1' }], { 'Idempotency-Key': 'k-1' }),
    )
    await prisma.shipper.update({ where: { id: shipperId }, data: { remark: '바뀜' } })
    const replay = await post(key.fullKey, [{ code: 'A', remark: '1' }], {
      'Idempotency-Key': 'k-1',
    })
    expect(replay.headers.get('Idempotent-Replayed')).toBe('true')
    expect((await bodyOf(replay)).requestId).toBe(first.requestId)
    // 다시 처리하지 않았다
    expect((await prisma.shipper.findUniqueOrThrow({ where: { id: shipperId } })).remark).toBe(
      '바뀜',
    )
    const conflict = await post(key.fullKey, [{ code: 'A', remark: '2' }], {
      'Idempotency-Key': 'k-1',
    })
    expect(conflict.status).toBe(409)
    expect((await bodyOf(conflict)).error?.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('권한 없음 403, 일시정지 화주는 LIVE 쓰기 403(조회는 됨), JSON·건수 오류', async () => {
    const readOnly = await issue({ scopes: ['ITEM_READ'] })
    expect((await bodyOf(await post(readOnly.fullKey, []))).error?.code).toBe('SCOPE_REQUIRED')

    const key = await issue({ name: '쓰기' })
    expect(
      (await bodyOf(await call(writeRoute, key.fullKey, { method: 'POST', body: '{' }))).error
        ?.code,
    ).toBe('INVALID_JSON')
    const tooMany = await post(
      key.fullKey,
      Array.from({ length: 501 }, (_, i) => ({ code: `C${i}` })),
    )
    expect(tooMany.status).toBe(413)

    await prisma.shipper.update({
      where: { id: shipperId },
      data: { status: 'SUSPENDED', statusReason: '미수금' },
    })
    expect((await bodyOf(await post(key.fullKey, [{ code: 'A', remark: 'x' }]))).error?.code).toBe(
      'CLIENT_SUSPENDED',
    )
    expect((await call(getMeRoute, key.fullKey)).status).toBe(200)
  })
})

describe('OpenAPI', () => {
  it('/me 경로·인증 방식·오류코드가 들어 있다', async () => {
    const doc = (await (
      await getOpenApi(new Request('http://localhost/api/v1/openapi.json'))
    ).json()) as {
      paths: Record<string, unknown>
      components: { securitySchemes: Record<string, { name: string }> }
    }
    expect(Object.keys(doc.paths)).toContain('/me')
    expect(doc.components.securitySchemes.ApiKey.name).toBe('X-API-Key')
    expect(JSON.stringify(doc)).toContain('RATE_LIMITED')
  })
})
