import { expect, test } from '@playwright/test'
import { E2E_ACCOUNTS } from './e2e-env'

// 임시 비밀번호 → 처음 로그인 때 변경 강제 (docs/decisions/0086)
// 관리자가 사용자를 등록(자동 생성) → 임시 비밀번호 1회 표시 → 그 사용자로 로그인하면 변경 화면으로만
// → 다른 화면 주소로 가도 변경 화면 → 바꾸면 홈 → 새 비밀번호로 다시 로그인
// 만든 사용자는 e2e DB에만 남는다(매번 다른 아이디). 비밀번호는 테스트 안에서 만든 값만 쓴다

test('임시 비밀번호: 등록 → 처음 로그인 때 변경 강제 → 새 비밀번호로 로그인', async ({
  page,
  browser,
}) => {
  const adminPassword = process.env.SEED_SAMPLE_PASSWORD
  if (!adminPassword) throw new Error('SEED_SAMPLE_PASSWORD가 .env에 없습니다.')
  const username = `e2e.pw${Date.now().toString(36)}`
  const newPassword = `New${Date.now().toString(36)}9x`

  // 1) 관리자: 운영사 사용자 등록 (처음 비밀번호 자동 생성이 기본)
  await page.goto('/login')
  await page.locator('#username').fill(E2E_ACCOUNTS.admin)
  await page.locator('#password').fill(adminPassword)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))

  await page.goto('/admin/system/users/new')
  await page.locator('#user-username').fill(username)
  await page.locator('#user-name').fill('비번 확인')
  await page.locator('#user-type').click()
  await page.getByRole('option', { name: '운영사' }).click()
  await expect(page.locator('#user-passwordMode')).toContainText('자동 생성')
  await page.getByRole('button', { name: '저장' }).click()

  // 2) 임시 비밀번호 1회 표시: 확인 체크 전에는 닫을 수 없다
  const dialog = page.getByRole('dialog', { name: '임시 비밀번호' })
  const tempPassword = (await dialog.getByTestId('temp-password').textContent())?.trim() ?? ''
  expect(tempPassword).toMatch(/^[A-Za-z2-9]{12}$/)
  await expect(dialog.getByRole('button', { name: '닫기' })).toBeDisabled()
  await dialog.getByLabel('임시 비밀번호를 전달할 곳에 적어 두었습니다').check()
  await dialog.getByRole('button', { name: '닫기' }).click()
  await expect(dialog).toBeHidden()

  // 3) 새 사용자로 로그인 (다른 브라우저 창) → 변경 화면으로만
  const context = await browser.newContext()
  const user = await context.newPage()
  await user.goto('/login')
  await user.locator('#username').fill(username)
  await user.locator('#password').fill(tempPassword)
  await user.getByRole('button', { name: '로그인' }).click()
  await user.waitForURL('**/account/password')
  await expect(user.getByText('임시 비밀번호로 로그인했습니다')).toBeVisible()
  await user.goto('/admin/master/centers')
  await user.waitForURL('**/account/password')

  // 4) 규칙에 맞지 않으면 칸 오류, 맞으면 바꾸고 홈으로
  await user.locator('#currentPassword').fill(tempPassword)
  await user.locator('#newPassword').fill('abcdefgh')
  await user.locator('#newPasswordConfirm').fill('abcdefgh')
  await user.getByRole('button', { name: '비밀번호 바꾸기' }).click()
  await expect(user.getByText('비밀번호에 숫자를 넣어 주세요.')).toBeVisible()
  await user.locator('#newPassword').fill(newPassword)
  await user.locator('#newPasswordConfirm').fill(newPassword)
  await user.getByRole('button', { name: '비밀번호 바꾸기' }).click()
  await user.waitForURL((url) => url.pathname === '/admin')

  // 5) 로그아웃 후 새 비밀번호로 다시 로그인하면 바로 홈
  await context.clearCookies()
  await user.goto('/login')
  await user.locator('#username').fill(username)
  await user.locator('#password').fill(newPassword)
  await user.getByRole('button', { name: '로그인' }).click()
  await user.waitForURL((url) => url.pathname === '/admin')
  await context.close()
})
