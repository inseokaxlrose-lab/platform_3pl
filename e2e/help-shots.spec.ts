import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { darkImageOf } from '../src/lib/help/help-images'
import { E2E_ACCOUNTS } from './e2e-env'
import {
  confirmAsn,
  createPortalAsn,
  inspectAsn,
  newLot,
  previewLabels,
  putawayAsn,
  signIn,
} from './flows'

// 도움말 화면 사진 자동 촬영 (docs/decisions/0077) — npm run e2e:prepare → npm run help:shots
// - e2e 전용 서버·DB로 화면을 열고, 번호 표시(①②③)를 얹어
//   라이트·다크 두 장을 public/help/{메뉴 주소}/{이름}(.dark).png 로 저장한다
// - 입고 화면은 촬영하면서 입고를 한 바퀴 돌린다 (단계마다 그 화면이 채워진 모습으로)
// - 화면이 바뀌면 이 명령만 다시 돌리면 된다. 새 화면은 아래 SHOTS에 한 줄 추가
// - 평소 e2e(npm run e2e)에는 포함되지 않는다 (playwright.config.ts testIgnore)

type Marker = { label: string; target: (page: Page) => Locator }
type Account = 'admin' | 'shipper' | 'platform'
type Shot = {
  // 문서에 쓰는 주소: /help/{메뉴 주소}/{이름}.png
  src: string
  url: string
  account: Account
  // 화면을 원하는 모습으로 만드는 동작 (펼치기·고르기 등)
  prepare?: (page: Page) => Promise<void>
  markers: Marker[]
}

// 자주 쓰는 번호 대상
const searchArea = (page: Page) => page.getByRole('search')
// 표가 옆으로 스크롤되는 경우도 보이는 상자에 맞게: 표를 감싼 스크롤 상자
const firstTable = (page: Page) => page.locator('table').first().locator('xpath=..')
const pageActions = (page: Page) => page.locator('[data-slot="page-actions"]')
const sectionToc = (page: Page) => page.getByRole('navigation', { name: '섹션 목차' })
const firstSection = (page: Page) => page.locator('section[data-section-id]').first()

// 목록 화면: ① 검색 조건 ② 목록 ③ 화면 버튼
const LIST: Marker[] = [
  { label: '1', target: searchArea },
  { label: '2', target: firstTable },
  { label: '3', target: pageActions },
]
// 입력 화면: ① 섹션 목차 ② 첫 섹션 ③ 화면 버튼(저장 등)
const FORM: Marker[] = [
  { label: '1', target: sectionToc },
  { label: '2', target: firstSection },
  { label: '3', target: pageActions },
]

const list = (menu: string, account: Account = 'admin'): Shot => ({
  src: `/help${menu}/list.png`,
  url: menu,
  account,
  markers: LIST,
})

const SHOTS: Shot[] = [
  // ── 기준정보
  {
    src: '/help/admin/master/regions/assign.png',
    url: '/admin/master/regions',
    account: 'admin',
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
    account: 'admin',
    markers: [
      { label: '1', target: sectionToc },
      { label: '2', target: (page) => page.locator('#section-basic') },
      { label: '3', target: (page) => page.getByRole('button', { name: '저장' }) },
    ],
  },
  {
    src: '/help/admin/master/operator/form.png',
    url: '/admin/master/operator',
    account: 'admin',
    markers: FORM,
  },
  list('/admin/master/warehouses'),
  list('/admin/master/locations'),
  list('/admin/master/shippers'),
  list('/admin/master/items'),
  list('/admin/master/customers'),
  list('/admin/master/units'),
  list('/admin/master/external-codes'),
  // ── 입고 (목록·등록. 단계 화면은 아래 입고 흐름에서)
  {
    src: '/help/admin/inbound/asn/new/form.png',
    url: '/admin/inbound/asn/new',
    account: 'admin',
    markers: [
      { label: '1', target: (page) => page.locator('#section-basic') },
      { label: '2', target: (page) => page.locator('#section-lines') },
      { label: '3', target: (page) => page.getByRole('button', { name: '저장' }) },
    ],
  },
  list('/admin/inbound/asn'),
  // ── 재고
  list('/admin/stock'),
  list('/admin/stock/history'),
  list('/admin/stock/adjustments'),
  // ── 시스템
  list('/admin/system/users'),
  list('/admin/system/roles'),
  {
    src: '/help/admin/system/codes/main.png',
    url: '/admin/system/codes',
    account: 'admin',
    // 첫 그룹을 골라 오른쪽에 코드가 보이게
    prepare: async (page) => {
      await page.getByRole('cell', { name: '담당 업무', exact: true }).click()
      await expect(
        page.getByRole('region', { name: '코드', exact: true }).locator('tbody tr').first(),
      ).toBeVisible()
    },
    markers: [
      { label: '1', target: (page) => page.getByRole('region', { name: '코드 그룹' }) },
      { label: '2', target: (page) => page.getByRole('region', { name: '코드', exact: true }) },
      { label: '3', target: pageActions },
    ],
  },
  {
    src: '/help/admin/system/exports/main.png',
    url: '/admin/system/exports',
    account: 'admin',
    markers: [
      { label: '1', target: (page) => page.locator('#report-type') },
      { label: '2', target: (page) => page.locator('#report-period') },
      { label: '3', target: (page) => page.getByRole('button', { name: /엑셀 내려받기/ }) },
    ],
  },
  // ── 포털 (화주사)
  list('/portal/items', 'shipper'),
  list('/portal/asn', 'shipper'),
  list('/portal/stock', 'shipper'),
  // ── 플랫폼
  list('/platform/operators', 'platform'),
]

