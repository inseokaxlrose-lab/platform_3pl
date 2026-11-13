import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseHelpDocument } from '@/lib/help/parse-help'
import { HelpButton } from './help-button'
import { HelpProvider, type LoadHelp } from './help-context'

let pathname = '/admin/system/users'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

const DOC = parseHelpDocument(
  [
    '---',
    'title: 사용자',
    'summary: 계정을 관리합니다.',
    '---',
    '첫 소개 글',
    '## 화면 구성',
    '| 칸 | 뜻 |',
    '| - | - |',
    '| 상태 | 사용 여부 |',
  ].join('\n'),
)

function renderButton(load: LoadHelp, menuHrefs = ['/admin/system/users']) {
  render(
    <HelpProvider menuHrefs={menuHrefs} load={load}>
      <HelpButton />
    </HelpProvider>,
  )
}

const openHelp = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '도움말' }))
  })
}

beforeEach(() => {
  pathname = '/admin/system/users'
})

describe('HelpButton', () => {
  it('도움말 파일이 없는 화면·보관함 밖에서는 버튼이 없다', () => {
    renderButton(vi.fn(), ['/admin/system/roles'])
    expect(screen.queryByRole('button', { name: '도움말' })).toBeNull()
  })

  it('누르면 그 메뉴의 도움말을 불러와 옆 패널에 보여준다 (표 포함)', async () => {
    const load = vi.fn<LoadHelp>(async () => ({ ok: true, data: DOC }))
    renderButton(load)
    await openHelp()

    expect(load).toHaveBeenCalledWith({ menuHref: '/admin/system/users' })
    expect(screen.getByRole('dialog', { name: '도움말: 사용자' })).toBeTruthy()
    expect(screen.getByText('계정을 관리합니다.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '화면 구성' })).toBeTruthy()
    expect(screen.getByRole('cell', { name: '사용 여부' })).toBeTruthy()
  })

  it('하위 화면(등록·수정)에서는 그 메뉴의 도움말을 연다', async () => {
    pathname = '/admin/system/users/new'
    const load = vi.fn<LoadHelp>(async () => ({ ok: true, data: DOC }))
    renderButton(load)
    await openHelp()
    expect(load).toHaveBeenCalledWith({ menuHref: '/admin/system/users' })
  })

  it('불러오기에 실패하면 이유를 보여준다', async () => {
    renderButton(async () => ({
      ok: false,
      error: { code: 'FORBIDDEN', message: '이 화면을 볼 권한이 없습니다.' },
    }))
    await openHelp()
    expect(screen.getByRole('alert').textContent).toBe('이 화면을 볼 권한이 없습니다.')
  })
})
