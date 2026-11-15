import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { CommonCodeProvider } from '@/components/common-code'
import { codeName, selectableCodes } from '@/lib/common-code'
import { CodeSelect } from './code-select'
import { BizNoInput, PhoneInput } from './number-mask-inputs'
import { NumberInput } from './number-input'

// 상태를 들고 있는 감싸기: 바깥으로 나간 값을 화면에 적어 둔다
function Harness<T>({
  initial,
  render: renderInput,
}: {
  initial: T
  render: (value: T, onChange: (value: T) => void) => React.ReactNode
}) {
  const [value, setValue] = useState(initial)
  return (
    <>
      {renderInput(value, setValue)}
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}
const output = () => JSON.parse(screen.getByTestId('value').textContent!)

describe('번호 마스크 입력', () => {
  it('사업자번호: 화면은 하이픈, 바깥 값은 숫자만, 10자리까지', () => {
    render(
      <Harness
        initial=""
        render={(v, set) => <BizNoInput aria-label="사업자" value={v} onChange={set} />}
      />,
    )
    const input = screen.getByLabelText('사업자') as HTMLInputElement
    fireEvent.change(input, { target: { value: '123456789123' } })
    expect(input.value).toBe('123-45-67891')
    expect(output()).toBe('1234567891')
  })

  it('전화번호: 지역번호에 맞춰 하이픈, 숫자 외 글자는 버린다', () => {
    render(
      <Harness
        initial="021234567"
        render={(v, set) => <PhoneInput aria-label="전화" value={v} onChange={set} />}
      />,
    )
    const input = screen.getByLabelText('전화') as HTMLInputElement
    expect(input.value).toBe('02-123-4567')
    fireEvent.change(input, { target: { value: '010a1234 5678' } })
    expect(input.value).toBe('010-1234-5678')
    expect(output()).toBe('01012345678')
  })
})

describe('NumberInput', () => {
  const setup = (props: Partial<React.ComponentProps<typeof NumberInput>> = {}) =>
    render(
      <Harness<number | null>
        initial={null}
        render={(v, set) => <NumberInput aria-label="수량" value={v} onChange={set} {...props} />}
      />,
    )

  it('천 단위 쉼표, 문자는 입력되지 않는다', () => {
    setup()
    const input = screen.getByLabelText('수량') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '1234567' } })
    expect(input.value).toBe('1,234,567')
    expect(output()).toBe(1234567)
    fireEvent.change(input, { target: { value: '1,234,567x' } })
    expect(input.value).toBe('1,234,567')
  })

  it('소수점 자리수를 넘는 입력은 막고, 칸을 떠나면 최소·최대로 맞추고 자리수를 고정해 보여준다', () => {
    setup({ decimals: 2, min: 0, max: 100, unit: 'kg' })
    const input = screen.getByLabelText('수량') as HTMLInputElement
    expect(screen.getByText('kg')).toBeTruthy()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '12.5' } })
    fireEvent.change(input, { target: { value: '12.555' } })
    expect(input.value).toBe('12.5')
    fireEvent.blur(input)
    expect(input.value).toBe('12.50')

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '150' } })
    fireEvent.blur(input)
    expect(output()).toBe(100)
    // 최소가 0이면 음수 기호를 받지 않는다
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '-1' } })
    expect(output()).toBe(100)
  })
})

describe('공통코드 고르기', () => {
  const options = [
    { code: 'IN', name: '입고', isActive: true },
    { code: 'OLD', name: '옛 업무', isActive: false },
  ]

  it('사용 중지 코드는 지금 값일 때만 고르기 목록에 남는다', () => {
    expect(selectableCodes(options).map((o) => o.code)).toEqual(['IN'])
    expect(selectableCodes(options, 'OLD').map((o) => o.code)).toEqual(['IN', 'OLD'])
    expect(codeName(options, 'OLD')).toBe('옛 업무')
    expect(codeName(options, 'NOPE')).toBe('NOPE')
    expect(codeName(options, null)).toBe('')
  })

  it('그룹만 넘기면 공급자의 목록에서 지금 값의 이름을 보여준다', () => {
    render(
      <CommonCodeProvider options={{ DUTY: options }}>
        <CodeSelect group="DUTY" value="OLD" onChange={() => {}} id="duty" />
      </CommonCodeProvider>,
    )
    expect(screen.getByRole('combobox').textContent).toContain('옛 업무')
  })
})
