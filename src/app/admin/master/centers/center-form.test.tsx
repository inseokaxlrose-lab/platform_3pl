import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { withoutCode } from '@/lib/centers/center-schema'
import { centerTestInput } from '@/test/center-input'
import { createCenterAction, updateCenterAction } from './actions'
import { CenterForm } from './center-form'
import type { CenterForEdit } from './queries'

vi.mock('./actions', () => ({
  createCenterAction: vi.fn(),
  updateCenterAction: vi.fn(),
}))
const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/admin/test',
}))

beforeAll(() => {
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver
  // 체크박스·스위치(Radix)가 크기를 잴 때 쓴다
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  push.mockClear()
  refresh.mockClear()
  vi.mocked(createCenterAction).mockReset()
  vi.mocked(updateCenterAction).mockReset()
})

const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`))
const save = () => act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))

// 수정 화면에 넘기는 센터 (조회 함수가 주는 모양)
const EDIT_INPUT = withoutCode(
  centerTestInput({
    name: '인천센터',
    phone: '0311234567',
    defaultInboundLocId: '1',
  }),
)
const CENTER = {
  id: 'c1',
  code: 'ICN',
  systemCode: 'CT000001',
  rowVersion: 3,
  status: 'ACTIVE',
  statusReason: null,
  closedOn: null,
  updatedAt: new Date('2026-11-16T00:00:00Z'),
  updatedBy: 'boss',
  input: EDIT_INPUT,
  operator: { shipCutoffTime: '17:00' },
  locationOptions: [{ value: '1', label: 'DEFAULT', description: '입고대기 · 입고대기' }],
  warehouses: [],
  deliveryZones: [],
} as unknown as CenterForEdit

describe('CenterForm', () => {
  it('등록: 코드·이름·주소를 넣고 저장하면 만든 센터의 수정 화면으로, 전화는 숫자만 보낸다', async () => {
    vi.mocked(createCenterAction).mockResolvedValue({
      ok: true,
      data: { id: 'new-id', rowVersion: 2 },
    } as never)
    render(
      <CenterForm
        header={{ title: '센터 등록' }}
        operator={{ shipCutoffTime: '17:00' }}
        readOnly={false}
      />,
    )
    // 주소가 비면 화면에서 먼저 막는다
    fireEvent.change(field('센터코드'), { target: { value: 'gmh' } })
    fireEvent.change(field('센터명'), { target: { value: '김해센터' } })
    await save()
    expect(createCenterAction).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: '우편번호' }), {
      target: { value: '50800' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: '주소' }), {
      target: { value: '경남 김해시 물류로 1' },
    })
    fireEvent.change(field('대표 전화'), { target: { value: '0551234567' } })
    expect(field('대표 전화')).toHaveProperty('value', '055-123-4567')
    // 출고 마감은 운영사 값을 따르는 것이 기본
    expect(screen.getByText('운영사 값: 17:00')).toBeTruthy()
    await save()

    expect(createCenterAction).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'gmh', name: '김해센터', phone: '0551234567' }),
    )
    expect(push).toHaveBeenCalledWith('/admin/master/centers/new-id')
    // 기본 로케이션 고르기는 수정 화면에서만
    expect(screen.queryByText('기본 입고 로케이션')).toBeNull()
  })

  it('수정: 코드는 잠기고 보내지 않으며, 그 자리에서 저장', async () => {
    vi.mocked(updateCenterAction).mockResolvedValue({
      ok: true,
      data: { id: 'c1', rowVersion: 4, contactIds: [] },
    } as never)
    render(<CenterForm header={{ title: '센터' }} center={CENTER} readOnly={false} />)
    expect(field('센터코드')).toHaveProperty('disabled', true)
    expect(field('대표 전화')).toHaveProperty('value', '031-123-4567')

    fireEvent.change(field('센터명'), { target: { value: '인천 제1센터' } })
    await save()
    expect(updateCenterAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', rowVersion: 3, name: '인천 제1센터' }),
    )
    expect(vi.mocked(updateCenterAction).mock.calls[0][0]).not.toHaveProperty('code')
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('저장했습니다.')
  })

  it('출고 마감: 운영사 값 사용을 풀면 운영사 값으로 시작해 따로 정한다', async () => {
    render(<CenterForm header={{ title: '센터' }} center={CENTER} readOnly={false} />)
    fireEvent.click(screen.getByLabelText('운영사 값 사용'))
    expect(field('출고 마감')).toHaveProperty('value', '17:00')
  })
})
