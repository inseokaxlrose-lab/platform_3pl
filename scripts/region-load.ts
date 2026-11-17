// 지역 마스터 적재: npm run region:load -- --ver 202611 [--dir data/region] (docs/decisions/0076)
// data/region 폴더에 받아 둔 파일을 읽는다 (폴더는 git에 올리지 않는다)
//   - 법정동코드 파일: 이름에 '법정동'이 들어간 .csv 또는 .txt (공공데이터포털 '국토교통부_법정동코드' 또는 code.go.kr 전체자료)
//   - 주소DB 전체분: 그 밖의 .txt 전부 (juso.go.kr 주소DB 도로명주소 한글, 시도별 파일)
import 'dotenv/config'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '../src/lib/prisma'
import { loadRegionMaster } from '../src/lib/regions/region-load'
import { suggestNewZips } from '../src/lib/regions/region-suggest'

function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? fallback : process.argv[index + 1]
}

async function main() {
  const loadVer = arg('ver')
  const dir = arg('dir', 'data/region')!
  if (!loadVer || !/^\d{6}$/.test(loadVer)) {
    throw new Error('기준 데이터 연월을 --ver 202611 처럼 넣어 주세요.')
  }
  const files = readdirSync(dir).filter((f) => /\.(txt|csv)$/i.test(f))
  // macOS는 파일 이름 한글을 자모로 풀어(NFD) 저장하므로 완성형(NFC)으로 맞춰 비교한다
  const bjdFile = files.find((f) => f.normalize('NFC').includes('법정동'))
  const addressFiles = files.filter((f) => f !== bjdFile && /\.txt$/i.test(f))
  if (!bjdFile) throw new Error(`${dir}에 법정동코드 파일(이름에 '법정동')이 없습니다.`)
  if (addressFiles.length === 0) throw new Error(`${dir}에 주소DB 파일(.txt)이 없습니다.`)

  console.log(`적재 시작: 버전 ${loadVer}, 법정동 ${bjdFile}, 주소DB ${addressFiles.length}개`)
  const started = Date.now()
  const result = await loadRegionMaster(prisma, {
    loadVer,
    bjdFile: join(dir, bjdFile),
    addressFiles: addressFiles.map((f) => join(dir, f)),
    actor: 'region-load',
  })
  console.log(
    [
      `적재 완료 (${Math.round((Date.now() - started) / 1000)}초)`,
      `법정동 ${result.bjdCount.toLocaleString()}건, 우편번호 ${result.zipCount.toLocaleString()}건`,
      `신규 우편번호 ${result.newZips.length}건, 폐지 ${result.abolishedZips.length}건`,
      `법정동 파일에 없어 주소DB 이름으로 덧붙인 법정동 ${result.addedBjds.length}건${
        result.addedBjds.length
          ? ` (법정동 파일이 주소DB보다 오래됨): ${result.addedBjds
              .slice(0, 5)
              .map((b) => `${b.name}(${b.code})`)
              .join(', ')}`
          : ''
      }`,
      `시군구를 넘는 우편번호 ${result.crossSigunguZips.length}건${result.crossSigunguZips.length ? `: ${result.crossSigunguZips.slice(0, 10).join(', ')}` : ''}`,
    ].join('\n'),
  )

  // 갱신 배치: 신규 우편번호 추천 배정 (운영사별), 폐지 우편번호에 남은 배정 수
  const suggestions = await suggestNewZips(prisma, result.newZips)
  for (const s of suggestions) {
    console.log(
      `운영사 ${s.operatorId}: 신규 우편번호 추천 배정 ${s.suggested}건, 폐지 우편번호에 남은 배정 ${s.abolishedAssigned}건`,
    )
  }
}

main()
  .catch((error) => {
    console.error('적재 실패:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
