import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommonCodeProvider } from '@/components/common-code'
import type { OperatorInput } from '@/lib/operator/operator-schema'
import { saveOperatorAction } from './actions'
import { CompanyForm } from './company-form'

vi.mock('./actions', () => ({ saveOperatorAction: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/test',
}))

beforeAll(() => {
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver
  Element.prototype.scrollIntoView = vi.fn()
})

const EMPTY: OperatorInput = {
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

const CODES = {
  CONTACT_DUTY: [
    { code: 'INBOUND', name: '입고', isActive: true },
    { code: 'SETTLEMENT', name: '정산', isActive: true },
  ],
}

const renderForm = (initial: OperatorInput = EMPTY, readOnly = false) =>
  render(
    <CommonCodeProvider options={CODES}>
      <CompanyForm header={{ title: '운영사' }} initial={initial} version={1} readOnly={readOnly} />
    </CommonCodeProvider>,
  )

// 필수 칸 이름표는 '회사명 *'처럼 별표가 붙으므로 앞부분으로 찾는다
const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`))
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } })
const addContact = () => fireEvent.click(screen.getByRole('button', { name: '담당자 추가' }))
const save = () => act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))

beforeEach(() => {
  vi.mocked(saveOperatorAction).mockReset()
  vi.mocked(saveOperatorAction).mockResolvedValue({ ok: true, data: { rowVersion: 1 } })
})

describe('CompanyForm', () => {
  it('저장 전에 화면에서 검사해 칸·담당자 행별 오류를 보여주고, 서버에 보내지 않는다', async () => {
    renderForm()
    type('회사명', '예시')
    addContact()
    await save()

    expect(
      screen.getByText('사업자등록번호를 확인해 주세요. (10자리, 검증번호 불일치)'),
    ).toBeTruthy()
    const row = screen.getByRole('row', { name: '1번째 행' })
    expect(within(row).getByText('담당 업무를 골라 주세요.')).toBeTruthy()
    expect(within(row).getByText('담당자명을 입력해 주세요.')).toBeTruthy()
    expect(within(row).getByText('연락처와 이메일 중 하나는 입력해 주세요.')).toBeTruthy()
    expect(saveOperatorAction).not.toHaveBeenCalled()
  })

  it('담당자는 5명까지, 첫 담당자가 대표, 행을 지울 수 있다', () => {
    renderForm()
    for (let i = 0; i < 5; i++) addContact()

    expect(screen.getByRole('button', { name: '담당자 추가' })).toHaveProperty('disabled', true)
    expect(screen.getByText('5 / 5명 (최대)')).toBeTruthy()
    expect(
      screen.getAllByRole('radio', { name: '대표' }).map((r) => (r as HTMLInputElement).checked),
    ).toEqual([true, false, false, false, false])

    fireEvent.click(screen.getByRole('button', { name: '3번째 행 삭제' }))
    expect(screen.getAllByRole('row', { name: /번째 행/ })).toHaveLength(4)
  })

  it('번호는 하이픈을 붙여 보여주고 숫자만 보내며, 저장 후 변경 표시가 사라진다', async () => {
    renderForm()
    type('회사명', '예시물류(주)')
    type('사업자등록번호', '1234567891')
    type('대표 전화', '021234567')
    expect(field('사업자등록번호')).toHaveProperty('value', '123-45-67891')
    expect(field('대표 전화')).toHaveProperty('value', '02-123-4567')
    expect(screen.getByText('변경사항 있음')).toBeTruthy()
    await save()

    expect(saveOperatorAction).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '예시물류(주)',
        businessNumber: '1234567891',
        phone: '021234567',
      }),
    )
    expect(screen.getByRole('status').textContent).toBe('저장했습니다.')
    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', true)
  })

  it('서버의 행 단위 오류도 그 칸에 보여준다', async () => {
    vi.mocked(saveOperatorAction).mockResolvedValue({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: '입력값을 확인해 주세요.',
        fieldErrors: { 'contacts.0.name': ['서버가 거부한 이름'] },
      },
    })
    renderForm({
      ...EMPTY,
      name: '예시',
      businessNumber: '1234567891',
      contacts: [{ duty: 'INBOUND', name: '김', phone: '', email: 'a@b.co', isPrimary: true }],
    })
    type('회사명', '예시2')
    await save()
    const row = screen.getByRole('row', { name: '1번째 행' })
    expect(within(row).getByText('서버가 거부한 이름')).toBeTruthy()
  })

  it('[취소]는 처음 값으로 되돌린다', () => {
    renderForm({ ...EMPTY, name: '원래 이름' })
    type('회사명', '바뀐 이름')
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(field('회사명')).toHaveProperty('value', '원래 이름')
  })

  it('읽기 전용: 입력칸·행 삭제가 잠기고 저장 막대·추가·주소 검색 버튼이 없다', () => {
    renderForm(
      {
        ...EMPTY,
        name: '예시물류(주)',
        contacts: [
          { duty: 'SETTLEMENT', name: '이정산', phone: '', email: 'a@b.co', isPrimary: true },
        ],
      },
      true,
    )
    expect(field('회사명')).toHaveProperty('disabled', true)
    expect(screen.queryByRole('button', { name: '1번째 행 삭제' })).toHaveProperty('disabled', true)
    for (const name of ['저장', '담당자 추가', '주소 검색']) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
  })
})
