import 'server-only'
import { isOperatorActive } from '@/lib/operator/operator-status'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { isYes } from '@/lib/yn'
import { isWriteScope, type ApiEnv, type ApiScope } from './api-codes'
import { ApiError, type ApiErrorCode } from './api-errors'
import { isSameHash, parseApiKey } from './api-key'
import { expireDueKeys } from './api-keys'
import { isIpAllowed } from './ip-allow'

// API 인증 계층 (docs/decisions/0081) — 사용자 로그인(Better Auth)과 따로
// 키가 곧 신원: 키 하나가 운영사·화주·환경·권한을 정한다. 요청 본문의 화주코드는 믿지 않는다
// 검증 순서 (정의서): 형식 → 식별부로 키 찾기 → 해시 비교 → 상태·만료 → 환경 → IP → 화주 상태·API 사용 → 권한
// (호출 한도는 이 다음 rate-limit.ts)

export type ApiContext = {
  operatorId: bigint
  shipperId: bigint
  shipperCode: string
  apiClientId: bigint
  keyPrefix: string
  keyName: string
  env: ApiEnv
  scopes: ApiScope[]
  rateLimitPerMin: number
  expiresAt: Date | null
  // 서비스 계층에 넘기는 데이터 범위: 이 화주만
  scope: DataScope
}

// required: 이 API에 필요한 권한 (없으면 키만 맞으면 된다, 예: GET /me)
export async function authenticate(
  rawKey: string | null,
  clientIp: string | null,
  required: { scope?: ApiScope } = {},
): Promise<ApiContext> {
  if (!rawKey) throw new ApiError('API_KEY_MISSING')
  const parsed = parseApiKey(rawKey)
  if (!parsed) throw new ApiError('API_KEY_INVALID')

  const key = await prisma.apiClient.findUnique({
    where: { keyPrefix: parsed.prefix },
    select: {
      id: true,
      operatorId: true,
      name: true,
      env: true,
      keyPrefix: true,
      keyHash: true,
      status: true,
      expiresAt: true,
      rateLimitPerMin: true,
      scopes: { select: { scope: true } },
      ips: { select: { ipCidr: true } },
      operator: { select: { status: true } },
      shipper: { select: { id: true, code: true, status: true, apiEnabledYn: true } },
    },
  })
  // 키가 없거나 해시가 다르면 같은 답 (어느 쪽이 틀렸는지 알려주지 않는다)
  if (!key || !isSameHash(rawKey.trim(), key.keyHash)) throw new ApiError('API_KEY_INVALID')
  // 여기부터는 키가 확인됨: 거부해도 로그에 화주·키를 남긴다
  const known = {
    operatorId: key.operatorId,
    shipperId: key.shipper.id,
    apiClientId: key.id,
    env: key.env,
  }
  const reject = (code: ApiErrorCode, message?: string) => new ApiError(code, { known, message })
  if (key.status === 'REVOKED') throw reject('API_KEY_REVOKED')
  if (key.status === 'EXPIRED') throw reject('API_KEY_EXPIRED')
  if (key.expiresAt && key.expiresAt < new Date()) {
    await expireDueKeys(prisma, { id: key.id })
    throw reject('API_KEY_EXPIRED')
  }
  // 키 글자의 환경과 저장된 환경이 다르면 위조 → 틀린 키로 본다
  if (key.env !== parsed.env) throw reject('API_KEY_INVALID')
  if (
    !isIpAllowed(
      clientIp,
      key.ips.map((ip) => ip.ipCidr),
    )
  )
    throw reject('IP_NOT_ALLOWED')

  if (!isOperatorActive(key.operator.status)) throw reject('OPERATOR_DISABLED')
  const { shipper } = key
  if (shipper.status === 'TERMINATED') throw reject('CLIENT_TERMINATED')
  if (!isYes(shipper.apiEnabledYn)) throw reject('API_DISABLED')
  // 준비중 화주: TEST 키만 (연동 개발·검증 기간)
  if (shipper.status === 'PREPARING' && key.env === 'LIVE') throw reject('CLIENT_NOT_ACTIVE')
  // 일시정지 화주: LIVE 키의 쓰기 API는 막고 조회는 허용
  if (
    shipper.status === 'SUSPENDED' &&
    key.env === 'LIVE' &&
    required.scope &&
    isWriteScope(required.scope)
  ) {
    throw reject('CLIENT_SUSPENDED')
  }
  const scopes = key.scopes.map((s) => s.scope as ApiScope)
  if (required.scope && !scopes.includes(required.scope)) {
    throw reject('SCOPE_REQUIRED', `이 API는 ${required.scope} 권한이 필요합니다.`)
  }

  return {
    operatorId: key.operatorId,
    shipperId: shipper.id,
    shipperCode: shipper.code,
    apiClientId: key.id,
    keyPrefix: key.keyPrefix,
    keyName: key.name,
    env: key.env as ApiEnv,
    scopes,
    rateLimitPerMin: key.rateLimitPerMin,
    expiresAt: key.expiresAt,
    scope: { kind: 'SHIPPER', operatorId: key.operatorId, shipperId: shipper.id },
  }
}
