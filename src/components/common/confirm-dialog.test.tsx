import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from './confirm-dialog'

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = props.onConfirm ?? vi.fn()
  render(
    <ConfirmDialog
      trigger={<Button>잔량 마감</Button>}
      title="잔량을 마감할까요?"
      confirmLabel="마감"
      {...props}
      onConfirm={onConfirm}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '잔량 마감' }))
  return { onConfirm }
}

describe('ConfirmDialog', () => {
  it('확인을 누르면 onConfirm이 실행되고 닫힌다', async () => {
    const { onConfirm } = renderDialog()

    fireEvent.click(screen.getByRole('button', { name: '마감' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(onConfirm).toHaveBeenCalledWith(undefined)
  })

  it('사유가 필수면, 사유를 적기 전에는 확인할 수 없다', () => {
    renderDialog({ reason: { label: '마감 사유' } })

    const confirm = screen.getByRole('button', { name: '마감' })
    expect(confirm).toHaveProperty('disabled', true)

    // 공백만 입력해도 사유로 인정하지 않는다
    fireEvent.change(screen.getByLabelText(/마감 사유/), { target: { value: '   ' } })
    expect(confirm).toHaveProperty('disabled', true)
  })

  it('사유를 적으면 앞뒤 공백을 지운 사유가 전달된다', async () => {
    const { onConfirm } = renderDialog({ reason: { label: '마감 사유' } })

    fireEvent.change(screen.getByLabelText(/마감 사유/), {
      target: { value: '  화주사 요청으로 잔량 취소  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '마감' }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('화주사 요청으로 잔량 취소'))
  })

  it('처리에 실패하면 닫히지 않고 오류 메시지를 보여준다', async () => {
    renderDialog({
      onConfirm: () => Promise.reject(new Error('이미 마감된 ASN입니다.')),
    })

    fireEvent.click(screen.getByRole('button', { name: '마감' }))

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', '이미 마감된 ASN입니다.')
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })
})
