import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { bulkCreateLocationsAction, previewBulkLocationsAction } from '../actions'
import type { LocationOptions } from '../queries'
import { BulkLocationForm } from './bulk-form'

// 로케이션 일괄 생성 화면 (docs/decisions/0075)

vi.mock('../actions', () => ({
  previewBulkLocationsAction: vi.fn(),
  bulkCreateLocationsAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const warehouse = {
  code: 'A',
  name: '상온 1창고',
  label: '상온 1창고 (A)',
  centerId: '1',
  centerCode: 'ICN',
  centerName: '이천센터',
  centerLabel: '이천센터 (ICN)',
  tempZone: 'AMBIENT',
  bonded: false,
  hazmat: false,
  ops: { inbound: true, outbound: true, allocatable: true },
  separator: '-',
}
const OPTIONS: LocationOptions = {
  warehouses: [
    { ...warehouse, id: '11', addable: true },
    { ...warehouse, id: '12', code: 'INBOUND', name: '입고대기', addable: false },
  ],
  zones: [{ id: '21', warehouseId: '11', code: 'B', name: 'B구역' }],
  units: { length: 'CM', weight: 'KG' },
}

const createButton = () => screen.getByRole('button', { name: '생성' })
const preview = () =>
  act(async () => fireEvent.click(screen.getByRole('button', { name: '미리보기' })))

beforeAll(() => {
  // 체크박스(Radix)가 크기를 잴 때 쓴다
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

beforeEach(() => {
  vi.mocked(previewBulkLocationsAction).mockReset()
  vi.mocked(bulkCreateLocationsAction).mockReset()
  vi.mocked(previewBulkLocationsAction).mockResolvedValue({
    ok: true,
    data: { total: 50, skipped: 2, toCreate: 48, first: ['B-01-01'], last: [] },
  })
  vi.mocked(bulkCreateLocationsAction).mockResolvedValue({
    ok: true,
    data: { created: 48, skipped: 2, zoneId: '21' },
  })
})

describe('로케이션 일괄 생성 화면', () => {
  it('구역 코드로 예시 코드와 대략의 개수를 보여준다 (기본 패턴, 1~10열, 1~5단)', () => {
    render(<BulkLocationForm options={OPTIONS} initialWarehouseId="11" initialZoneId="21" />)
    expect(screen.getByText('예: B-01-01 · 최대 50개')).toBeTruthy()
  })

  it('미리보기를 한 뒤에만 [생성]이 켜지고, 범위를 바꾸면 다시 꺼진다', async () => {
    render(<BulkLocationForm options={OPTIONS} initialWarehouseId="11" initialZoneId="21" />)
    expect(createButton()).toHaveProperty('disabled', true)

    await preview()
    expect(previewBulkLocationsAction).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: '11',
        zoneId: '21',
        pattern: expect.objectContaining({
          pattern: '{ZONE}-{ROW}-{LEVEL}',
          row: { from: 1, to: 10, digits: 2 },
        }),
        attributes: expect.objectContaining({ locType: 'RACK', inbound: null }),
      }),
    )
    expect(screen.getByRole('status', { name: '미리보기 결과' }).textContent).toContain('48개')
    expect(createButton()).toHaveProperty('disabled', false)

    fireEvent.change(screen.getByLabelText('단 끝'), { target: { value: '6' } })
    expect(createButton()).toHaveProperty('disabled', true)
  })

  it('범위·구역이 잘못되면 서버에 묻지 않고 칸별로 알려준다, 시스템 기본 창고는 고를 수 없다', async () => {
    render(<BulkLocationForm options={OPTIONS} initialWarehouseId="12" />)
    fireEvent.change(screen.getByLabelText('열 끝'), { target: { value: '100' } })
    await preview()

    // 시스템 기본 창고는 선택지에 없고, 고를 수 있는 창고가 하나뿐이라 그 창고가 저절로 골라진다
    expect(screen.queryByText('입고대기 (INBOUND)')).toBeNull()
    expect(screen.getByText('구역을 골라 주세요.')).toBeTruthy()
    expect(screen.getByText('끝 열이 자릿수보다 깁니다.')).toBeTruthy()
    expect(previewBulkLocationsAction).not.toHaveBeenCalled()
  })

  it('생성하면 결과 요약과 [생성된 로케이션 보기]를 보여준다', async () => {
    render(<BulkLocationForm options={OPTIONS} initialWarehouseId="11" initialZoneId="21" />)
    await preview()
    await act(async () => fireEvent.click(createButton()))

    expect(bulkCreateLocationsAction).toHaveBeenCalledTimes(1)
    expect(screen.getByText('생성 48개 · 건너뜀 2개')).toBeTruthy()
    const link = screen.getByRole('link', { name: '생성된 로케이션 보기' })
    expect(link.getAttribute('href')).toContain('zone=21')
  })
})
