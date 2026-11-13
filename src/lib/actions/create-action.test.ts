import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { PermissionCode } from '@/config/permissions'
import { getCurrentPermissions, getCurrentUser, type CurrentUser } from '@/lib/session'
import { ActionError } from './action-error'
import { createAction } from './create-action'
import { unwrap } from './unwrap'

// 로그인·권한은 가짜로 바꿔서 검사 순서만 확인한다
vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(async () => ({ kind: 'CENTERS', centerIds: ['ICN'] })),
}))

const user: CurrentUser = { id: 'u1', name: '김운영', username: 'kim', userType: 'CENTER' }

function signedIn(codes: PermissionCode[]) {
  vi.mocked(getCurrentUser).mockResolvedValue(user)
  vi.mocked(getCurrentPermissions).mockResolvedValue(new Set(codes))
}

const handler = vi.fn(async ({ input }: { input: { asnId: string; reason: string } }) => ({
  closed: input.asnId,
}))

const closeAsn = createAction({
  permission: 'inbound.asn.close',
  input: z.object({
    asnId: z.string().min(1, 'ASN을 선택해 주세요.'),
    reason: z.string().trim().min(1, '마감 사유를 입력해 주세요.'),
  }),
  handler,
})

beforeEach(() => {
  handler.mockClear()
  vi.mocked(getCurrentUser).mockReset()
  vi.mocked(getCurrentPermissions).mockReset()
})

describe('createAction 검사 순서', () => {
  it('① 로그인하지 않았으면 UNAUTHENTICATED, 처리하지 않는다', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)

    const result = await closeAsn({ asnId: 'A1', reason: '취소' })

    expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('② 권한이 없으면 FORBIDDEN, 처리하지 않는다', async () => {
    signedIn(['inbound.asn.read'])

    const result = await closeAsn({ asnId: 'A1', reason: '취소' })

    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('② 권한을 입력보다 먼저 검사한다 (권한 없는 사람에게 입력 규칙을 알려주지 않음)', async () => {
    signedIn([])
    const result = await closeAsn({ asnId: '', reason: '' })
    expect(result).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(result.ok === false && result.error.fieldErrors).toBeFalsy()
  })

  it('③ 입력이 규칙에 맞지 않으면 VALIDATION과 칸별 메시지, 처리하지 않는다', async () => {
    signedIn(['inbound.asn.read', 'inbound.asn.close'])

    const result = await closeAsn({ asnId: 'A1', reason: '   ' })

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { reason: ['마감 사유를 입력해 주세요.'] } },
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('④ 모두 통과하면 정리된 입력으로 처리하고 결과를 돌려준다', async () => {
    signedIn(['inbound.asn.read', 'inbound.asn.close'])

    const result = await closeAsn({ asnId: 'A1', reason: '  화주 요청  ' })

    expect(result).toEqual({ ok: true, data: { closed: 'A1' } })
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        user,
        input: { asnId: 'A1', reason: '화주 요청' },
        // 처리 함수는 데이터 범위를 함께 받는다
        scope: { kind: 'CENTERS', centerIds: ['ICN'] },
      }),
    )
  })
})

describe('createAction 처리 중 오류', () => {
  beforeEach(() => signedIn(['inbound.asn.read', 'inbound.asn.close']))

  it('업무 오류(ActionError)는 코드와 메시지를 그대로 돌려준다', async () => {
    handler.mockRejectedValueOnce(new ActionError('CONFLICT', '이미 마감된 ASN입니다.'))

    expect(await closeAsn({ asnId: 'A1', reason: '취소' })).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: '이미 마감된 ASN입니다.' },
    })
  })

  it('예상 못 한 오류는 일반 문구만 돌려주고, 자세한 내용은 서버 기록에 남긴다', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    handler.mockRejectedValueOnce(new Error('connection refused: 10.0.0.5:5432'))

    const result = await closeAsn({ asnId: 'A1', reason: '취소' })

    expect(result).toMatchObject({ ok: false, error: { code: 'UNKNOWN' } })
    expect(JSON.stringify(result)).not.toContain('10.0.0.5') // 내부 정보 노출 없음
    expect(log).toHaveBeenCalledWith('[action:inbound.asn.close]', expect.any(Error))
    log.mockRestore()
  })
})

describe('unwrap', () => {
  it('성공이면 데이터, 실패면 메시지를 담은 오류', () => {
    expect(unwrap({ ok: true, data: 1 })).toBe(1)
    expect(() =>
      unwrap({ ok: false, error: { code: 'FORBIDDEN', message: '권한이 없습니다.' } }),
    ).toThrow('권한이 없습니다.')
  })
})

describe("permission: 'signed-in' (개인 설정용)", () => {
  const saveMine = createAction({
    permission: 'signed-in',
    input: z.object({ value: z.string() }),
    handler: async ({ user, input }) => ({ owner: user.id, value: input.value }),
  })

  it('메뉴 권한이 하나도 없어도 로그인했으면 처리한다', async () => {
    signedIn([])
    expect(await saveMine({ value: 'x' })).toEqual({ ok: true, data: { owner: 'u1', value: 'x' } })
  })

  it('로그인하지 않았으면 여전히 UNAUTHENTICATED', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null)
    expect(await saveMine({ value: 'x' })).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    })
  })
})
