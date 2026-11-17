import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createTestCenter } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import {
  applyRegionChange,
  centerAtDate,
  confirmSuggested,
  planRegionChange,
} from './region-assign'
import { loadRegionMaster } from './region-load'
import { suggestNewZips } from './region-suggest'

// 권역 배정 저장 공통 (미리보기 → 작업 단위 + 배정표 + 이력) · 갱신 배치 추천
// 샘플: 권선구 16613 권선동 / 16620 호매실동 / 16625 금곡동+호매실동, 이천 17384, 강남 06236

const OP = TEST_OPERATOR_ID
let suwon = 0n
let icheon = 0n

const apply = (zips: string[], centerId: bigint | null, tempZone = 'ALL') =>
  prisma.$transaction((tx) =>
    applyRegionChange(tx, OP, {
      zips,
      centerId,
      tempZone,
      changeType: centerId ? 'GRID_ASSIGN' : 'UNASSIGN',
      scopeDesc: '테스트',
    }),
  )

const mapOf = async (tempZone = 'ALL') =>
  Object.fromEntries(
    (
      await prisma.regionCenterMap.findMany({
        where: { operatorId: OP, tempZone },
        select: { zipCode: true, centerId: true },
      })
    ).map((m) => [m.zipCode, m.centerId]),
  )