// 번호 표시: 대상 둘레에 테마 색 테두리 + 왼쪽 위 동그라미 번호
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

// 지금 화면을 라이트·다크 두 장으로 (새로 불러오지 않고 테마만 바꾼다 → 입력·미리보기 상태가 그대로)
async function shoot(page: Page, src: string, markers: Marker[]) {
  // 목록·버튼을 다 불러온 뒤에 (불러오는 중의 회색 상자를 찍지 않게)
  await page.waitForLoadState('networkidle')
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0)
  // 화면이 창보다 넓으면(가로 넘침) 사진이 잘리고 실제 화면도 깨진 것 → 실패로 알린다
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow, `${page.url()} 화면이 창보다 ${overflow}px 넓습니다`).toBeLessThanOrEqual(0)
  // 개발 모드 표시(Next 'N' 버튼)는 사진에서 뺀다
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
  await page.evaluate(() => window.scrollTo(0, 0))
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    const html = expect(page.locator('html'))
    if (scheme === 'dark') await html.toHaveClass(/dark/)
    else await html.not.toHaveClass(/dark/)
    await addMarkers(page, markers)
    const file = join('public', scheme === 'dark' ? darkImageOf(src) : src)
    mkdirSync(dirname(file), { recursive: true })
    // 왼쪽 메뉴를 뺀 본문만, 첫 화면 높이까지 (긴 화면도 위쪽만)
    const box = await page.locator('main').boundingBox()
    if (!box) throw new Error('본문(main)을 찾지 못했습니다.')
    const viewport = page.viewportSize()!
    await page.screenshot({
      path: file,
      animations: 'disabled',
      clip: { x: box.x, y: box.y, width: box.width, height: viewport.height - box.y },
    })
    await page.evaluate(() =>
      document.querySelectorAll('[data-help-marker]').forEach((el) => el.remove()),
    )
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

const ACCOUNTS: Record<Account, () => { username: string; password?: string } | null> = {
  admin: () => ({ username: E2E_ACCOUNTS.admin }),
  shipper: () => ({ username: E2E_ACCOUNTS.shipper }),
  // 플랫폼 관리자: 시드와 같은 .env 값 (비어 있으면 그 사진은 건너뛴다)
  platform: () =>
    process.env.SEED_PLATFORM_PASSWORD
      ? {
          username: (process.env.SEED_PLATFORM_USERNAME ?? 'platform').toLowerCase(),
          password: process.env.SEED_PLATFORM_PASSWORD,
        }
      : null,
}

// 입고 흐름: 단계마다 그 화면을 찍으며 한 바퀴 (뒤의 재고·ASN 목록 사진에도 데이터가 생긴다)
test('도움말 사진: 입고 흐름 (포털 ASN 등록 → 검수 → 라벨 → 확정 → 적치)', async ({ browser }) => {
  const lot = newLot()
  const shipper = await signIn(browser, E2E_ACCOUNTS.shipper)
  const { asnId } = await createPortalAsn(shipper, () =>
    shoot(shipper, '/help/portal/asn/new/form.png', [
      { label: '1', target: (page) => page.locator('#section-basic') },
      { label: '2', target: (page) => page.locator('#section-lines') },
      { label: '3', target: (page) => page.getByRole('button', { name: '저장' }) },
    ]),
  )

  const worker = await signIn(browser, E2E_ACCOUNTS.worker)
  await inspectAsn(worker, asnId, lot)
  await shoot(worker, '/help/admin/inbound/inspection/detail.png', [
    { label: '1', target: (page) => page.locator('#insp-line') },
    { label: '2', target: (page) => page.getByRole('button', { name: '검수 등록' }) },
    { label: '3', target: (page) => page.getByRole('cell', { name: lot }) },
  ])

  await previewLabels(worker, asnId)
  await shoot(worker, '/help/admin/inbound/labels/detail.png', [
    { label: '1', target: (page) => page.getByRole('checkbox', { name: '행 선택' }) },
    { label: '2', target: (page) => page.getByRole('button', { name: /미리보기/ }) },
    { label: '3', target: (page) => page.locator('.label-sheet') },
  ])

  await confirmAsn(worker, asnId, () =>
    shoot(worker, '/help/admin/inbound/confirm/detail.png', [
      { label: '1', target: firstTable },
      { label: '2', target: (page) => page.getByRole('button', { name: /^입고 확정 \(/ }) },
    ]),
  )

  await putawayAsn(worker, asnId, () =>
    shoot(worker, '/help/admin/inbound/putaway/detail.png', [
      { label: '1', target: (page) => page.locator('[id^="putaway-location-"]') },
      { label: '2', target: (page) => page.getByRole('button', { name: /^적치 등록 \(/ }) },
    ]),
  )
})

for (const shot of SHOTS) {
  test(`도움말 사진: ${shot.src}`, async ({ browser }) => {
    const account = ACCOUNTS[shot.account]()
    test.skip(!account, '플랫폼 관리자 비밀번호(SEED_PLATFORM_PASSWORD)가 .env에 없습니다.')
    const page = await signIn(browser, account!.username, account!.password)
    await page.goto(shot.url)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await shot.prepare?.(page)
    await shoot(page, shot.src, shot.markers)
    await page.context().close()
  })
}
