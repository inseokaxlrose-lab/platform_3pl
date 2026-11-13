import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { AddressFields, type AddressValue } from './address-fields'
import { toAddress, type KakaoPostcodeResult } from './kakao-postcode'

const RESULT: KakaoPostcodeResult = {
  zonecode: '13529',
  address: '경기 성남시 분당구 판교역로 166',
  roadAddress: '경기 성남시 분당구 판교역로 166',
  jibunAddress: '경기 성남시 분당구 백현동 532',
  userSelectedType: 'R',
  buildingName: '테스트빌딩',
  apartment: 'N',
  bname: '백현동',
}

// 가짜 카카오 우편번호: embed 하면 바로 검색 결과 하나를 고른 것처럼 동작
function installFakePostcode(result = RESULT) {
  window.kakao = {
    Postcode: class {
      constructor(private options: { oncomplete: (data: KakaoPostcodeResult) => void }) {}
      embed() {
        setTimeout(() => this.options.oncomplete(result), 0)
      }
    },
  }
}

function Harness() {
  const [value, setValue] = useState<AddressValue>({ zipCode: '', address: '', addressDetail: '' })
  return (
    <>
      <AddressFields value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}
const value = () => JSON.parse(screen.getByTestId('value').textContent!) as AddressValue

afterEach(() => {
  delete window.kakao
  document.head.querySelectorAll('script').forEach((s) => s.remove())
})

describe('toAddress (검색 결과 → 저장할 주소)', () => {
  it('도로명 주소 + (동, 공동주택 건물명)', () => {
    expect(toAddress(RESULT)).toEqual({
      zipCode: '13529',
      address: '경기 성남시 분당구 판교역로 166 (백현동)',
    })
    expect(toAddress({ ...RESULT, apartment: 'Y' }).address).toBe(
      '경기 성남시 분당구 판교역로 166 (백현동, 테스트빌딩)',
    )
  })

  it('지번을 고르면 지번 주소 그대로', () => {
    expect(toAddress({ ...RESULT, userSelectedType: 'J' }).address).toBe(
      '경기 성남시 분당구 백현동 532',
    )
  })
})

describe('AddressFields', () => {
  it('[주소 검색]에서 고르면 우편번호·주소가 채워지고 상세주소로 초점이 간다', async () => {
    installFakePostcode()
    render(<Harness />)
    expect(screen.getByLabelText('주소')).toHaveProperty('readOnly', true)

    fireEvent.click(screen.getByRole('button', { name: '주소 검색' }))
    await act(async () => new Promise((r) => setTimeout(r, 50)))

    expect(value()).toEqual({
      zipCode: '13529',
      address: '경기 성남시 분당구 판교역로 166 (백현동)',
      addressDetail: '',
    })
    // 팝업은 닫힘 애니메이션이 끝난 뒤 사라지므로 초점이 옮겨질 때까지 기다린다
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('상세주소')))
  })

  it('검색 서비스를 불러오지 못하면 안내하고 직접 입력할 수 있게 연다', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '주소 검색' }))
    // 스크립트 불러오기 실패 흉내
    await act(async () => {
      document.head.querySelector('script')?.dispatchEvent(new Event('error'))
    })

    expect(screen.getByRole('alert').textContent).toContain('직접 입력해 주세요')
    expect(screen.getByLabelText('주소')).toHaveProperty('readOnly', false)
    fireEvent.change(screen.getByLabelText('주소'), { target: { value: '직접 쓴 주소' } })
    expect(value().address).toBe('직접 쓴 주소')
  })
})
