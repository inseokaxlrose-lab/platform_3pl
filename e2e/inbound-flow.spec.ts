import { expect, test } from '@playwright/test'
import { E2E_ACCOUNTS, E2E_ITEM } from './e2e-env'
import {
  confirmAsn,
  createPortalAsn,
  inspectAsn,
  newLot,
  previewLabels,
  putawayAsn,
  signIn,
} from './flows'

// 전체 흐름 브라우저 테스트 (ROADMAP M7, docs/decisions/0065)
// 화주사가 포털에서 ASN 등록 → 센터 작업자가 검수 → 라벨 미리보기 → 입고 확정 → 적치
// → 화주사가 포털에서 늘어난 재고를 확인한다 (PRD 완료 기준)
// 단계별 동작은 e2e/flows.ts (도움말 사진 촬영과 공용)

test.describe.configure({ mode: 'serial' })

const lot = newLot()

test('입고 한 바퀴: 포털 ASN → 검수 → 라벨 → 확정 → 적치 → 포털 재고', async ({ browser }) => {
  const shipper = await signIn(browser, E2E_ACCOUNTS.shipper)
  const { asnId, asnNo } = await createPortalAsn(shipper)

  const worker = await signIn(browser, E2E_ACCOUNTS.worker)
  await inspectAsn(worker, asnId, lot)

  await previewLabels(worker, asnId)
  await expect(worker.locator('.label-sheet')).toContainText('240 EA')
  await expect(worker.locator('.label-sheet')).toContainText(lot)

  await confirmAsn(worker, asnId)
  await putawayAsn(worker, asnId)

  // ⑥ 화주사: 포털 ASN 목록은 확정완료, 내 재고(로트별)에 이번 로트 240 EA
  await shipper.goto('/portal/asn')
  await expect(shipper.getByRole('row', { name: new RegExp(asnNo) })).toContainText('확정완료')
  await shipper.goto(`/portal/stock?view=lot&q=${lot}`)
  const row = shipper.getByRole('row', { name: new RegExp(lot) })
  await expect(row).toContainText(E2E_ITEM.code)
  await expect(row).toContainText('240 EA')
})
