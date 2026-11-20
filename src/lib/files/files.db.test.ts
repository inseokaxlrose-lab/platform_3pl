import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runInContext } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import type { DataScope } from '@/lib/scope/data-scope'
import { createInboundFixture, type InboundFixture } from '@/test/inbound-fixtures'
import { createTestOperator, resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  attachImage,
  detachFile,
  listAttachments,
  readFileFor,
  removeAttachmentsOf,
  setOperatorImage,
} from './files'
import { LocalFileStorage, useFileStorage } from './storage'

// 첨부파일 (docs/decisions/0091): 저장소는 임시 폴더로 바꿔 실제 파일까지 확인한다

const ALL: DataScope = { kind: 'ALL', operatorId: TEST_OPERATOR_ID }
let f: InboundFixture
let root = ''

// 아주 작은 PNG (앞부분 매직 바이트만 맞으면 된다)
const png = (name = 'a.png') =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], name, {
    type: 'image/png',
  })

const asOperator = <T>(fn: () => Promise<T>, operatorId = TEST_OPERATOR_ID) =>
  runInContext({ actor: 'kim', operatorId }, fn)

// 저장소 폴더 안의 파일 수
async function storedCount(): Promise<number> {
  const walk = async (dir: string): Promise<number> => {
    let count = 0
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      count += entry.isDirectory() ? await walk(path.join(dir, entry.name)) : 1
    }
    return count
  }
  return walk(root)
}

beforeEach(async () => {
  await resetDatabase()
  f = await createInboundFixture()
  root = await mkdtemp(path.join(tmpdir(), 'files-'))
  useFileStorage(new LocalFileStorage(root))
})

afterAll(async () => {
  useFileStorage(null)
  await rm(root, { recursive: true, force: true })
  await prisma.$disconnect()
})

describe('첨부파일', () => {
  it('품목 이미지: 붙이기 → 목록 → 읽기(범위) → 떼면 저장소 파일도 지운다', async () => {
    const { id } = await asOperator(() => attachImage(ALL, 'ITEM', f.water, png('물.png')))
    expect(await asOperator(() => listAttachments(ALL, 'ITEM', f.water))).toMatchObject([
      { id, name: '물.png', mimeType: 'image/png', size: 11, createdBy: 'kim' },
    ])
    expect(await storedCount()).toBe(1)

    // 읽기: 같은 운영사 전체 범위 / 그 품목의 화주사 사용자는 되고, 다른 화주사·다른 운영사는 안 된다
    expect((await readFileFor(ALL, id))?.mimeType).toBe('image/png')
    const own: DataScope = { kind: 'SHIPPER', operatorId: TEST_OPERATOR_ID, shipperId: f.gana }
    const other: DataScope = { kind: 'SHIPPER', operatorId: TEST_OPERATOR_ID, shipperId: f.dara }
    expect(await readFileFor(own, id)).not.toBeNull()
    expect(await readFileFor(other, id)).toBeNull()
    const otherOperator = await createTestOperator('남의운영사')
    expect(await readFileFor({ kind: 'ALL', operatorId: otherOperator.id }, id)).toBeNull()

    await asOperator(() => detachFile(ALL, 'ITEM', f.water, id))
    expect(await prisma.file.count()).toBe(0)
    expect(await storedCount()).toBe(0)
  })

  it('이미지가 아니거나 크면 거부, 범위 밖 대상에는 붙일 수 없다', async () => {
    const text = new File(['hello'], 'a.png', { type: 'image/png' })
    await expect(asOperator(() => attachImage(ALL, 'ITEM', f.water, text))).rejects.toThrow(
      '이미지만',
    )
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.png')
    await expect(asOperator(() => attachImage(ALL, 'ITEM', f.water, big))).rejects.toThrow('10MB')
    const dara: DataScope = { kind: 'SHIPPER', operatorId: TEST_OPERATOR_ID, shipperId: f.dara }
    await expect(asOperator(() => attachImage(dara, 'ITEM', f.water, png()))).rejects.toThrow(
      '대상을 찾을 수 없습니다',
    )
    expect(await storedCount()).toBe(0)
  })

  it('운영사 로고: 바꾸면 이전 파일을 지우고, 지우기도 된다. 대상이 지워지면 첨부도 지운다', async () => {
    const first = await asOperator(() => setOperatorImage('logo', png('logo1.png')))
    const second = await asOperator(() => setOperatorImage('logo', png('logo2.png')))
    expect(await prisma.file.findMany({ select: { id: true } })).toEqual([{ id: second.fileId }])
    expect((await readFileFor(ALL, second.fileId!))?.name).toBe('logo2.png')
    expect(await readFileFor(ALL, first.fileId!)).toBeNull()
    await asOperator(() => setOperatorImage('logo', null))
    expect(
      (await prisma.operator.findUniqueOrThrow({ where: { id: TEST_OPERATOR_ID } })).logoFileId,
    ).toBeNull()

    await asOperator(() => attachImage(ALL, 'ITEM', f.water, png()))
    await asOperator(() => removeAttachmentsOf('ITEM', [f.water]))
    expect(await storedCount()).toBe(0)
  })
})
