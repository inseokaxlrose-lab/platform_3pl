import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createTestCenter } from '@/test/factories'
import { resetDatabase, TEST_OPERATOR_ID } from '@/test/reset-database'
import type { NormResult } from './address-normalize'
import { getDefaultCenter, resolveCenterByAddress } from './center-resolve'
import { loadRegionMaster } from './region-load'

// 배송센터 결정 (우편번호 배정표) — 샘플 지역 마스터
//   수원시 권선구(41113): 16613 권선동 / 16620 호매실동 / 16625 금곡동+호매실동
//   이천시 마장면 이치리: 17384 / 강남구 역삼동: 06236

let suwon = 0n
let icheon = 0n
let seoul = 0n
let batchId = 0n

const norm = (partial: Partial<NormResult>): NormResult => ({
  grade: 'A',
  method: 'API_EXACT',
  sourceMethod: 'API_EXACT',
  zipCode: null,
  bjdCode: null,
  sigunguCode: null,
  sidoCode: null,
  roadAddress: null,
  jibunAddress: null,
  detailAddress: null,
  bdMgtSn: null,
  latitude: null,
  longitude: null,
  candidates: [],
  zipMismatch: false,
  apiUnavailable: null,
  ...partial,
})

const assign = (zipCode: string, centerId: bigint, tempZone = 'ALL') =>
  prisma.regionCenterMap.create({
    data: { operatorId: TEST_OPERATOR_ID, zipCode, tempZone, centerId, lastBatchId: batchId },
  })

const resolve = (n: Partial<NormResult>, tempZone?: string) =>
  resolveCenterByAddress(prisma, TEST_OPERATOR_ID, norm(n), tempZone)

