import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'
import { resetDatabase } from '@/test/reset-database'
import { loadRegionMaster } from './region-load'

// 지역 마스터 적재 (docs/decisions/0076) — 샘플 파일로 전체분 적재·재적재

const FIXTURE = 'src/test/fixtures/region'
const input = (loadVer: string, addressFiles = [`${FIXTURE}/address-sample.txt`]) => ({
  loadVer,
  bjdFile: `${FIXTURE}/bjd-sample.csv`,
  addressFiles,
})

beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('지역 마스터 적재', () => {
  it('법정동·우편번호·우편번호↔법정동을 채우고 적재 이력을 남긴다', async () => {
    const result = await loadRegionMaster(prisma, input('202611'))
    expect(result).toMatchObject({ bjdCount: 15, zipCount: 6, abolishedZips: [] })
    expect(result.newZips.sort()).toEqual(['06236', '16613', '16620', '16625', '17384', '30145'])

    expect(await prisma.regionZip.findUnique({ where: { code: '16613' } })).toMatchObject({
      sidoCode: '41',
      sigunguCode: '41113',
      repAddress: '권선로 300~420, 세권로 88',
      addressCount: 4,
      firstLoadVer: '202611',
      abolishedYn: 'N',
    })
    expect(await prisma.regionZipBjd.count({ where: { zipCode: '16625' } })).toBe(2)
    expect(await prisma.regionBjd.findUnique({ where: { code: '1168010200' } })).toMatchObject({
      abolishedYn: 'Y',
      level: 3,
    })
    expect(await prisma.regionLoadHist.findFirst()).toMatchObject({
      status: 'DONE',
      zipCount: 6,
      newCount: 6,
    })
  })

  it('다시 적재하면 기존 우편번호는 최종 버전만 바뀌고, 이번에 없는 우편번호는 폐지로 표시한다', async () => {
    await loadRegionMaster(prisma, input('202610'))
    // 새 버전에는 세종 우편번호를 빼고 적재
    const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(`${tmpdir()}/region-`)
    const lines = readFileSync(`${FIXTURE}/address-sample.txt`, 'utf-8')
      .split('\n')
      .filter((l) => !l.includes('|30145|'))
    writeFileSync(`${dir}/address.txt`, lines.join('\n'))

    const result = await loadRegionMaster(prisma, input('202611', [`${dir}/address.txt`]))
    expect(result).toMatchObject({ newZips: [], abolishedZips: ['30145'] })
    expect(await prisma.regionZip.findUnique({ where: { code: '16613' } })).toMatchObject({
      firstLoadVer: '202610',
      lastLoadVer: '202611',
    })
    expect((await prisma.regionZip.findUnique({ where: { code: '30145' } }))?.abolishedYn).toBe('Y')
  })

  it('법정동 파일에 없는 법정동(면 → 읍 승격으로 새 코드)은 주소DB 이름으로 덧붙이고 우편번호를 빠뜨리지 않는다', async () => {
    const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(`${tmpdir()}/region-`)
    // 법정동 파일에는 '마장면 이치리'(4150025021)만 있고, 주소DB는 승격 뒤 새 코드 '마장읍 이치리'(4150026021)를 쓴다
    const promoted = [1, 2].map(
      (n) =>
        `N415002602100${n}|4150026021|경기도|이천시|마장읍|이치리|0|1|0|R9|이치로|0|${n * 10}|0|4150026000|마장읍|17390||20260101|0||||`,
    )
    writeFileSync(
      `${dir}/address.txt`,
      [readFileSync(`${FIXTURE}/address-sample.txt`, 'utf-8').trimEnd(), ...promoted].join('\n'),
    )

    const result = await loadRegionMaster(prisma, input('202611', [`${dir}/address.txt`]))
    expect(result.addedBjds).toEqual([
      { code: '4150026021', name: '경기도 이천시 마장읍 이치리', addressCount: 2 },
    ])
    expect(result).toMatchObject({ bjdCount: 16, zipCount: 7 })
    expect(await prisma.regionBjd.findUnique({ where: { code: '4150026021' } })).toMatchObject({
      sigunguCode: '41500',
      sigunguName: '이천시',
      emdName: '마장읍',
      riName: '이치리',
      level: 4,
      abolishedYn: 'N',
    })
    expect(await prisma.regionZip.findUnique({ where: { code: '17390' } })).toMatchObject({
      addressCount: 2,
      repAddress: '이치로 10~20',
    })
    expect(await prisma.regionZipBjd.count({ where: { zipCode: '17390' } })).toBe(1)
  })

  it('파일 모양이 틀리면 적재 이력에 실패를 남긴다', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(`${tmpdir()}/region-`)
    writeFileSync(`${dir}/bad.txt`, 'a|b|c\n')
    await expect(loadRegionMaster(prisma, input('202611', [`${dir}/bad.txt`]))).rejects.toThrow(
      /열 모양/,
    )
    expect(await prisma.regionLoadHist.findFirst()).toMatchObject({ status: 'FAILED' })
  })
})
