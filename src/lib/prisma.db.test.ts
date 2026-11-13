import { afterAll, describe, expect, it } from 'vitest'
import { prisma } from './prisma'

describe('DB 연결', () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('테스트 전용 DB에 연결된다', async () => {
    const rows = await prisma.$queryRaw<{ database: string }[]>`
      SELECT current_database() AS database
    `
    expect(rows[0].database).toMatch(/_test$/)
  })
})
