import { expect, test } from '@playwright/test'
import { E2E_ACCOUNTS } from './e2e-env'

// 권역설정 화면 (docs/decisions/0076) — 샘플 지역 마스터(e2e/setup-regions.ts)로
// 지역 트리 → 읍면동 전체 지정(경계 우편번호 포함) → 미리보기 → 저장 → 이력 → 시뮬레이터 → 해제(처음 상태로)
//   호매실동: 16620(호매실동만) · 16625(금곡동·호매실동 경계)

test('권역설정: 지역 지정 → 이력 → 시뮬레이터 → 해제', async ({ page }) => {
  const password = process.env.SEED_SAMPLE_PASSWORD
  if (!password) throw new Error('SEED_SAMPLE_PASSWORD가 .env에 없습니다.')
  await page.goto('/login')
  await page.locator('#username').fill(E2E_ACCOUNTS.admin)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))

  await page.goto('/admin/master/regions')
  await expect(page.getByRole('heading', { name: '권역설정', level: 1 })).toBeVisible()
  await expect(page.getByText('미배정', { exact: true }).first()).toBeVisible()

  // 트리: 경기도 → 수원시 권선구 → 호매실동
  await page.getByRole('button', { name: '경기도 펼치기' }).click()
  await page.getByRole('button', { name: '수원시 권선구 펼치기' }).click()
  await page.getByRole('button', { name: /^호매실동/ }).click()
  await expect(page.getByRole('heading', { name: '호매실동', level: 2 })).toBeVisible()
  await expect(page.getByRole('cell', { name: '16625' })).toBeVisible()

  // 지역 전체 지정 → 미리보기: 경계 1건 기본 제외 → 포함으로 바꾸면 2건
  await page.getByRole('combobox', { name: '지역 전체 센터' }).click()
  await page.getByRole('option', { name: /이천센터/ }).click()
  await page.getByRole('button', { name: '이 지역 전체 지정' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('경계 우편번호 1건')).toBeVisible()
  await expect(dialog.getByRole('button', { name: '저장 (1건)' })).toBeVisible()
  await dialog.getByLabel('포함').check()
  await dialog.getByLabel('변경 사유 (선택)').fill('e2e 확인')
  await dialog.getByRole('button', { name: '저장 (2건)' }).click()
  await expect(page.getByText('2건을 반영했습니다.')).toBeVisible()
  await expect(page.getByRole('cell', { name: '이천센터' }).first()).toBeVisible()

  // 변경 이력 (가장 최근 작업 — 같은 e2e DB에서 여러 번 실행해도)
  await page.getByRole('tab', { name: '변경 이력' }).click()
  await page
    .getByRole('button', { name: /호매실동 \(경계 1건 포함\) → 이천센터/ })
    .first()
    .click()
  await expect(page.getByText('우편번호별 변경 내역')).toBeVisible()

  // 시뮬레이터 (API 키 없이 글자 해석 → 법정동 C 등급 → 이천센터)
  await page.getByRole('tab', { name: '시뮬레이터' }).click()
  await page.getByLabel('주소').fill('경기도 수원시 권선구 호매실동 999')
  await page.getByRole('button', { name: '결정해 보기' }).click()
  await expect(page.getByText('C 법정동 추정')).toBeVisible()
  await expect(page.getByText('이천센터').last()).toBeVisible()

  // 처음 상태로: 전체 해제(경계 포함)
  await page.getByRole('tab', { name: '배정' }).click()
  await page.getByRole('button', { name: '전체 해제' }).click()
  await page.getByRole('dialog').getByLabel('포함').check()
  await page.getByRole('dialog').getByRole('button', { name: '저장 (2건)' }).click()
  await expect(page.getByText('2건을 반영했습니다.')).toBeVisible()
})
