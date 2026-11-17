import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { darkImageOf } from '../src/lib/help/help-images'
import { E2E_ACCOUNTS } from './e2e-env'

// 도움말 화면 사진 자동 촬영 (docs/decisions/0077) — npm run help:shots
// - e2e 전용 서버·DB(npm run e2e:prepare 데이터)로 화면을 열고, 번호 표시(①②③)를 얹어
//   라이트·다크 두 장을 public/help/{메뉴 주소}/{이름}(.dark).png 로 저장한다
// - 화면이 바뀌면 이 명령만 다시 돌리면 된다. 새 사진은 아래 SHOTS에 한 줄 추가
// - 평소 e2e(npm run e2e)에는 포함되지 않는다 (playwright.config.ts testIgnore)

type Marker = { label: string; target: (page: Page) => Locator }
type Shot = {
  // 문서에 쓰는 주소: /help/{메뉴 주소}/{이름}.png
  src: string
  url: string
  // 화면을 원하는 모습으로 만드는 동작 (펼치기·고르기 등)
  prepare?: (page: Page) => Promise<void>
  markers: Marker[]
}

const SHOTS: Shot[] = [
  {
    src: '/help/admin/master/regions/assign.png',
    url: '/admin/master/regions',
    prepare: async (page) => {
      await page.getByRole('button', { name: '경기도 펼치기' }).click()
      await page.getByRole('button', { name: '수원시 권선구 펼치기' }).click()
      await page.getByRole('button', { name: /^호매실동/ }).click()
      await expect(page.getByRole('heading', { name: '호매실동', level: 2 })).toBeVisible()
      await expect(page.getByRole('cell', { name: '16625' })).toBeVisible()
    },
    markers: [
      { label: '1', target: (page) => page.getByRole('list', { name: '지역 트리' }) },
      { label: '2', target: (page) => page.getByRole('combobox', { name: '지역 전체 센터' }) },
      { label: '3', target: (page) => page.getByRole('cell', { name: '16625' }) },
    ],
  },
  {
    src: '/help/admin/master/centers/new.png',
    url: '/admin/master/centers/new',
    markers: [
      { label: '1', target: (page) => page.getByRole('navigation', { name: '섹션 목차' }) },
      { label: '2', target: (page) => page.locator('#section-basic') },
      { label: '3', target: (page) => page.getByRole('button', { name: '저장' }) },
    ],
  },
  {
    src: '/help/admin/inbound/asn/new.png',
    url: '/admin/inbound/asn/new',
    markers: [
      { label: '1', target: (page) => page.locator('#section-basic') },
      { label: '2', target: (page) => page.locator('#section-lines') },
      { label: '3', target: (page) => page.getByRole('button', { name: '저장' }) },
    ],
  },
]

// 번호 표시: 대상 둘레에 테마 색 테두리 + 왼쪽 위 동그라미 번호 (찍은 뒤 지운다)
async function addMarkers(page: Page, markers: Marker[]) {
  for (const marker of markers) {
    await marker
      .target(page)
      .first()
      .evaluate((el, label) => {
        const rect = el.getBoundingClientRect()
        const box = document.createElement('div')
        box.dataset.helpMarker = ''
        Object.assign(box.style, {
          position: 'absolute',
          left: `${rect.left + window.scrollX - 3}px`,
          top: `${rect.top + window.scrollY - 3}px`,
          width: `${rect.width + 6}px`,
          height: `${rect.height + 6}px`,
          border: '2px solid var(--primary)',
          borderRadius: '6px',
          pointerEvents: 'none',
          zIndex: '9999',
        })
        const badge = document.createElement('span')
        badge.textContent = label
        Object.assign(badge.style, {
          position: 'absolute',
          left: '-11px',
          top: '-11px',
          width: '22px',
          height: '22px',
          borderRadius: '9999px',
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          font: '600 12px/22px system-ui, sans-serif',
          textAlign: 'center',
          boxShadow: '0 0 0 2px var(--background)',
        })
        box.append(badge)
        document.body.append(box)
      }, marker.label)
  }
}

test.use({ viewport: { width: 1440, height: 900 } })

test.beforeEach(async ({ page }) => {
  const password = process.env.SEED_SAMPLE_PASSWORD
  if (!password) throw new Error('SEED_SAMPLE_PASSWORD가 .env에 없습니다.')
  await page.goto('/login')
  await page.locator('#username').fill(E2E_ACCOUNTS.admin)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
})

for (const shot of SHOTS) {
  test(`도움말 사진: ${shot.src}`, async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(shot.url)
      // 개발 모드 표시(Next 'N' 버튼)는 사진에서 뺀다
      await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await shot.prepare?.(page)
      await addMarkers(page, shot.markers)
      const file = join('public', scheme === 'dark' ? darkImageOf(shot.src) : shot.src)
      mkdirSync(dirname(file), { recursive: true })
      // 왼쪽 메뉴를 뺀 본문만, 첫 화면 높이까지 (긴 입력 화면도 위쪽만)
      const box = await page.locator('main').boundingBox()
      if (!box) throw new Error('본문(main)을 찾지 못했습니다.')
      const viewport = page.viewportSize()!
      await page.screenshot({
        path: file,
        animations: 'disabled',
        clip: { x: box.x, y: box.y, width: box.width, height: viewport.height - box.y },
      })
    }
  })
}
