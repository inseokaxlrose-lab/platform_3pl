import { expect, test } from '@playwright/test'
import { E2E_ACCOUNTS } from './e2e-env'

// 첨부파일 (docs/decisions/0091): 품목 수정 화면에서 이미지 올리기 → 보이기(로그인 확인 주소) → 지우기
// e2e 준비 품목(E2E-WATER)을 쓰고, 끝나면 지워서 처음 상태로 돌아간다

// 1×1 투명 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

test('첨부파일: 품목 이미지 올리기 → 보이기 → 지우기', async ({ page }) => {
  const password = process.env.SEED_SAMPLE_PASSWORD
  if (!password) throw new Error('SEED_SAMPLE_PASSWORD가 .env에 없습니다.')
  await page.goto('/login')
  await page.locator('#username').fill(E2E_ACCOUNTS.admin)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))

  await page.goto('/admin/master/items?keyword=E2E-WATER')
  await page.getByRole('link', { name: 'E2E-WATER' }).first().click()
  const images = page.locator('#section-images')
  await expect(images.getByText('붙인 이미지가 없습니다.')).toBeVisible()

  await images.locator('input[type="file"]').setInputFiles({
    name: 'e2e-water.png',
    mimeType: 'image/png',
    buffer: PNG,
  })
  const thumb = images.getByRole('img', { name: 'e2e-water.png' })
  await expect(thumb).toBeVisible()
  // 이미지 주소는 로그인한 사람에게만 내려 준다
  const src = await thumb.getAttribute('src')
  expect((await page.request.get(src!)).status()).toBe(200)

  await images.getByRole('button', { name: 'e2e-water.png 지우기' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '지우기' }).click()
  await expect(images.getByText('붙인 이미지가 없습니다.')).toBeVisible()
  expect((await page.request.get(src!)).status()).toBe(404)
})
