import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { readDraft } from '@/lib/navigation/form-drafts'
import { setMenuResolver } from '@/lib/navigation/page-dirty'
import { requireOneOf } from '@/lib/validation/common-fields'
import { EditableSubTable } from './editable-sub-table'
import { Field, FormGrid } from './form-grid'
import { MasterFormPage } from './master-form-page'
import { useMasterForm } from './use-master-form'

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  usePathname: () => '/admin/test',
}))

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
  // 작성 중 내용 보관(0097)은 sessionStorage에 남으므로 시험마다 비운다
  sessionStorage.clear()
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
    expect(screen.getByText('2 / 2개 (최대)')).toBeTruthy()
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

function FormHarness({
  save,
  version,
}: {
  save: (value: unknown, version: number | null) => Promise<{ ok: true; data: unknown }>
  version?: number
}) {
  const form = useMasterForm({
    initial: { name: '원래', phone: '', email: 'a@b.c' },
    version,
    schema,
    save,
  })
  return (
    <>
      <a href="/elsewhere">다른 화면</a>
      <a href="/admin/test/list">같은 메뉴 목록</a>
      <MasterFormPage
        header={{ title: '견본' }}
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

  it('동시 수정 막기: 불러온 버전을 보내고, 저장 결과의 새 버전으로 다음 저장을 한다', async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { rowVersion: 4 } })
      .mockResolvedValueOnce({ ok: true, data: { rowVersion: 5 } })
    render(<FormHarness save={save} version={3} />)
    fireEvent.change(screen.getByLabelText(/이름/), { target: { value: '한 번' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))
    fireEvent.change(screen.getByLabelText(/이름/), { target: { value: '두 번' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))

    expect(save.mock.calls.map((call) => call[1])).toEqual([3, 4])
  })

  it('저장에 성공하면 그 값이 새 기준이 되고 화면을 새로 읽는다', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true, data: null })
    render(<FormHarness save={save} />)
    fireEvent.change(screen.getByLabelText(/이름/), { target: { value: '새 이름' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))

    // 두 번째 값은 버전 (등록 화면처럼 버전이 없으면 null)
    expect(save).toHaveBeenCalledWith({ name: '새 이름', phone: '', email: 'a@b.c' }, null)
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

describe('MasterFormPage 따로 처리하는 섹션 · 저장 후 동작', () => {
  function Standalone({ onSuccess }: { onSuccess: (id: string) => void }) {
    const form = useMasterForm({
      initial: { name: '', phone: '', email: 'a@b.c' },
      schema,
      save: async () => ({ ok: true as const, data: 'new-id' }),
      onSuccess,
    })
    return (
      <MasterFormPage
        header={{ title: '견본' }}
        form={form}
        sections={[
          {
            id: 'account',
            title: '계정 관리',
            standalone: true,
            content: (
              <form aria-label="비밀번호 초기화">
                <button type="submit">초기화</button>
              </form>
            ),
          },
          {
            id: 'basic',
            title: '기본 정보',
            content: (
              <input
                aria-label="이름"
                value={form.value.name}
                onChange={(e) => form.set({ name: e.target.value })}
              />
            ),
          },
        ]}
      />
    )
  }

  it('따로 처리하는 섹션은 폼 밖·뒤에 그리고, 목차에는 함께 나온다', () => {
    render(<Standalone onSuccess={vi.fn()} />)
    const nav = screen.getByRole('navigation', { name: '섹션 목차' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['기본 정보', '계정 관리'])
    // 폼 안에 폼이 들어가지 않는다
    const inner = screen.getByRole('form', { name: '비밀번호 초기화' })
    expect(inner.parentElement?.closest('form')).toBeNull()
  })

  it('저장 성공 후 onSuccess에 서버 결과를 넘긴다 (저장 막대는 form 속성으로 폼과 연결)', async () => {
    const onSuccess = vi.fn()
    render(<Standalone onSuccess={onSuccess} />)
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '새' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))
    expect(onSuccess).toHaveBeenCalledWith('new-id')
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('등록 화면: 저장 후 [계속 등록]', () => {
  function CreateHarness({ save }: { save: () => Promise<{ ok: true; data: { id: string } }> }) {
    const form = useMasterForm({
      initial: { name: '', phone: '', email: 'a@b.c' },
      schema,
      save,
      createdHref: (created) => `/admin/test/${created.id}`,
    })
    return (
      <MasterFormPage
        header={{ title: '견본 등록' }}
        form={form}
        sections={[
          {
            id: 'basic',
            title: '기본 정보',
            content: (
              <input
                aria-label="이름"
                value={form.value.name}
                onChange={(e) => form.set({ name: e.target.value })}
              />
            ),
          },
        ]}
      />
    )
  }

  it('등록하면 머물며 칸을 잠그고 [등록한 항목 보기]·[계속 등록], [계속 등록]은 빈 양식 + 첫 칸 초점', async () => {
    window.scrollTo = vi.fn()
    const save = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { id: '7' } })
      .mockResolvedValueOnce({ ok: true, data: { id: '8' } })
    render(<CreateHarness save={save} />)
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '첫째' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))

    // 이동하지 않고 그 자리에서: 등록 문구, 방금 넣은 값이 잠긴 채, 저장·취소 대신 두 버튼
    expect(push).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('등록했습니다.')
    const name = screen.getByLabelText('이름') as HTMLInputElement
    expect(name.value).toBe('첫째')
    expect(name.closest('fieldset')?.disabled).toBe(true)
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
    expect(screen.getByRole('link', { name: '등록한 항목 보기' }).getAttribute('href')).toBe(
      '/admin/test/7',
    )

    fireEvent.click(screen.getByRole('button', { name: '계속 등록' }))
    const fresh = screen.getByLabelText('이름') as HTMLInputElement
    expect(fresh.value).toBe('')
    expect(fresh.closest('fieldset')?.disabled).toBe(false)
    await waitFor(() => expect(document.activeElement).toBe(fresh))
    // 빈 양식이라 변경 없음 → 떠나도 확인 창 없음, [저장]은 꺼짐
    expect(screen.queryByText('변경사항 있음')).toBeNull()
    expect(screen.getByRole('button', { name: '저장' })).toHaveProperty('disabled', true)

    // 두 번째 등록도 같은 흐름 (등록 화면은 버전 없이 보낸다)
    fireEvent.change(fresh, { target: { value: '둘째' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))
    expect(save.mock.calls[1]).toEqual([{ name: '둘째', phone: '', email: 'a@b.c' }, null])
    expect(screen.getByRole('link', { name: '등록한 항목 보기' }).getAttribute('href')).toBe(
      '/admin/test/8',
    )
  })
})

describe('작성 중 내용 임시 보관 (0097)', () => {
  const name = () => screen.getByLabelText(/이름/) as HTMLInputElement

  beforeEach(() => {
    // 지금 화면 = /admin/test 메뉴, /elsewhere = 다른 메뉴
    window.history.pushState({}, '', '/admin/test')
    setMenuResolver((path) =>
      path.startsWith('/admin/test') ? '/admin/test' : path === '/elsewhere' ? '/elsewhere' : null,
    )
  })

  it('바꾸면 보관하고, 다시 열면 이어서 채운다 → [처음 값으로 되돌리기]면 처음 값·보관 비움', () => {
    const first = render(<FormHarness save={vi.fn()} version={3} />)
    fireEvent.change(name(), { target: { value: '작성 중' } })
    expect(readDraft('/admin/test')).toMatchObject({
      value: { name: '작성 중', phone: '', email: 'a@b.c' },
      version: 3,
    })
    first.unmount()

    render(<FormHarness save={vi.fn()} version={3} />)
    expect(name().value).toBe('작성 중')
    expect(screen.getByText(/저장하지 않은 작성 내용을 불러왔습니다/)).toBeTruthy()
    expect(screen.getByText('변경사항 있음')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '처음 값으로 되돌리기' }))
    expect(name().value).toBe('원래')
    expect(screen.queryByText(/작성 내용을 불러왔습니다/)).toBeNull()
    expect(readDraft('/admin/test')).toBeNull()
  })

  it('되돌려 처음 값과 같아지거나 저장하면 보관을 비운다', async () => {
    const save = vi.fn().mockResolvedValue({ ok: true, data: null })
    render(<FormHarness save={save} />)
    fireEvent.change(name(), { target: { value: '작성 중' } })
    fireEvent.change(name(), { target: { value: '원래' } })
    expect(readDraft('/admin/test')).toBeNull()

    fireEvent.change(name(), { target: { value: '새 이름' } })
    expect(readDraft('/admin/test')).not.toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))
    expect(readDraft('/admin/test')).toBeNull()
  })

  it('그 사이 다른 사람이 고쳤으면(버전이 다름) 주의 안내, 저장은 작성을 시작한 버전으로 보내 충돌로 막힌다', async () => {
    const first = render(<FormHarness save={vi.fn()} version={3} />)
    fireEvent.change(name(), { target: { value: '작성 중' } })
    first.unmount()

    const save = vi.fn().mockResolvedValue({ ok: true, data: null })
    render(<FormHarness save={save} version={4} />)
    expect(screen.getByText(/그 사이 다른 사람이 이 자료를 고쳐서/)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '저장' })))
    expect(save.mock.calls[0][1]).toBe(3)
  })

  it('다른 메뉴로 가는 링크는 묻지 않고, 같은 메뉴 안의 이동은 묻고 [나가기]면 보관도 버린다', async () => {
    render(<FormHarness save={vi.fn()} />)
    fireEvent.change(name(), { target: { value: '작성 중' } })

    fireEvent.click(screen.getByText('다른 화면'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(readDraft('/admin/test')).not.toBeNull()

    fireEvent.click(screen.getByText('같은 메뉴 목록'))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '나가기' }))
    expect(push).toHaveBeenCalledWith('/admin/test/list')
    expect(readDraft('/admin/test')).toBeNull()
  })
})
