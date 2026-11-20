import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { signInAs } from '@/test/inbound-session'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { listAttachmentsAction, uploadAttachmentAction } from './file-actions'
import { LocalFileStorage, useFileStorage } from './storage'

// 첨부파일 서버 액션 권한 (0091): 대상의 메뉴 권한으로 다시 검사한다

vi.mock('@/lib/session', () => ({
  getCurrentUser: vi.fn(),
  getCurrentPermissions: vi.fn(),
  getCurrentScope: vi.fn(),
}))

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }
let f: InboundFixture
let root = ''
const png = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], 'a.png', { type: 'image/png' })

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  root = await mkdtemp(path.join(tmpdir(), 'file-actions-'))
  useFileStorage(new LocalFileStorage(root))
})

afterAll(async () => {
  useFileStorage(null)
  await rm(root, { recursive: true, force: true })
  await prisma.$disconnect()
})

describe('첨부파일 서버 액션', () => {
  it('품목 수정 권한이면 올리고, 조회 권한만 있으면 보기만, 권한이 없으면 보기도 거부', async () => {
    const target = { entity: 'ITEM' as const, id: String(f.water) }
    signInAs(ALL, ['master.items.read', 'master.items.update'])
    expect(await uploadAttachmentAction({ ...target, file: png() })).toMatchObject({ ok: true })

    signInAs(ALL, ['master.items.read'])
    expect(await uploadAttachmentAction({ ...target, file: png() })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
    const listed = await listAttachmentsAction(target)
    expect(listed.ok && listed.data).toHaveLength(1)

    signInAs(ALL, ['inbound.inspection.read'])
    expect(await listAttachmentsAction(target)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    })
  })
})
