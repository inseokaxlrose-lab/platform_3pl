import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PermissionCode } from '@/config/permissions'

// 메뉴 탭 + 작성 중 내용 보관 (docs/decisions/0069, 0097)

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  // 지금 보는 화면: 거래처 목록 (품목 탭은 뒤에 있음)
  usePathname: () => '/admin/master/customers',
  useSearchParams: () => new URLSearchParams(),
}))

const CODES: PermissionCode[] = ['master.items.read', 'master.customers.read']
const ITEM_EDIT = '/admin/master/items/7/edit'

function seedTabs() {
  sessionStorage.setItem(
    'menu-tabs:admin',
    JSON.stringify([
      { href: '/admin/master/items', url: ITEM_EDIT, usedAt: 1 },
      { href: '/admin/master/customers', url: '/admin/master/customers', usedAt: 2 },
    ]),
  )
}

// 탭 목록·보관 목록은 모듈 안에 기억해 두므로 시험마다 모듈을 새로 불러온다
let modules: Awaited<ReturnType<typeof load>>
async function load() {
  vi.resetModules()
  const [{ PermissionProvider }, { MenuTabs }, drafts, dirty] = await Promise.all([
    import('@/components/permission'),
    import('./menu-tabs'),
    import('@/lib/navigation/form-drafts'),
    import('@/lib/navigation/page-dirty'),
  ])
  return { PermissionProvider, MenuTabs, ...drafts, ...dirty }
}

function renderTabs() {
  const { PermissionProvider, MenuTabs } = modules
  render(
    <PermissionProvider codes={CODES}>
      <MenuTabs area="admin" />
    </PermissionProvider>,
  )
}
const readDraft = (path: string) => modules.readDraft(path)
const writeDraft = (...args: Parameters<typeof modules.writeDraft>) => modules.writeDraft(...args)
const isOtherMenu = (from: string, to: string) => modules.isOtherMenu(from, to)

const itemTabClose = () => screen.getByRole('button', { name: '품목 탭 닫기' })

beforeEach(async () => {
  sessionStorage.clear()
  push.mockClear()
  seedTabs()
  modules = await load()
})

describe('MenuTabs 작성 중 내용 (0097)', () => {
  it('뒤에 있는 탭에 보관한 작성 내용이 있으면 ●, [×]는 "버리고 닫기"를 물은 뒤 보관도 지운다', () => {
    writeDraft(ITEM_EDIT, { value: { name: '작성 중' }, version: 1 })
    renderTabs()
    expect(screen.getByText('(저장하지 않은 변경 있음)', { exact: false })).toBeTruthy()

    fireEvent.click(itemTabClose())
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '닫지 않기' }))
    expect(screen.getByRole('button', { name: '품목 탭 닫기' })).toBeTruthy()
    expect(readDraft(ITEM_EDIT)).not.toBeNull()

    fireEvent.click(itemTabClose())
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '버리고 닫기' }),
    )
    expect(screen.queryByRole('button', { name: '품목 탭 닫기' })).toBeNull()
    expect(readDraft(ITEM_EDIT)).toBeNull()
  })

  it('보관한 내용이 없는 뒤 탭은 묻지 않고 닫는다', () => {
    renderTabs()
    expect(screen.queryByText('(저장하지 않은 변경 있음)', { exact: false })).toBeNull()
    fireEvent.click(itemTabClose())
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.queryByRole('button', { name: '품목 탭 닫기' })).toBeNull()
  })

  it('[전체 닫기]: 보관한 탭이 있으면 개수를 알려 주고 묻는다', () => {
    writeDraft(ITEM_EDIT, { value: { name: '작성 중' }, version: 1 })
    renderTabs()
    fireEvent.click(screen.getByRole('button', { name: /전체 닫기/ }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('이 탭을 닫으면')
    fireEvent.click(within(dialog).getByRole('button', { name: '버리고 닫기' }))
    expect(readDraft(ITEM_EDIT)).toBeNull()
    expect(push).toHaveBeenCalledWith('/admin')
  })

  it('주소가 어느 메뉴인지 알려 준다: 품목 수정 → 거래처는 다른 메뉴, 품목 목록은 같은 메뉴', () => {
    renderTabs()
    expect(isOtherMenu(ITEM_EDIT, '/admin/master/customers')).toBe(true)
    expect(isOtherMenu(ITEM_EDIT, '/admin/master/items')).toBe(false)
    // 메뉴가 아닌 화면(비밀번호 변경 등)에서는 지금처럼 묻는다
    expect(isOtherMenu('/account/password', '/admin/master/items')).toBe(false)
  })
})
