'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { z } from 'zod'
import type { ActionResult } from '@/lib/actions'

// 오류 위치 → 문구 (예: 'businessNumber', 'contacts.0.name', 'contacts' = 표 전체)
export type FormErrors = Record<string, string>

type UseMasterFormOptions<TSchema extends z.ZodType> = {
  // 처음 값 = 변경 감지·[취소]의 기준
  initial: z.input<TSchema>
  // 화면·서버 공용 입력 규칙: 저장 전에 화면에서 먼저 검사한다
  schema: TSchema
  // 서버 액션 호출 (서버도 같은 규칙으로 다시 검사)
  save: (value: z.input<TSchema>) => Promise<ActionResult<unknown>>
  // 저장 성공 후 화면에 다시 채울 값 (예: 저장된 모양으로 정리). 없으면 입력값 그대로
  afterSave?: (saved: z.output<TSchema>) => z.input<TSchema>
}

// 기준정보 입력 화면의 공통 동작: 값·오류·변경 감지·취소·저장 (MasterFormPage와 함께 쓴다)
export function useMasterForm<TSchema extends z.ZodType>({
  initial,
  schema,
  save,
  afterSave,
}: UseMasterFormOptions<TSchema>) {
  type Input = z.input<TSchema>
  const router = useRouter()
  const [value, setValue] = useState<Input>(initial)
  // 변경 감지 기준: 저장에 성공하면 새 값이 기준이 된다
  const [baseline, setBaseline] = useState<Input>(initial)
  const [errors, setErrors] = useState<FormErrors>({})
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  // 저장 시도 횟수: 바뀔 때마다 MasterFormPage가 첫 오류 칸으로 이동한다
  const [submitCount, setSubmitCount] = useState(0)
  const [pending, startTransition] = useTransition()

  const dirty = JSON.stringify(value) !== JSON.stringify(baseline)

  function fail(nextErrors: FormErrors, text: string) {
    setErrors(nextErrors)
    setMessage({ ok: false, text })
    setSubmitCount((n) => n + 1)
  }

  return {
    value,
    // 일부 칸 바꾸기 (예: set({ name: '…' }))
    set(patch: Partial<Input>) {
      setValue((previous: Input) => ({ ...(previous as object), ...patch }) as Input)
      setMessage(null)
    },
    errors,
    message,
    pending,
    dirty,
    submitCount,
    // [취소]: 처음 값(마지막 저장 값)으로 되돌린다
    cancel() {
      setValue(baseline)
      setErrors({})
      setMessage(null)
    },
    submit(event?: React.FormEvent) {
      event?.preventDefault()
      const parsed = schema.safeParse(value)
      if (!parsed.success) {
        fail(
          Object.fromEntries(
            [...parsed.error.issues]
              .reverse() // 같은 칸에 오류가 여러 개면 첫 번째 것이 남게
              .map((issue) => [issue.path.join('.'), issue.message]),
          ),
          '입력값을 확인해 주세요.',
        )
        return
      }
      setErrors({})
      startTransition(async () => {
        const result = await save(value)
        if (!result.ok) {
          fail(
            Object.fromEntries(
              Object.entries(result.error.fieldErrors ?? {}).map(([key, list]) => [key, list[0]]),
            ),
            result.error.message,
          )
          return
        }
        const next = afterSave ? afterSave(parsed.data) : value
        setValue(next)
        setBaseline(next)
        setMessage({ ok: true, text: '저장했습니다.' })
        router.refresh()
      })
    },
  }
}

// MasterFormPage가 쓰는 부분만 (값의 모양과 상관없이)
export type MasterFormState = Pick<
  ReturnType<typeof useMasterForm>,
  'errors' | 'message' | 'pending' | 'dirty' | 'submitCount' | 'cancel' | 'submit'
>
