'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { z } from 'zod'
import type { ActionResult } from '@/lib/actions'

// 오류 위치 → 문구 (예: 'businessNumber', 'contacts.0.name', 'contacts' = 표 전체)
export type FormErrors = Record<string, string>

type UseMasterFormOptions<TSchema extends z.ZodType, TResult> = {
  // 처음 값 = 변경 감지·[취소]의 기준
  initial: z.input<TSchema>
  // 화면·서버 공용 입력 규칙: 저장 전에 화면에서 먼저 검사한다
  schema: TSchema
  // 동시 수정 막기: 불러올 때의 버전 (row_version). 등록 화면은 비운다
  // 저장할 때 save의 두 번째 값으로 넘기고, 저장 결과에 rowVersion이 있으면 새 버전으로 바꾼다
  version?: number | null
  // 서버 액션 호출 (서버도 같은 규칙으로 다시 검사)
  save: (value: z.input<TSchema>, version: number | null) => Promise<ActionResult<TResult>>
  // 저장 성공 후 화면에 다시 채울 값 (예: 저장된 모양으로 정리, 새 줄에 서버가 준 키 넣기). 없으면 입력값 그대로
  // saved = 검사를 통과한 값, result = 서버 액션 결과, value = 저장한 입력값
  afterSave?: (
    saved: z.output<TSchema>,
    result: TResult,
    value: z.input<TSchema>,
  ) => z.input<TSchema>
  // 저장 성공 후 할 일 (예: 등록 화면 → 만든 항목의 수정 화면으로 이동). 서버 액션의 결과를 받는다
  onSuccess?: (result: TResult) => void
}

// 기준정보 입력 화면의 공통 동작: 값·오류·변경 감지·취소·저장 (MasterFormPage와 함께 쓴다)
export function useMasterForm<TSchema extends z.ZodType, TResult = unknown>({
  initial,
  version: initialVersion = null,
  schema,
  save,
  afterSave,
  onSuccess,
}: UseMasterFormOptions<TSchema, TResult>) {
  type Input = z.input<TSchema>
  const router = useRouter()
  const [value, setValue] = useState<Input>(initial)
  // 변경 감지 기준: 저장에 성공하면 새 값이 기준이 된다
  const [baseline, setBaseline] = useState<Input>(initial)
  const [version, setVersion] = useState<number | null>(initialVersion)
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
        const result = await save(value, version)
        if (!result.ok) {
          fail(
            Object.fromEntries(
              Object.entries(result.error.fieldErrors ?? {}).map(([key, list]) => [key, list[0]]),
            ),
            result.error.message,
          )
          return
        }
        // 저장으로 올라간 버전을 들고 있어야 다음 저장이 충돌로 막히지 않는다
        const savedVersion = (result.data as { rowVersion?: unknown } | null)?.rowVersion
        if (typeof savedVersion === 'number') setVersion(savedVersion)
        const next = afterSave ? afterSave(parsed.data, result.data, value) : value
        setValue(next)
        setBaseline(next)
        // 저장은 됐지만 알려 줄 것이 있으면 결과의 notice를 덧붙인다 (예: 할당 가능 창고 없음 경고)
        const notice = (result.data as { notice?: unknown } | null)?.notice
        setMessage({
          ok: true,
          text: typeof notice === 'string' && notice ? `저장했습니다. ${notice}` : '저장했습니다.',
        })
        if (onSuccess) onSuccess(result.data)
        else router.refresh()
      })
    },
  }
}

// MasterFormPage가 쓰는 부분만 (값의 모양과 상관없이)
export type MasterFormState = Pick<
  ReturnType<typeof useMasterForm>,
  'errors' | 'message' | 'pending' | 'dirty' | 'submitCount' | 'cancel' | 'submit'
>
