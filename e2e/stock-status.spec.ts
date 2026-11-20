import { expect, test } from '@playwright/test'
import { E2E_ACCOUNTS } from './e2e-env'

// 재고상태 변경 (docs/decisions/0088): 위치별 재고 한 줄의 일부를 보류 → 보류 조건으로 확인 → 정상으로 되돌리기
// e2e 준비 데이터(입고 흐름이 만든 E2E-WATER 재고)를 쓰고, 끝나면 정상으로 되돌려 수량은 처음과 같다

test('재고상태: 일부 보류(사유) → 보류 조건으로 보기 → 정상으로 되돌리기', async ({ page }) => {
  const password = process.env.SEED_SAMPLE_PASSWORD
  if (!password) throw new Error('SEED_SAMPLE_PASSWORD가 .env에 없습니다.')
  await page.goto('/login')
  await page.locator('#username').fill(E2E_ACCOUNTS.admin)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))

  await page.goto('/admin/stock')
  const firstRow = page.locator('tbody tr').first()
  await expect(firstRow.getByText('정상')).toBeVisible()
  await firstRow.getByRole('button', { name: '상태 변경' }).click()

  // 보류로: 사유를 고르기 전에는 버튼이 꺼져 있다
  const dialog = page.getByRole('dialog', { name: '재고상태 변경' })
  await dialog.locator('#stock-status-to').click()
  await page.getByRole('option', { name: '보류' }).click()
  await dialog.locator('#stock-status-qty').fill('1')
  await expect(dialog.getByRole('button', { name: '상태 변경' })).toBeDisabled()
  await dialog.locator('#stock-status-reason-cd').click()
  await page.getByRole('option', { name: '품질 검사' }).click()
  await dialog.locator('#stock-status-reason').fill('e2e 확인')
  await dialog.getByRole('button', { name: '상태 변경' }).click()
  await expect(dialog).toBeHidden()

  // 보류 조건(상세 조건)으로 보면 1 EA, 가용 0
  await page.goto('/admin/stock?status=HOLD')
  const held = page.locator('tbody tr').first()
  await expect(held.getByText('보류')).toBeVisible()
  await expect(held.getByText('1 EA').first()).toBeVisible()

  // 정상으로 되돌리기: 사유 없이 된다
  await held.getByRole('button', { name: '상태 변경' }).click()
  await dialog.locator('#stock-status-to').click()
  await page.getByRole('option', { name: '정상' }).click()
  await dialog.getByRole('button', { name: '상태 변경' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('조건에 맞는 결과가 없습니다')).toBeVisible()
})
