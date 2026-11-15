import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCenterAction, updateCenterAction } from './actions'
import { CenterForm } from './center-form'
import type { CenterForEdit } from './queries'

vi.mock('./actions', () => ({
  createCenterAction: vi.fn(),
  updateCenterAction: vi.fn(),
  setCenterActiveAction: vi.fn(),
}))
const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

beforeAll(() => {
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  push.mockClear()
  refresh.mockClear()
})

const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`))
const save = () => act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))

const CENTER: CenterForEdit = {
  id: 'c1',
  systemCode: 'CT000001',
  isActive: true,
  input: {
    code: 'ICN',
    name: '인천센터',
    phone: '0311234567',
    fax: '',
    managerName: '',
    managerPhone: '',
    zipCode: '',
    address: '',
    addressDetail: '',
    externalCodes: { SAP: '', ERP: '' },
  },
  warehouses: [],
} as unknown as CenterForEdit

describe('CenterForm', () => {
  it('등록: 저장하면 만든 센터의 수정 화면으로 이동, 전화는 숫자만 보낸다', async () => {
    vi.mocked(createCenterAction).mockResolvedValue({
      ok: true,
      data: { id: 'new-id', systemCode: 'CT000009', code: 'CT000009' },
    } as never)
    render(<CenterForm readOnly={false} />)
    fireEvent.change(field('센터명'), { target: { value: '김해센터' } })
    fireEvent.change(field('대표 전화'), { target: { value: '0551234567' } })
    expect(field('대표 전화')).toHaveProperty('value', '055-123-4567')
    await save()

    expect(createCenterAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: '김해센터', phone: '0551234567' }),
    )
    expect(push).toHaveBeenCalledWith('/admin/master/centers/new-id')
    // 상태·창고 섹션은 수정 화면에서만
    expect(screen.queryByRole('heading', { name: '상태' })).toBeNull()
  })

  it('수정: 그 자리에서 저장하고, 상태·창고는 폼 밖의 따로 처리하는 섹션', async () => {
    vi.mocked(updateCenterAction).mockResolvedValue({ ok: true, data: { id: 'c1' } } as never)
    render(<CenterForm center={CENTER} readOnly={false} canToggleActive />)
    expect(field('대표 전화')).toHaveProperty('value', '031-123-4567')
    const status = screen.getByRole('region', { name: '상태' })
    expect(status.closest('form')).toBeNull()
    expect(within(status).getByRole('button', { name: '사용 중지' })).toBeTruthy()

    fireEvent.change(field('센터명'), { target: { value: '인천 제1센터' } })
    await save()
    expect(updateCenterAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: '인천 제1센터' }),
    )
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('저장했습니다.')
  })
})
