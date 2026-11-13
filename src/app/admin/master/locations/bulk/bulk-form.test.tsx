import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bulkCreateLocationsAction, previewBulkLocationsAction } from '../actions'
import type { WarehouseOption } from '../queries'
import { BulkLocationForm } from './bulk-form'

vi.mock('../actions', () => ({
  previewBulkLocationsAction: vi.fn(),
  bulkCreateLocationsAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const WAREHOUSES: WarehouseOption[] = [
  {
    id: 'w1',
    label: '상온 1창고 (A)',
    centerId: 'c1',
    centerLabel: '이천센터 (ICN)',
    addable: true,
  },
  {
    id: 'w2',
    label: '입고대기 (INBOUND)',
    centerId: 'c1',
    centerLabel: '이천센터 (ICN)',
    addable: false,
  },
]

const createButton = () => screen.getByRole('button', { name: '생성' })

beforeEach(() => {
  vi.mocked(previewBulkLocationsAction).mockReset()
  vi.mocked(bulkCreateLocationsAction).mockReset()
  vi.mocked(previewBulkLocationsAction).mockResolvedValue({
    ok: true,
    data: { total: 50, skipped: 2, toCreate: 48, first: ['A-01-01'], last: [] },
  })
  vi.mocked(bulkCreateLocationsAction).mockResolvedValue({
    ok: true,
    data: { created: 48, skipped: 2 },
  })
})

describe('로케이션 일괄 생성 화면', () => {
  it('입력 중에도 예시 코드와 대략의 개수를 보여준다 (기본: A, 1~10열, 1~5단)', () => {
    render(<BulkLocationForm warehouses={WAREHOUSES} initialWarehouseId="w1" />)
    expect(screen.getByText('예: A-01-01 · 최대 50개')).toBeTruthy()
  })

  it('미리보기를 한 뒤에만 [생성]이 켜지고, 범위를 바꾸면 다시 꺼진다', async () => {
    render(<BulkLocationForm warehouses={WAREHOUSES} initialWarehouseId="w1" />)
    expect(createButton()).toHaveProperty('disabled', true)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: '미리보기' })))
    expect(previewBulkLocationsAction).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: 'w1',
        range: expect.objectContaining({ zoneFrom: 'A', aisleTo: 10 }),
      }),
    )
    expect(screen.getByRole('status', { name: '미리보기 결과' }).textContent).toContain('48개')
    expect(createButton()).toHaveProperty('disabled', false)

    fireEvent.change(screen.getByLabelText('단 끝'), { target: { value: '6' } })
    expect(createButton()).toHaveProperty('disabled', true)
  })

  it('범위가 잘못되면 서버에 묻지 않고 칸별로 알려준다, 입고대기 창고는 고를 수 없다', async () => {
    render(<BulkLocationForm warehouses={WAREHOUSES} initialWarehouseId="w2" />)
    fireEvent.change(screen.getByLabelText('열 끝'), { target: { value: '100' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '미리보기' })))

    expect(screen.getByText('창고를 골라 주세요.')).toBeTruthy()
    expect(screen.getByText('끝 열이 자릿수보다 깁니다.')).toBeTruthy()
    expect(previewBulkLocationsAction).not.toHaveBeenCalled()
  })

  it('생성하면 결과를 알려준다', async () => {
    render(<BulkLocationForm warehouses={WAREHOUSES} initialWarehouseId="w1" />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '미리보기' })))
    await act(async () => fireEvent.click(createButton()))

    expect(bulkCreateLocationsAction).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/48개를 만들었습니다/)).toBeTruthy()
  })
})
