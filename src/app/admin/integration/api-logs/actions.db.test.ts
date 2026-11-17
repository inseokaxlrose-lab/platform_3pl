import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataGridState } from '@/components/data-grid/state'
import type { PermissionCode } from '@/config/permissions'
import { GET as getMeRoute } from '@/app/api/v1/me/route'
import { runInContext } from '@/lib/actor'
import { flushApiTasks } from '@/lib/api/api-route'
import { issueApiKey } from '@/lib/api/api-keys'
import { getApiLogDetail, getApiLogSummary } from '@/lib/api/api-log-queries'
import { saveRequestLog } from '@/lib/api/request-log'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { getCurrentPermissions, getCurrentScope, getCurrentUser } from '@/lib/session'
import { createTestShipper } from '@/test/factories'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { listApiLogsAction } from './actions'

// API 호출 이력 (0081 ②): 검색 조건 · 운영사 분리 · 요약 · 상세

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }

function signIn(scope: DataScope = ALL, codes: PermissionCode[] = ['integration.api-logs.read']) {
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: 1n,
    name: '관리자',
    username: 'boss',
    userType: scope.kind === 'ALL' ? 'OPERATOR' : 'CENTER',
  })
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
  vi.mocked(getCurrentScope).mockResolvedValue(scope)
}

let shipperId = 0n
let fullKey = ''
let apiClientId = 0n

const callMe = (key: string) =>
  getMeRoute(new Request('http://localhost/api/v1/me', { headers: { 'X-API-Key': key } }))

// 등록 API 로그 하나 (건별 결과 포함) — 리소스 API가 아직 없어 직접 저장
async function saveBulkLog(requestId: string, operatorId = TEST_OPERATOR_ID, sid = shipperId) {
  await saveRequestLog({
    requestId,
    operatorId,
    shipperId: sid,
    apiClientId,
    env: 'LIVE',
    apiCode: 'ORDER_CREATE',
    httpMethod: 'POST',
    path: '/api/v1/orders',
    clientIp: '203.0.113.10',
    idempotencyKey: null,
    requestedAt: new Date(),
    durationMs: 120,
    httpStatus: 200,
    result: 'PARTIAL',
    errorCode: null,
    requestBody: JSON.stringify({ items: [{ orderNo: 'ORD-1', receiverName: '홍길동' }] }),
    responseBody: '{}',
    items: [
      { seq: 1, docNo: 'ORD-1', result: 'CREATED', internalId: 10n },
      {
        seq: 2,
        docNo: 'ORD-2',
        result: 'FAIL',
        errorCode: 'ITEM_NOT_FOUND',
        errorMsg: '품목 없음',
      },
    ],
  })
}

const list = async (filters: Record<string, string> = {}) => {
  const result = await listApiLogsAction({ ...createDataGridState(), filters })
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

beforeEach(async () => {
  await resetDatabase()
  const shipper = await createTestShipper('GANA')
  shipperId = shipper.id
  await prisma.shipper.update({ where: { id: shipperId }, data: { apiEnabledYn: 'Y' } })
  const key = await runInContext({ actor: 'admin.test', operatorId: TEST_OPERATOR_ID }, () =>
    issueApiKey({
      shipperId,
      env: 'LIVE',
      name: 'ERP',
      scopes: ['ITEM_READ'],
      ips: [],
      expiresOn: null,
      rateLimitPerMin: 120,
    }),
  )
  fullKey = key.fullKey
  apiClientId = key.id
  signIn()
})

afterAll(async () => {
  await flushApiTasks()
  await prisma.$disconnect()
})

describe('API 호출 이력', () => {
  it('목록: 화주·키 이름, 결과·API 구분·문서번호·오류코드·HTTP 상태로 거른다', async () => {
    await callMe(fullKey)
    await callMe(`${fullKey.slice(0, -1)}${fullKey.endsWith('a') ? 'b' : 'a'}`) // 틀린 키 (운영사 모름)
    await flushApiTasks()
    await saveBulkLog('req_20261117_00000000000000aa')

    const all = await list()
    // 틀린 키 요청은 운영사를 몰라 보이지 않는다
    expect(all.rowCount).toBe(2)
    const me = all.rows.find((r) => r.apiCode === 'ME')
    expect(me).toMatchObject({
      shipper: 'GANA 화주 (GANA)',
      key: expect.stringContaining('ERP'),
      result: 'SUCCESS',
    })
    const bulk = all.rows.find((r) => r.apiCode === 'ORDER_CREATE')
    expect(bulk).toMatchObject({ counts: '2 / 1 / 1', result: 'PARTIAL' })

    expect((await list({ result: 'PARTIAL' })).rowCount).toBe(1)
    expect((await list({ apiCode: 'ME' })).rowCount).toBe(1)
    expect((await list({ docNo: 'ord-2' })).rowCount).toBe(1)
    expect((await list({ errorCode: 'item_not_found' })).rowCount).toBe(1)
    expect((await list({ httpStatus: '200' })).rowCount).toBe(2)
    expect((await list({ apiClient: String(apiClientId) })).rowCount).toBe(2)
    expect((await list({ requestId: '00000000000000aa' })).rowCount).toBe(1)
    // 기간을 비우면 최근 7일: 오래된 로그는 빠진다
    await prisma.apiRequestLog.update({
      where: { requestId: 'req_20261117_00000000000000aa' },
      data: { requestedAt: new Date(Date.now() - 10 * 86_400_000) },
    })
    expect((await list()).rowCount).toBe(1)
    expect((await list({ requestedAt: '2020-01-01~' })).rowCount).toBe(2)
  })

  it('다른 운영사의 로그는 목록·상세에서 보이지 않는다, 센터 직원은 볼 수 없다', async () => {
    const other = await createTestOperator('다른운영사')
    const otherShipper = await createTestShipper('OTHER', { operatorId: other.id })
    await saveBulkLog('req_20261117_00000000000000bb', other.id, otherShipper.id)
    expect((await list()).rowCount).toBe(0)
    expect(await getApiLogDetail('req_20261117_00000000000000bb', ALL)).toBeNull()

    signIn({ kind: 'CENTERS', operatorId: TEST_OPERATOR_ID, centerIds: [] })
    const denied = await listApiLogsAction(createDataGridState())
    expect(denied).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
  })

  it('요약(오늘)·상세(본문은 가린 값, 건별 결과)', async () => {
    await callMe(fullKey)
    await flushApiTasks()
    await saveBulkLog('req_20261117_00000000000000cc')
    await prisma.apiRequestLog.updateMany({
      where: { requestId: 'req_20261117_00000000000000cc' },
      data: { result: 'FAIL', httpStatus: 429 },
    })
    expect(await getApiLogSummary(ALL)).toMatchObject({
      total: 2,
      fail: 1,
      failRate: 50,
      limited: 1,
      topFail: [{ shipperId: String(shipperId), code: 'GANA', count: 1 }],
    })
    const detail = await getApiLogDetail('req_20261117_00000000000000cc', ALL)
    expect(detail?.requestBody).toContain('홍*동')
    expect(detail?.requestBody).not.toContain('홍길동')
    expect(detail?.items.map((i) => i.result)).toEqual(['CREATED', 'FAIL'])
    expect(detail?.shipper).toMatchObject({ code: 'GANA' })
  })
})
