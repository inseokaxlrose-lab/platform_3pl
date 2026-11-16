import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createTestCenter, createTestShipper } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import { resolveDeliveryCenter } from './resolve-delivery-center'

// 배송 센터 자동 배정 (0072) — 사용자 예시 그대로
// 서울센터 = 서울 전체, 경기센터 = 경기 전체 + 서울 강남구, 화주사는 두 센터를 다 이용

const GANGDONG = '1174010100' // 서울 강동구
const GANGNAM = '1168010100' // 서울 강남구

let seoulId = 0n
let gyeonggiId = 0n
let shipperId = 0n
let zoneNo = 0

async function zone(centerId: bigint, regions: string[], priority = 100, status = 'ACTIVE') {
  zoneNo += 1
  return prisma.deliveryZone.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      centerId,
      systemCode: `DZ-T${zoneNo}`,
      code: `Z${zoneNo}`,
      name: `권역${zoneNo}`,
      priority,
      status,
      regions: { create: regions.map((regionCode) => ({ regionCode })) },
    },
  })
}

async function customer(deliveryCenterId: bigint | null, regionCode = GANGNAM) {
  zoneNo += 1
  return prisma.customer.create({
    data: {
      operatorId: TEST_OPERATOR_ID,
      shipperId,
      systemCode: `CU-T${zoneNo}`,
      code: `C${zoneNo}`,
      name: `거래처${zoneNo}`,
      regionCode,
      deliveryCenterId,
    },
  })
}

beforeEach(async () => {
  await resetDatabase()
  seoulId = (await createTestCenter('SEL', { name: '서울센터' })).id
  gyeonggiId = (await createTestCenter('GGI', { name: '경기센터' })).id
  shipperId = (await createTestShipper('GANA')).id
  await prisma.shipperCenter.createMany({
    data: [
      { shipperId, centerId: seoulId },
      { shipperId, centerId: gyeonggiId },
    ],
  })
  await zone(seoulId, ['11'])
  await zone(gyeonggiId, ['41', '11680'])
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('배송 센터 자동 배정', () => {
  it('강동구 → 서울센터, 강남구 → 경기센터 (더 구체적인 지역 우선)', async () => {
    expect(await resolveDeliveryCenter({ shipperId, regionCode: GANGDONG })).toMatchObject({
      status: 'AUTO',
      centerId: String(seoulId),
    })
    expect(await resolveDeliveryCenter({ shipperId, regionCode: GANGNAM })).toMatchObject({
      status: 'AUTO',
      centerId: String(gyeonggiId),
      zone: { matchedRegion: '11680' },
    })
  })

  it('거래처에 배송 센터를 지정하면 그것이 먼저 (강남구라도 서울센터), 비어 있으면 권역 규칙', async () => {
    const fixed = await customer(seoulId)
    expect(await resolveDeliveryCenter({ shipperId, customerId: fixed.id })).toEqual({
      status: 'CUSTOMER',
      centerId: String(seoulId),
    })
    const free = await customer(null)
    expect(await resolveDeliveryCenter({ shipperId, customerId: free.id })).toMatchObject({
      status: 'AUTO',
      centerId: String(gyeonggiId),
    })
  })

  it('같은 수준·같은 우선순위로 겹치면 배정 대기, 번호가 다르면 작은 쪽', async () => {
    const incheonId = (await createTestCenter('ICN', { name: '인천센터' })).id
    await prisma.shipperCenter.create({ data: { shipperId, centerId: incheonId } })
    const incheonZone = await zone(incheonId, ['11680'])

    const pending = await resolveDeliveryCenter({ shipperId, regionCode: GANGNAM })
    if (pending.status !== 'PENDING') throw new Error(`배정 대기여야 합니다: ${pending.status}`)
    expect(pending.candidates.map((c) => c.centerName).sort()).toEqual(['경기센터', '인천센터'])

    await prisma.deliveryZone.update({ where: { id: incheonZone.id }, data: { priority: 10 } })
    expect(await resolveDeliveryCenter({ shipperId, regionCode: GANGNAM })).toMatchObject({
      status: 'AUTO',
      centerId: String(incheonId),
    })
  })

  it('화주사가 이용하지 않는 센터·사용 중지 권역은 후보에서 빠지고, 맞는 권역이 없으면 없음', async () => {
    const other = (await createTestShipper('DARA')).id
    await prisma.shipperCenter.create({ data: { shipperId: other, centerId: seoulId } })
    // 다라상사는 서울센터만 → 강남구도 서울센터
    expect(await resolveDeliveryCenter({ shipperId: other, regionCode: GANGNAM })).toMatchObject({
      status: 'AUTO',
      centerId: String(seoulId),
    })

    await prisma.deliveryZone.updateMany({
      where: { centerId: gyeonggiId },
      data: { status: 'INACTIVE' },
    })
    expect(await resolveDeliveryCenter({ shipperId, regionCode: GANGNAM })).toMatchObject({
      centerId: String(seoulId),
    })
    expect(await resolveDeliveryCenter({ shipperId, regionCode: '2611010100' })).toEqual({
      status: 'NONE',
      candidates: [],
    })
  })
})