beforeEach(async () => {
  await resetDatabase()
  await loadRegionMaster(prisma, {
    loadVer: '202611',
    bjdFile: 'src/test/fixtures/region/bjd-sample.csv',
    addressFiles: ['src/test/fixtures/region/address-sample.txt'],
  })
  suwon = (await createTestCenter('SUW', { name: '수원센터' })).id
  icheon = (await createTestCenter('ICN', { name: '이천센터' })).id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('미리보기 · 저장', () => {
  it('미배정 → 센터: 미리보기 요약대로 작업 단위·배정·이력을 한 번에 남긴다', async () => {
    const plan = await planRegionChange(prisma, OP, {
      zips: ['16613', '16620', '16625'],
      tempZone: 'ALL',
      centerId: suwon,
    })
    expect(plan.summary).toEqual([{ from: null, to: '수원센터', count: 3 }])

    const { batchId } = await apply(['16613', '16620', '16625'], suwon)
    expect(await mapOf()).toEqual({ '16613': suwon, '16620': suwon, '16625': suwon })
    expect(await prisma.regionChangeBatch.findUnique({ where: { id: batchId } })).toMatchObject({
      changeType: 'GRID_ASSIGN',
      targetCenterId: suwon,
      changedCount: 3,
    })
    expect(await prisma.regionCenterMapHist.count({ where: { batchId } })).toBe(3)

    // 같은 지정을 다시 하면 바뀌는 것 없음
    const again = await planRegionChange(prisma, OP, {
      zips: ['16613'],
      tempZone: 'ALL',
      centerId: suwon,
    })
    expect(again).toMatchObject({ changes: [], unchanged: 1 })
  })

  it('다른 센터로 덮어쓰기 · 해제, 요약은 전 → 후 센터별로 묶는다', async () => {
    await apply(['16613', '16620'], suwon)
    const plan = await planRegionChange(prisma, OP, {
      zips: ['16613', '16620', '17384'],
      tempZone: 'ALL',
      centerId: icheon,
    })
    expect(plan.summary).toEqual([
      { from: '수원센터', to: '이천센터', count: 2 },
      { from: null, to: '이천센터', count: 1 },
    ])
    await apply(['16613', '16620', '17384'], icheon)
    await apply(['16620'], null)
    expect(await mapOf()).toEqual({ '16613': icheon, '17384': icheon })
    expect(
      await prisma.regionCenterMapHist.findMany({
        where: { zipCode: '16620' },
        orderBy: { id: 'asc' },
        select: { beforeCenterId: true, afterCenterId: true },
      }),
    ).toEqual([
      { beforeCenterId: null, afterCenterId: suwon },
      { beforeCenterId: suwon, afterCenterId: icheon },
      { beforeCenterId: icheon, afterCenterId: null },
    ])
  })

  it('없는·폐지 우편번호는 빼고 알려 준다 (폐지는 해제만 된다)', async () => {
    await prisma.regionZip.update({ where: { code: '30145' }, data: { abolishedYn: 'Y' } })
    const plan = await planRegionChange(prisma, OP, {
      zips: ['16613', '99999', '30145', '16613'],
      tempZone: 'ALL',
      centerId: suwon,
    })
    expect(plan.invalid).toEqual([
      { zipCode: '99999', reason: '없는 우편번호' },
      { zipCode: '30145', reason: '폐지된 우편번호' },
    ])
    expect(plan.changes.map((c) => c.zipCode)).toEqual(['16613'])
  })

  it('일시중지·폐쇄 센터, 취급하지 않는 온도대에는 배정할 수 없다', async () => {
    await prisma.center.update({
      where: { id: icheon },
      data: { status: 'SUSPENDED', statusReason: '테스트' },
    })
    await expect(apply(['16613'], icheon)).rejects.toThrow(/준비중·운영중/)
    await expect(apply(['16613'], suwon, 'FROZEN')).rejects.toThrow(/냉동/)
    await prisma.centerTempZone.create({ data: { centerId: suwon, tempZoneCd: 'FROZEN' } })
    await apply(['16613'], suwon, 'FROZEN')
    expect(await mapOf('FROZEN')).toEqual({ '16613': suwon })
  })

  it('특정 날짜 기준 배송센터를 이력으로 되짚는다 (온도대 행 → ALL)', async () => {
    await apply(['16613'], suwon)
    const t1 = new Date()
    await new Promise((r) => setTimeout(r, 20))
    await apply(['16613'], icheon)
    expect(await centerAtDate(prisma, OP, '16613', t1)).toBe(suwon)
    expect(await centerAtDate(prisma, OP, '16613', new Date())).toBe(icheon)
    expect(await centerAtDate(prisma, OP, '16613', new Date('2000-01-01'))).toBeNull()
    expect(await centerAtDate(prisma, OP, '16613', new Date(), 'FROZEN')).toBe(icheon)
  })
})

describe('갱신 배치: 신규 우편번호 추천', () => {
  it('같은 읍면동의 다른 우편번호가 가장 많이 배정된 센터로 추천(확인 전), 확인하면 Y', async () => {
    // 16620(호매실동)이 새로 생겼다고 보고, 호매실동의 다른 우편번호 16625는 이천
    await apply(['16625'], icheon)
    await apply(['16613'], suwon)
    const [result] = await suggestNewZips(prisma, ['16620'])
    expect(result).toMatchObject({ operatorId: OP, suggested: 1, abolishedAssigned: 0 })
    expect(
      await prisma.regionCenterMap.findFirst({
        where: { zipCode: '16620' },
        select: { centerId: true, assignType: true, confirmYn: true },
      }),
    ).toEqual({ centerId: icheon, assignType: 'SUGGESTED', confirmYn: 'N' })
    // 같은 읍면동이 미배정이면 추천하지 않는다 (이천 17384의 마장면은 비어 있음)
    expect((await suggestNewZips(prisma, ['17384']))[0].suggested).toBe(0)

    // 같은 센터로 다시 지정하면 '확인'으로 바뀐다
    const plan = await planRegionChange(prisma, OP, {
      zips: ['16620'],
      tempZone: 'ALL',
      centerId: icheon,
    })
    expect(plan.changes).toMatchObject([{ zipCode: '16620', confirmOnly: true }])

    const { count } = await prisma.$transaction((tx) =>
      confirmSuggested(tx, OP, { zips: ['16620', '16613'], tempZone: 'ALL' }),
    )
    expect(count).toBe(1)
    expect(await prisma.regionCenterMap.count({ where: { confirmYn: 'N' } })).toBe(0)
  })

  it('폐지 우편번호에 남은 배정 수를 센다', async () => {
    await apply(['30145'], suwon)
    await prisma.regionZip.update({ where: { code: '30145' }, data: { abolishedYn: 'Y' } })
    expect((await suggestNewZips(prisma, []))[0]).toMatchObject({ abolishedAssigned: 1 })
  })
})
