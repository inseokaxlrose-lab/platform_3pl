import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { InheritableField } from './inheritable-field'
import { TimeInput, formatTimeDigits } from './time-input'
import { WeekdaySelect } from './weekday-select'

beforeAll(() => {
  // 체크박스(Radix)가 크기를 잴 때 쓴다
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

describe('TimeInput (시각 HH:MM)', () => {
  it('숫자만 치면 콜론을 붙이고, 값은 HH:MM 글자', () => {
    expect(formatTimeDigits('09')).toBe('09')
    expect(formatTimeDigits('093')).toBe('09:3')
    expect(formatTimeDigits('0930')).toBe('09:30')

    function Harness() {
      const [value, setValue] = useState('')
      return (
        <>
          <TimeInput aria-label="시각" value={value} onChange={setValue} />
          <output data-testid="value">{value}</output>
        </>
      )
    }
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('시각'), { target: { value: '17305' } })
    expect(screen.getByTestId('value').textContent).toBe('17:30')
    expect(screen.getByLabelText('시각')).toHaveProperty('value', '17:30')
  })
})

describe('WeekdaySelect (운영 요일)', () => {
  it('요일 버튼으로 켜고 끄고, [매일]·[평일]로 한 번에', () => {
    function Harness() {
      const [value, setValue] = useState('YYYYYNN')
      return (
        <>
          <WeekdaySelect value={value} onChange={setValue} />
          <output data-testid="value">{value}</output>
        </>
      )
    }
    render(<Harness />)
    const value = () => screen.getByTestId('value').textContent
    fireEvent.click(screen.getByRole('button', { name: '토' }))
    expect(value()).toBe('YYYYYYN')
    fireEvent.click(screen.getByRole('button', { name: '월' }))
    expect(value()).toBe('NYYYYYN')
    fireEvent.click(screen.getByRole('button', { name: '매일' }))
    expect(value()).toBe('YYYYYYY')
    fireEvent.click(screen.getByRole('button', { name: '평일' }))
    expect(value()).toBe('YYYYYNN')
    expect(screen.getByRole('button', { name: '월' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('InheritableField (상속 칸)', () => {
  it('위 단계 값을 쓰면 값을 보여 주고, 체크를 풀면 입력 부품이 나온다', () => {
    function Harness() {
      const [value, setValue] = useState('')
      return (
        <InheritableField
          id="cutoff"
          parentLabel="운영사"
          parentValue="17:00"
          inherited={value === ''}
          onInheritedChange={(inherited) => setValue(inherited ? '' : '17:00')}
        >
          <input aria-label="직접 입력" value={value} onChange={(e) => setValue(e.target.value)} />
        </InheritableField>
      )
    }
    render(<Harness />)
    expect(screen.getByText('운영사 값: 17:00')).toBeTruthy()
    expect(screen.queryByLabelText('직접 입력')).toBeNull()
    fireEvent.click(screen.getByLabelText('운영사 값 사용'))
    expect(screen.getByLabelText('직접 입력')).toHaveProperty('value', '17:00')
    fireEvent.click(screen.getByLabelText('운영사 값 사용'))
    expect(screen.getByText('운영사 값: 17:00')).toBeTruthy()
  })
})
