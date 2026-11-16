import { expect, test, type Browser, type Page } from '@playwright/test'
import { E2E_ACCOUNTS, E2E_ITEM, E2E_LOCATION } from './e2e-env'

// 전체 흐름 브라우저 테스트 (ROADMAP M7, docs/decisions/0065)
// 화주사가 포털에서 ASN 등록 → 센터 작업자가 검수 → 라벨 미리보기 → 입고 확정 → 적치
// → 화주사가 포털에서 늘어난 재고를 확인한다 (PRD 완료 기준)
// 사람마다 따로 로그인한 브라우저(컨텍스트)를 쓴다. 비밀번호는 .env의 SEED_SAMPLE_PASSWORD

test.describe.configure({ mode: 'serial' })

async function signIn(browser: Browser, username: string): Promise<Page> {
  const password = process.env.SEED_SAMPLE_PASSWORD
  if (!password) throw new Error('SEED_SAMPLE_PASSWORD가 .env에 없습니다.')
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/login')
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  return page
}

// 이 실행에서만 쓰는 로트번호 (같은 e2e DB에서 여러 번 실행해도 섞이지 않게)
const lot = `LE2E${Date.now().toString().slice(-6)}`

test('입고 한 바퀴: 포털 ASN → 검수 → 라벨 → 확정 → 적치 → 포털 재고', async ({ browser }) => {
  // ① 화주사: 포털에서 ASN 등록 (BOX 10 = 240 EA)
  const shipper = await signIn(browser, E2E_ACCOUNTS.shipper)
  await shipper.goto('/portal/asn/new')
  await shipper.locator('#lines-0-itemId').click()
  await shipper.getByLabel('품목코드·이름·바코드').fill(E2E_ITEM.code)
  await shipper.getByLabel('품목코드·이름·바코드').press('Enter')
  await shipper.locator('#lines-0-unit').click()
  await shipper.getByRole('option', { name: 'BOX', exact: true }).click()
  await shipper.locator('#lines-0-qty').fill('10')
  await expect(shipper.getByText('= 240 EA')).toBeVisible()
  await shipper.getByRole('button', { name: '저장' }).first().click()
  await shipper.waitForURL(/\/portal\/asn\/\d+$/)
  const asnId = shipper.url().split('/').pop()!
  const asnNo = (await shipper.getByRole('heading', { level: 1 }).textContent())!
    .replace('ASN ', '')
    .trim()
  expect(asnNo).toMatch(/^AS\d{6}-\d{5}$/)

  // ② 센터 작업자: 검수 240 EA, 로트·유통기한 (가나식품은 로트·유통기한 관리)
  const worker = await signIn(browser, E2E_ACCOUNTS.worker)
  await worker.goto(`/admin/inbound/inspection/${asnId}`)
  await worker.locator('#insp-line').click()
  await worker.getByRole('option', { name: new RegExp(E2E_ITEM.code) }).click()
  await worker.locator('#insp-qty').fill('240')
  await worker.locator('#insp-lot').fill(lot)
  await worker.locator('#insp-expiry').fill('2027-12-31')
  await worker.getByRole('button', { name: '검수 등록' }).click()
  await expect(worker.getByRole('cell', { name: lot })).toBeVisible()

  // ③ 라벨: 240 EA ÷ PLT 1,440 → 1장 미리보기 (인쇄 창은 열지 않는다)
  await worker.goto(`/admin/inbound/labels/${asnId}`)
  await worker.getByRole('checkbox', { name: '행 선택' }).first().click()
  await worker.getByRole('button', { name: /미리보기/ }).click()
  await expect(worker.locator('.label-sheet')).toHaveCount(1)
  await expect(worker.locator('.label-sheet')).toContainText('240 EA')
  await expect(worker.locator('.label-sheet')).toContainText(lot)

  // ④ 입고 확정 (기본 = 남은 전부 240) → 확정완료
  await worker.goto(`/admin/inbound/confirm/${asnId}`)
  await worker.getByRole('button', { name: /^입고 확정 \(/ }).click()
  await worker.getByRole('alertdialog').getByRole('button', { name: '입고 확정' }).click()
  // 성공 안내 문구가 나올 때까지 기다린다 (서버 저장 완료)
  await expect(worker.getByText(/로 확정했습니다/)).toBeVisible()

  // ⑤ 적치: 입고대기 → E2E-01 → 적치완료
  await worker.goto(`/admin/inbound/putaway/${asnId}`)
  // 고르기 상자(combobox)는 겉 글자가 이름이 되지 않아 id로 찾는다
  await worker.locator('[id^="putaway-location-"]').first().click()
  await worker.getByLabel('창고·로케이션 코드').fill(E2E_LOCATION.code)
  await worker.getByLabel('창고·로케이션 코드').press('Enter')
  await worker.getByRole('button', { name: /^적치 등록 \(/ }).click()
  await worker.getByRole('alertdialog').getByRole('button', { name: '적치 등록' }).click()
  await expect(worker.getByText(/건을 적치했습니다/)).toBeVisible()
  await expect(
    worker.getByRole('cell', { name: `${E2E_LOCATION.warehouse} / ${E2E_LOCATION.code}` }),
  ).toBeVisible()

  // ⑥ 화주사: 포털 ASN 목록은 확정완료, 내 재고(로트별)에 이번 로트 240 EA
  await shipper.goto('/portal/asn')
  await expect(shipper.getByRole('row', { name: new RegExp(asnNo) })).toContainText('확정완료')
  await shipper.goto(`/portal/stock?view=lot&q=${lot}`)
  const row = shipper.getByRole('row', { name: new RegExp(lot) })
  await expect(row).toContainText(E2E_ITEM.code)
  await expect(row).toContainText('240 EA')
})
