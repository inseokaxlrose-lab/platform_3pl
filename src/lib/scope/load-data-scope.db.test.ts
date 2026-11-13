import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createTestCenter, createTestShipper, createTestUser } from '@/test/factories'
import { resetDatabase } from '@/test/reset-database'
import { scopeFilter, ScopeFieldMissingError } from './data-scope'
import { loadDataScope } from './load-data-scope'

let icn = ''
let pus = ''

beforeEach(async () => {
  await resetDatabase()
  icn = (await createTestCenter('ICN')).id
  pus = (await createTestCenter('PUS')).id
  await createTestCenter('GMP', { isActive: false })
})

afterAll(async () => {
  await prisma.$disconnect()
})

// 센터 표 자체에 범위를 걸어 조회 (센터 표에서 "센터를 가리키는 칸"은 id)
async function visibleCenterCodes(userId: string) {
  const scope = await loadDataScope(userId)
  const centers = await prisma.center.findMany({
    where: scopeFilter(scope, { center: 'id' }),
    orderBy: { code: 'asc' },
  })
  return centers.map((c) => c.code)
}

describe('데이터 범위 (DB)', () => {
  it('운영사는 전체를 본다', async () => {
    const operator = await createTestUser('op', { userType: 'OPERATOR' })
    expect(await visibleCenterCodes(operator.id)).toEqual(['GMP', 'ICN', 'PUS'])
  })

  it('센터 직원은 소속 센터만 본다', async () => {
    const worker = await createTestUser('icn.worker', { centerIds: [icn] })
    expect(await visibleCenterCodes(worker.id)).toEqual(['ICN'])
  })

  it('여러 센터 소속이면 그 센터들을 본다', async () => {
    const manager = await createTestUser('manager', { centerIds: [icn, pus] })
    expect(await visibleCenterCodes(manager.id)).toEqual(['ICN', 'PUS'])
  })

  it('사용 중지된 센터는 소속이어도 보이지 않는다', async () => {
    const gmp = await prisma.center.findUniqueOrThrow({ where: { code: 'GMP' } })
    const worker = await createTestUser('gmp.worker', { centerIds: [gmp.id, icn] })
    expect(await visibleCenterCodes(worker.id)).toEqual(['ICN'])
  })

  it('소속 센터가 없는 센터 직원은 아무것도 보지 못한다', async () => {
    const orphan = await createTestUser('orphan')
    expect(await loadDataScope(orphan.id)).toEqual({ kind: 'NONE' })
    expect(await visibleCenterCodes(orphan.id)).toEqual([])
  })

  it('화주사 사용자는 자기 화주사 범위이고, 화주사 칸이 없는 표에는 범위를 걸 수 없다 (오류)', async () => {
    const gana = await createTestShipper('GANA')
    const shipperUser = await createTestUser('gana.user', {
      userType: 'SHIPPER',
      shipperId: gana.id,
    })

    expect(await loadDataScope(shipperUser.id)).toEqual({ kind: 'SHIPPER', shipperId: gana.id })
    await expect(visibleCenterCodes(shipperUser.id)).rejects.toThrow(ScopeFieldMissingError)
  })

  it('화주사 사용자는 자기 화주사 데이터만 본다 (화주사 표)', async () => {
    const gana = await createTestShipper('GANA')
    await createTestShipper('DARA')
    const shipperUser = await createTestUser('gana.user', {
      userType: 'SHIPPER',
      shipperId: gana.id,
    })

    const scope = await loadDataScope(shipperUser.id)
    const shippers = await prisma.shipper.findMany({ where: scopeFilter(scope, { shipper: 'id' }) })
    expect(shippers.map((s) => s.code)).toEqual(['GANA'])
  })

  it('사용 중지 계정·없는 사용자는 NONE', async () => {
    const op = await createTestUser('op2', { userType: 'OPERATOR' })
    await prisma.user.update({ where: { id: op.id }, data: { isActive: false } })
    expect(await loadDataScope(op.id)).toEqual({ kind: 'NONE' })
    expect(await loadDataScope('no-such-user')).toEqual({ kind: 'NONE' })
  })
})
