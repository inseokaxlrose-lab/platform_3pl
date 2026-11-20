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
  // 첫 화면 대신 이 요소를 맨 위로 올려 찍는다 (긴 입력 화면의 아래쪽 섹션)
  scrollTo?: (page: Page) => Locator
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
  // ── 시스템 · 휴무관리 (0096): e2e 준비 데이터의 2026년 견본 공휴일·특근·센터 휴무
  {
    src: '/help/admin/system/holidays/list.png',
    url: '/admin/system/holidays?year=2026',
    account: 'admin',
    markers: [
      { label: '1', target: (page) => page.getByText('국가 공휴일', { exact: true }).first() },
      { label: '2', target: (page) => page.getByRole('row', { name: /설 연휴 전 특근/ }) },
      { label: '3', target: (page) => page.getByRole('button', { name: '공휴일 다시 가져오기' }) },
    ],
  },
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
  list('/admin/integration/api-keys'),
  list('/admin/integration/api-logs'),
  {
    // 화주사 등록: ① 섹션 목차 ② 기본 정보 ③ [저장] (0080)
    src: '/help/admin/master/shippers/new.png',
    url: '/admin/master/shippers/new',
    account: 'admin',
    markers: [
      { label: '1', target: sectionToc },
      { label: '2', target: (page) => page.locator('#section-basic') },
      { label: '3', target: (page) => page.getByRole('button', { name: '저장' }) },
    ],
  },
  list('/admin/master/items'),
  {
    // 품목 등록 (0083): BOX 24 + 규격, 팔레트 T11 · 10 × 5단 → PLT 자동 계산이 보이게
    // ① 단위·규격 표 ② 팔레트 적재 요약 ③ [저장]
    src: '/help/admin/master/items/new.png',
    url: '/admin/master/items/new',
    account: 'admin',
    prepare: async (page) => {
      await page.locator('#item-shipperId').click()
      await page.getByRole('option', { name: /GANA/ }).click()
      await page.locator('#item-baseUnitId').click()
      await page.getByRole('option', { name: /^EA/ }).click()
      await page.getByRole('button', { name: 'BOX 추가' }).click()
      const box = {
        convQty: '24',
        widthCm: '30',
        depthCm: '20',
        heightCm: '25',
        grossWeightKg: '12',
      }
      for (const [key, value] of Object.entries(box)) {
        await page.locator(`#units-BOX-${key}`).fill(value)
      }
      await page.locator('#item-palletTi').fill('10')
      await page.locator('#item-palletHi').fill('5')
      await expect(page.getByText('1 PLT = 50 BOX', { exact: false })).toBeVisible()
    },
    scrollTo: (page) => page.locator('#section-units'),
    markers: [
      { label: '1', target: (page) => page.getByRole('table', { name: '단위·규격' }) },
      { label: '2', target: (page) => page.locator('#section-pallet') },
      { label: '3', target: (page) => page.getByRole('button', { name: '저장' }) },
    ],
  },
  list('/admin/master/customers'),
  {
    // 거래처 등록: 화주사를 고르면 [납품처 추가]가 열린다 — ① 주소 ② 납품처 ③ 저장 (0082)
    src: '/help/admin/master/customers/new.png',
    url: '/admin/master/customers/new',
    account: 'admin',
    prepare: async (page) => {
      await page.locator('#customer-shipperId').click()
      await page.getByRole('option', { name: /GANA/ }).click()
      await expect(page.getByRole('button', { name: '납품처 추가' })).toBeEnabled()
    },
    // 주소·납품처 섹션이 한 화면에 들어오게
    scrollTo: (page) => page.locator('#section-address'),
    markers: [
      { label: '1', target: (page) => page.locator('#section-address') },
      { label: '2', target: (page) => page.locator('#section-ship-to') },
      { label: '3', target: (page) => page.getByRole('button', { name: '저장' }) },
    ],
  },
  {
    // 납품처 (0082 ②): ③은 일괄 처리 버튼
    ...list('/admin/master/ship-tos'),
    markers: [
      { label: '1', target: searchArea },
      { label: '2', target: firstTable },
      { label: '3', target: (page) => page.getByRole('button', { name: /배송센터 일괄 지정/ }) },
    ],
  },
  list('/admin/master/units'),
  // 팔레트 종류 (0083): 시스템 기본 T11·T12와 운영사 기본 표시
  list('/admin/master/pallet-types'),
  // 운송사·운송 계약 (0094): 계약은 등록 화면 — 센터·운송사를 골라 송장 대역 안내가 보이게
  list('/admin/master/carriers'),
  // 배송 코스 (0095): 화면으로 코스를 등록하고 우편번호 3개를 배정한 뒤 수정 화면을 찍는다
  {
    src: '/help/admin/master/routes/zips.png',
    url: '/admin/master/routes/new',
    account: 'admin',
    prepare: async (page) => {
      await page.locator('#route-centerId').click()
      await page.getByRole('option').first().click()
      // 다시 찍어도 겹치지 않는 코드
      await page.locator('#route-code').fill(`R${Date.now().toString().slice(-6)}`)
      await page.locator('#route-name').fill('권선 1코스')
      await page.locator('#route-cutoffTime').fill('1400')
      await page.locator('#route-destHub').fill('수원 허브')
      await page.getByRole('button', { name: '저장' }).click()
      await page.getByRole('link', { name: '등록한 항목 보기' }).click()
      await page.getByRole('button', { name: '우편번호 추가' }).click()
      await page.locator('#route-zip-text').fill('16613 16620 16625')
      // e2e 권역설정은 비어 있으므로 "이 센터만"을 끈다
      await page.getByRole('dialog').getByRole('checkbox').click()
      await page.getByRole('button', { name: '미리보기' }).click()
      await expect(page.getByTestId('route-zip-plan')).toBeVisible()
      await page.getByRole('button', { name: '배정', exact: true }).click()
      await expect(page.getByText('3개 우편번호')).toBeVisible()
    },
    scrollTo: (page) => page.locator('#section-operation'),
    markers: [
      { label: '1', target: (page) => page.locator('#section-operation') },
      { label: '2', target: (page) => page.locator('#section-zips table').first() },
      { label: '3', target: (page) => page.getByRole('button', { name: '우편번호 추가' }) },
    ],
  },
  {
    src: '/help/admin/master/carrier-contracts/new.png',
    url: '/admin/master/carrier-contracts/new',
    account: 'admin',
    prepare: async (page) => {
      await page.locator('#contract-carrierId').click()
      await page.getByRole('option', { name: /CJ대한통운/ }).click()
      await page.locator('#contract-custNo').fill('30012345')
      await page.locator('#contract-pickupBranch').fill('인천 집하점')
      await page.locator('#contract-invoiceStart').fill('60000000000')
      await page.locator('#contract-invoiceEnd').fill('60000009999')
      await expect(page.getByTestId('invoice-hint')).toBeVisible()
    },
    markers: [
      { label: '1', target: (page) => page.locator('#section-basic') },
      { label: '2', target: (page) => page.locator('#section-invoice') },
      { label: '3', target: pageActions },
    ],
  },
  {
    // 운영사 추가 단위 '근' (중량): 환산 섹션과 "1 근 = 0.6 KG" 미리보기가 보이게
    src: '/help/admin/master/units/new.png',
    url: '/admin/master/units/new',
    account: 'admin',
    prepare: async (page) => {
      await page.locator('#unit-code').fill('GN')
      await page.locator('#unit-name').fill('근')
      await page.locator('#unit-type').click()
      await page.getByRole('option', { name: '중량' }).click()
      await page.locator('#unit-baseFactor').fill('0.6')
      await expect(page.getByText('1 근 = 0.6 KG')).toBeVisible()
    },
    markers: [
      { label: '1', target: (page) => page.locator('#unit-type') },
      { label: '2', target: (page) => page.locator('#section-conversion') },
      { label: '3', target: (page) => page.getByRole('button', { name: '저장' }) },
    ],
  },
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
  // 사용자 수정의 계정 관리·로그인 이력 (0093): ① 상태·마지막 로그인 ② 비밀번호 초기화 ③ 로그인 이력
  {
    src: '/help/admin/system/users/account.png',
    url: '/admin/system/users',
    account: 'admin',
    prepare: async (page) => {
      await page.getByRole('link', { name: E2E_ACCOUNTS.admin, exact: true }).click()
      await expect(page.locator('#section-login-history')).toBeVisible()
    },
    scrollTo: (page) => page.locator('#section-account'),
    markers: [
      { label: '1', target: (page) => page.getByText(/^마지막 로그인/) },
      { label: '2', target: (page) => page.getByRole('button', { name: '비밀번호 초기화' }) },
      { label: '3', target: (page) => page.locator('#section-login-history') },
    ],
  },
  list('/admin/system/roles'),
  // 운영 설정 (0092): ① 재고 ② API 연동 ③ 화면 버튼
  {
    src: '/help/admin/system/settings/main.png',
    url: '/admin/system/settings',
    account: 'admin',
    markers: [
      { label: '1', target: (page) => page.locator('section[data-section-id="stock"]') },
      { label: '2', target: (page) => page.locator('section[data-section-id="api"]') },
      { label: '3', target: pageActions },
    ],
  },
  // 체번 규칙: 목록(검색 조건 없음) + 입고예정 번호 수정 화면(미리보기)
  {
    src: '/help/admin/system/numbering/list.png',
    url: '/admin/system/numbering',
    account: 'admin',
    markers: [
      { label: '1', target: firstTable },
      {
        label: '2',
        target: (page) => page.getByRole('link', { name: '입고예정(ASN)', exact: true }),
      },
    ],
  },
  {
    src: '/help/admin/system/numbering/edit.png',
    url: '/admin/system/numbering/ASN',
    account: 'admin',
    markers: [
      { label: '1', target: firstSection },
      { label: '2', target: (page) => page.locator('section[data-section-id="preview"]') },
      { label: '3', target: pageActions },
    ],
  },
  {
    src: '/help/admin/system/codes/main.png',
    url: '/admin/system/codes',
    account: 'admin',
    // 사유 코드 그룹을 골라 오른쪽에 코드·귀책이 보이게 (0087)
    prepare: async (page) => {
      await page.getByRole('cell', { name: '검수 불량 사유', exact: true }).click()
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
async function shoot(
  page: Page,
  src: string,
  markers: Marker[],
  scrollTo?: (page: Page) => Locator,
) {
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
  if (scrollTo) await scrollTo(page).evaluate((el) => el.scrollIntoView({ block: 'start' }))
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
    await shoot(page, shot.src, shot.markers, shot.scrollTo)
    await page.context().close()
  })
}
