import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanyInput } from '@/lib/company/company-schema'
import { saveCompanyAction } from './actions'
import { CompanyForm } from './company-form'

vi.mock('./actions', () => ({ saveCompanyAction: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const EMPTY: CompanyInput = {
  name: '',
  businessNumber: '',
  ceoName: '',
  businessType: '',
  businessItem: '',
  phone: '',
  fax: '',
  email: '',
  zipCode: '',
  address: '',
  addressDetail: '',
  contacts: [],
}

// 필수 칸 이름표는 '회사명 *'처럼 별표가 붙으므로 앞부분으로 찾는다
const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`))
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } })
const addContact = () => fireEvent.click(screen.getByRole('button', { name: '담당자 추가' }))

beforeEach(() => {
  vi.mocked(saveCompanyAction).mockReset()
  vi.mocked(saveCompanyAction).mockResolvedValue({ ok: true, data: { saved: true } })
})

describe('CompanyForm', () => {
  it('저장 전에 화면에서 검사해 칸·담당자 줄별 오류를 보여주고, 서버에 보내지 않는다', async () => {
    render(<CompanyForm initial={EMPTY} readOnly={false} />)
    addContact()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))

    expect(screen.getByText('회사명을 입력해 주세요.')).toBeTruthy()
    const contact = screen.getByRole('listitem', { name: '담당자 1' })
    expect(within(contact).getByText('담당자명을 입력해 주세요.')).toBeTruthy()
    expect(saveCompanyAction).not.toHaveBeenCalled()
  })

  it('담당자는 5명까지 추가할 수 있고, 줄을 지울 수 있다', () => {
    render(<CompanyForm initial={EMPTY} readOnly={false} />)
    for (let i = 0; i < 5; i++) addContact()

    expect(screen.getByRole('button', { name: '담당자 추가' })).toHaveProperty('disabled', true)
    expect(screen.getByText('담당자 (5/5)')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '담당자 3 삭제' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('올바르게 입력하면 저장하고, 저장된 모양(사업자번호 하이픈)으로 맞춘다', async () => {
    render(<CompanyForm initial={EMPTY} readOnly={false} />)
    type('회사명', '예시물류(주)')
    type('사업자등록번호', '1234567891')
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))

    expect(saveCompanyAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: '예시물류(주)', businessNumber: '1234567891' }),
    )
    expect(screen.getByRole('status').textContent).toBe('저장했습니다.')
    expect(field('사업자등록번호')).toHaveProperty('value', '123-45-67891')
  })

  it('읽기 전용: 입력칸이 잠기고 저장·추가·주소 검색 버튼이 없다', () => {
    render(
      <CompanyForm
        initial={{
          ...EMPTY,
          name: '예시물류(주)',
          contacts: [{ duty: '정산', name: '이정산', phone: '', email: '' }],
        }}
        readOnly
      />,
    )
    expect(field('회사명')).toHaveProperty('disabled', true)
    for (const name of ['저장', '담당자 추가', '주소 검색', '담당자 1 삭제']) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
  })
})
