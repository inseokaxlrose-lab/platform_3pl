import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CenterSelect } from './center-select'
import { WarehouseSelect } from './warehouse-select'

// 센터·창고 고르기 (docs/decisions/0074)

const CENTERS = [{ id: 'c1', code: 'ICN', name: '이천센터' }]
const WAREHOUSES = [
  { id: 'w1', centerId: 'c1', code: 'A', name: 'A동' },
  { id: 'w2', centerId: 'c2', code: 'B', name: 'B동' },
]

function Harness({ allowAll = false }: { allowAll?: boolean }) {
  const [center, setCenter] = useState('')
  const [warehouse, setWarehouse] = useState('')
  return (
    <>
      <CenterSelect
        id="center"
        options={CENTERS}
        value={center}
        onChange={setCenter}
        allowAll={allowAll}
      />
      <WarehouseSelect
        id="warehouse"
        options={WAREHOUSES}
        centerId={center}
        value={warehouse}
        onChange={setWarehouse}
        allowAll={allowAll}
      />
      <output data-testid="values">{`${center}/${warehouse}`}</output>
    </>
  )
}

describe('CenterSelect · WarehouseSelect', () => {
  it('센터가 하나뿐이면 저절로 고르고, 그 센터의 창고가 하나뿐이면 창고도 고른다', () => {
    render(<Harness />)
    expect(screen.getByTestId('values').textContent).toBe('c1/w1')
  })

  it('검색 조건용(allowAll)은 저절로 고르지 않고, 센터를 고르기 전에는 창고가 꺼진다', () => {
    render(<Harness allowAll />)
    expect(screen.getByTestId('values').textContent).toBe('/')
    expect(document.getElementById('warehouse')).toHaveProperty('disabled', true)
  })
})
