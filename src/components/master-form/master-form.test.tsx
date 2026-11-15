import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { requireOneOf } from '@/lib/validation/common-fields'
import { EditableSubTable } from './editable-sub-table'
import { Field, FormGrid } from './form-grid'
import { MasterFormPage } from './master-form-page'
import { useMasterForm } from './use-master-form'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

beforeAll(() => {
  // jsdom에 없는 브라우저 기능 채우기
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

type Contact = { name: string; phone: string; isPrimary: boolean }

describe('EditableSubTable', () => {
  function Harness({ max = 2, initial = [] as Contact[] }) {
    const [rows, setRows] = useState<Contact[]>(initial)
    return (
      <>
        <EditableSubTable
          name="contacts"
          rows={rows}
          onChange={setRows}
          columns={[
            { key: 'name', label: '이름', required: true },
            { key: 'phone', label: '연락처', input: 'phone' },
          ]}
          createRow={() => ({ name: '', phone: '', isPrimary: false })}
          maxRows={max}
          primary={{ key: 'isPrimary', label: '대표' }}
          errors={{ 'contacts.0.name': '이름을 입력해 주세요.', contacts: '표 오류' }}
          addLabel="담당자 추가"
        />
        <output data-testid="rows">{JSON.stringify(rows)}</output>
      </>
    )
  }
  const rows = () => JSON.parse(screen.getByTestId('rows').textContent!) as Contact[]

  it('추가하면 첫 행이 자동으로 대표, 최대 개수에서 [추가]가 꺼진다', () => {
    render(<Harness />)
    expect(screen.getByText('등록된 항목이 없습니다.')).toBeTruthy()
    const add = screen.getByRole('button', { name: '담당자 추가' })
    fireEvent.click(add)
    fireEvent.click(add)
    expect(rows().map((r) => r.isPrimary)).toEqual([true, false])
    expect(add).toHaveProperty('disabled', true)
    expect(screen.getByText('2 / 2 (최대)')).toBeTruthy()
  })

  it('대표는 하나만, 대표 행을 지우면 남은 첫 행이 대표', () => {
    render(
      <Harness
        max={5}
        initial={[
          { name: '김', phone: '', isPrimary: true },
          { name: '이', phone: '', isPrimary: false },
          { name: '박', phone: '', isPrimary: false },
        ]}
      />,
    )
    fireEvent.click(screen.getAllByRole('radio', { name: '대표' })[2])
    expect(rows().map((r) => r.isPrimary)).toEqual([false, false, true])
    fireEvent.click(screen.getByRole('button', { name: '3번째 행 삭제' }))
    expect(rows()).toEqual([
      { name: '김', phone: '', isPrimary: true },
      { name: '이', phone: '', isPrimary: false },
    ])
  })

  it('칸 입력은 입력 부품 종류대로, 행 오류·표 오류를 보여준다', () => {
    render(<Harness initial={[{ name: '', phone: '', isPrimary: true }]} />)
    const row = screen.getByRole('row', { name: '1번째 행' })
    fireEvent.change(within(row).getByLabelText('연락처'), { target: { value: '01012345678' } })
    expect(rows()[0].phone).toBe('01012345678')
    expect((within(row).getByLabelText('연락처') as HTMLInputElement).value).toBe('010-1234-5678')
    expect(within(row).getByRole('alert').textContent).toBe('이름을 입력해 주세요.')
    expect(screen.getByText('표 오류')).toBeTruthy()
  })
})

const schema = z
  .object({
    name: z.string().trim().min(1, '이름을 입력해 주세요.'),
    phone: z.string(),
    email: z.string(),
  })
  .superRefine(requireOneOf(['phone', 'email'], '연락처나 이메일을 입력해 주세요.'))

function FormHarness({ save }: { save: () => Promise<{ ok: true; data: null }> }) {
  const form = useMasterForm({ initial: { name: '원래', phone: '', email: 'a@b.c' }, schema, save })
  return (
    <>
      <a href="/elsewhere">다른 화면</a>
      <MasterFormPage
        form={form}
        sections={[
          {
            id: 'basic',
            title: '기본 정보',
            content: (
              <FormGrid>
                <Field label="이름" required htmlFor="f-name" error={form.errors.name}>
                  <input
                    id="f-name"
                    value={form.value.name}
                    aria-invalid={Boolean(form.errors.name)}
                    onChange={(e) => form.set({ name: e.target.value })}
                  />
                </Field>
                <Field label="이메일" htmlFor="f-email" error={form.errors.email}>
                  <input
                    id="f-email"
                    value={form.value.email}
                    onChange={(e) => form.set({ email: e.target.value })}
                  />
                </Field>
              </FormGrid>
            ),
          },
        ]}
      />
    </>
  )
}

describe('MasterFormPage + useMasterForm', () => {
  it('바꾸면 "변경사항 있음"과 [저장]·[취소]가 켜지고, [취소]는 처음 값으로 되돌린다', () => {
    render(<FormHarness save={vi.fn()} />)
    const save = screen.getByRole('button', { name: '저장' })
    expect(save).toHaveProperty('disabled', true)

    fireEvent.change(screen.getByLabelText(/이름/), { target: { value: '바뀜' } })
    expect(screen.getByText('변경사항 있음')).toBeTruthy()
    expect(save).toHaveProperty('disabled', false)

    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect((screen.getByLabelText(/이름/) as HTMLInputElement).value).toBe('원래')
    expect(screen.queryByText('변경사항 있음')).toBeNull()
  })

  it('검사에 실패하면 서버에 보내지 않고 첫 오류 칸에 초점, 목차에 오류 표시', async () => {
    const save = vi.fn()
    render(<FormHarness save={save} />)
    fireEvent.change(screen.getByLabelText(/이름/), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(save).not.toHaveBeenCalled()
    expect(screen.getByText('이름을 입력해 주세요.')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/이름/)))
    expect(screen.getByLabelText('오류 있음')).toBeTruthy()
  })

  it('저장에 성공하면 그 값이 새 기준이 되고 화면을 새로 읽는다', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true, data: null })
    render(<FormHarness save={save} />)
    fireEvent.change(screen.getByLabelText(/이름/), { target: { value: '새 이름' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))

    expect(save).toHaveBeenCalledWith({ name: '새 이름', phone: '', email: 'a@b.c' })
    expect(screen.getByRole('status').textContent).toBe('저장했습니다.')
    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', true)
    expect(refresh).toHaveBeenCalled()
  })

  it('저장하지 않고 링크를 누르면 확인 창, [나가기]를 눌러야 이동한다', async () => {
    render(<FormHarness save={vi.fn()} />)
    // 변경이 없으면 막지 않는다 (jsdom은 실제 이동을 하지 않으므로 확인 창이 안 뜨는지만 본다)
    fireEvent.click(screen.getByText('다른 화면'))
    expect(screen.queryByRole('alertdialog')).toBeNull()

    fireEvent.change(screen.getByLabelText(/이름/), { target: { value: '바뀜' } })
    fireEvent.click(screen.getByText('다른 화면'))
    const dialog = await screen.findByRole('alertdialog')
    expect(push).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '나가기' }))
    expect(push).toHaveBeenCalledWith('/elsewhere')
  })
})