beforeEach(async () => {
  await resetDatabase()
  await loadRegionMaster(prisma, {
    loadVer: '202611',
    bjdFile: 'src/test/fixtures/region/bjd-sample.csv',
    addressFiles: ['src/test/fixtures/region/address-sample.txt'],
  })
  suwon = (await createTestCenter('SUW', { name: '수원센터' })).id
  icheon = (await createTestCenter('ICN', { name: '이천센터' })).id
  seoul = (await createTestCenter('SEL', { name: '서울센터' })).id
  batchId = (
    await prisma.regionChangeBatch.create({
      data: { operatorId: TEST_OPERATOR_ID, changeType: 'GRID_ASSIGN', scopeDesc: '테스트' },
    })
  ).id
  for (const zip of ['16613', '16620', '16625']) await assign(zip, suwon)
  await assign('17384', icheon)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('resolveCenterByAddress', () => {
  it('A·B: 우편번호로 배정표를 찾는다', async () => {
    expect(await resolve({ grade: 'A', zipCode: '16613' })).toMatchObject({
      centerId: suwon,
      centerName: '수원센터',
      resolveLevel: 'ZIP',
      resolveKey: '16613',
      needConfirm: false,
      reason: null,
      warnings: [],
    })
  })

  it('온도대 행이 있으면 그 센터, 없으면 ALL 행', async () => {
    await assign('16613', icheon, 'FROZEN')
    expect((await resolve({ zipCode: '16613' }, 'FROZEN')).centerId).toBe(icheon)
    expect((await resolve({ zipCode: '16613' }, 'CHILLED')).centerId).toBe(suwon)
    expect((await resolve({ zipCode: '16613' })).centerId).toBe(suwon)
  })

  it('배정되지 않은 우편번호는 확인 필요', async () => {
    expect(await resolve({ zipCode: '06236' })).toMatchObject({
      centerId: null,
      needConfirm: true,
      reason: '권역설정에 배정되지 않은 지역입니다.',
    })
  })

  it('C: 그 법정동의 우편번호가 모두 같은 센터면 그 센터, 섞이면 확인 필요 + 후보', async () => {
    // 호매실동 → 16620·16625
    expect(await resolve({ grade: 'C', bjdCode: '4111313600' })).toMatchObject({
      centerId: suwon,
      resolveLevel: 'BJD',
      resolveKey: '4111313600',
      needConfirm: false,
    })
    await prisma.regionCenterMap.updateMany({
      where: { zipCode: '16625' },
      data: { centerId: icheon },
    })
    const mixed = await resolve({ grade: 'C', bjdCode: '4111313600' })
    expect(mixed).toMatchObject({ centerId: null, needConfirm: true })
    expect(mixed.reason).toContain('여러 센터')
    expect(mixed.candidates.map((c) => c.centerName).sort()).toEqual(['수원센터', '이천센터'])
  })

  it('C: 읍면동이면 그 아래 리의 우편번호까지 본다', async () => {
    expect(await resolve({ grade: 'C', bjdCode: '4150025000' })).toMatchObject({
      centerId: icheon,
      resolveLevel: 'BJD',
    })
  })

  it('D: 시군구 우편번호가 모두 같은 센터면 그 센터 + 확인 권장 (구가 있는 시는 아래 구 전부)', async () => {
    for (const sigunguCode of ['41113', '41110']) {
      const r = await resolve({ grade: 'D', method: 'TEXT_PARSE', sigunguCode })
      expect(r).toMatchObject({ centerId: suwon, resolveLevel: 'SIGUNGU', needConfirm: false })
      expect(r.warnings).toEqual(['시군구까지만 확인된 주소입니다. 확인을 권장합니다.'])
    }
  })

  it('D: 일부 우편번호가 미배정이면 확인 필요', async () => {
    await prisma.regionCenterMap.deleteMany({ where: { zipCode: '16625' } })
    const r = await resolve({ grade: 'D', sigunguCode: '41113' })
    expect(r).toMatchObject({ centerId: null, needConfirm: true })
    expect(r.reason).toContain('배정되지 않은 우편번호가 1개')
  })

  it('D(우편번호만 확인): 그 우편번호로 정하되 확인 권장', async () => {
    const r = await resolve({
      grade: 'D',
      method: 'ZIP_ONLY',
      zipCode: '16613',
      sigunguCode: '41113',
    })
    expect(r).toMatchObject({ centerId: suwon, resolveLevel: 'ZIP', needConfirm: false })
    expect(r.warnings[0]).toContain('우편번호로만')
  })

  it('F: 확인 필요', async () => {
    expect(await resolve({ grade: 'F' })).toMatchObject({
      centerId: null,
      resolveLevel: null,
      needConfirm: true,
    })
  })

  it('운영사 자동 지정 등급보다 낮으면 센터를 알려 주되 확인 필요', async () => {
    await prisma.operator.update({
      where: { id: TEST_OPERATOR_ID },
      data: { regionAutoGrade: 'B' },
    })
    const r = await resolve({ grade: 'C', bjdCode: '4111312900' })
    expect(r).toMatchObject({ centerId: suwon, needConfirm: true })
    expect(r.reason).toContain('B 이상')
    expect((await resolve({ grade: 'B', zipCode: '16613' })).needConfirm).toBe(false)
  })

  it('일시중지 센터는 경고, 폐쇄 센터는 확인 필요', async () => {
    await prisma.center.update({
      where: { id: suwon },
      data: { status: 'SUSPENDED', statusReason: '테스트' },
    })
    expect((await resolve({ zipCode: '16613' })).warnings).toEqual([
      '일시중지 센터입니다 (수원센터).',
    ])
    await prisma.center.update({
      where: { id: suwon },
      data: { status: 'CLOSED', closedOn: new Date('2026-11-01') },
    })
    const closed = await resolve({ zipCode: '16613' })
    expect(closed).toMatchObject({ centerId: null, needConfirm: true })
    expect(closed.reason).toContain('폐쇄')
  })

  it('입력 우편번호가 주소와 다르면 경고', async () => {
    expect((await resolve({ zipCode: '16613', zipMismatch: true })).warnings).toEqual([
      '입력한 우편번호가 주소와 다릅니다 (주소 기준으로 정했습니다).',
    ])
  })

  it('다른 운영사의 배정은 보지 않는다', async () => {
    const other = await resolveCenterByAddress(
      prisma,
      TEST_OPERATOR_ID + 999n,
      norm({ zipCode: '16613' }),
    )
    expect(other).toMatchObject({ centerId: null, needConfirm: true })
  })
})

describe('getDefaultCenter', () => {
  it('우편번호·법정동·시군구의 기본 센터 (모두 같을 때만)', async () => {
    expect(await getDefaultCenter(prisma, TEST_OPERATOR_ID, { zipCode: '17384' })).toEqual({
      centerId: icheon,
      centerName: '이천센터',
    })
    expect(
      await getDefaultCenter(prisma, TEST_OPERATOR_ID, { bjdCode: '4111312900' }),
    ).toMatchObject({
      centerId: suwon,
    })
    expect(
      await getDefaultCenter(prisma, TEST_OPERATOR_ID, { sigunguCode: '41113' }),
    ).toMatchObject({
      centerId: suwon,
    })
    await assign('06236', seoul)
    await prisma.regionCenterMap.updateMany({
      where: { zipCode: '16625' },
      data: { centerId: seoul },
    })
    expect(await getDefaultCenter(prisma, TEST_OPERATOR_ID, { sigunguCode: '41113' })).toBeNull()
    expect(await getDefaultCenter(prisma, TEST_OPERATOR_ID, {})).toBeNull()
  })
})
