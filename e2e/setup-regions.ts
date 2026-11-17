// 브라우저 테스트(e2e) 준비: 권역설정용 샘플 지역 마스터 (docs/decisions/0076)
// 테스트 샘플(src/test/fixtures/region)을 적재하고, 권역 배정·작업·이력은 비운다 (여러 번 실행해도 같은 시작 상태)
// 실행: DATABASE_URL을 e2e DB로 바꿔서, react-server 조건으로 (scripts/e2e-prepare.sh가 한다)
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { loadRegionMaster } from '../src/lib/regions/region-load'

async function main() {
  await prisma.regionCenterMapHist.deleteMany()
  await prisma.regionCenterMap.deleteMany()
  await prisma.regionChangeBatch.deleteMany()
  await loadRegionMaster(prisma, {
    loadVer: '202611',
    bjdFile: 'src/test/fixtures/region/bjd-sample.csv',
    addressFiles: ['src/test/fixtures/region/address-sample.txt'],
    actor: 'e2e',
  })
  console.log('권역설정 샘플 지역 마스터 적재 · 배정 비움')
}

main().finally(() => prisma.$disconnect())
