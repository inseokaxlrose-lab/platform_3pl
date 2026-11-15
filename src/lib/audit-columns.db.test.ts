import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runAsActor } from '@/lib/actor'
import { prisma } from '@/lib/prisma'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'

// 공통 칸 자동 채우기 (prisma.ts): 등록·수정자 = 지금 작업자, 수정할 때마다 버전 +1
beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

const unit = (code: string) => ({
  operatorId: TEST_OPERATOR_ID,
  code,
  name: code,
  kind: 'BASE' as const,
})
const unitC = { operatorId_code: { operatorId: TEST_OPERATOR_ID, code: 'C' } }

describe('공통 칸 자동 채우기', () => {
  it('작업자를 정하지 않으면 system, 정하면 그 아이디로 등록·수정자를 남긴다', async () => {
    const a = await prisma.unit.create({ data: unit('A') })
    expect(a).toMatchObject({ createdBy: 'system', updatedBy: 'system', rowVersion: 1 })

    const b = await runAsActor('kim', () => prisma.unit.create({ data: unit('B') }))
    expect(b).toMatchObject({ createdBy: 'kim', updatedBy: 'kim', rowVersion: 1 })

    const changed = await runAsActor('lee', () =>
      prisma.unit.update({ where: { id: b.id }, data: { name: 'B2' } }),
    )
    // 등록자는 그대로, 수정자만 바뀌고 버전 +1
    expect(changed).toMatchObject({ createdBy: 'kim', updatedBy: 'lee', rowVersion: 2 })
  })

  it('여러 줄 등록·수정·upsert도 같은 규칙', async () => {
    await runAsActor('kim', () => prisma.unit.createMany({ data: [unit('A'), unit('B')] }))
    await runAsActor('lee', () => prisma.unit.updateMany({ data: { sortOrder: 5 } }))
    const rows = await prisma.unit.findMany({ orderBy: { code: 'asc' } })
    expect(rows.map((r) => [r.code, r.createdBy, r.updatedBy, r.rowVersion])).toEqual([
      ['A', 'kim', 'lee', 2],
      ['B', 'kim', 'lee', 2],
    ])

    await runAsActor('park', () =>
      prisma.unit.upsert({ where: unitC, create: unit('C'), update: {} }),
    )
    await runAsActor('choi', () =>
      prisma.unit.upsert({ where: unitC, create: unit('C'), update: { name: 'C2' } }),
    )
    expect(await prisma.unit.findUniqueOrThrow({ where: unitC })).toMatchObject({
      createdBy: 'park',
      updatedBy: 'choi',
      rowVersion: 2,
    })
  })
})
