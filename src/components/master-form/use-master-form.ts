'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import type { z } from 'zod'
import type { ActionResult } from '@/lib/actions'
import { readDraft, removeDraft, writeDraft } from '@/lib/navigation/form-drafts'

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
  // 저장 성공 후 할 일. 서버 액션의 결과를 받는다
  onSuccess?: (result: TResult) => void
  // 등록 화면: 만든 항목의 주소. 주면 저장 후 등록 화면에 머물며 입력 칸을 잠그고
  // [계속 등록](빈 양식으로)·[등록한 항목 보기](이 주소)를 보여 준다 (onSuccess·화면 새로 읽기는 하지 않는다)
  createdHref?: (result: TResult) => string
}

// "브라우저에서 그리는 중인가" (서버·하이드레이션 중에는 false)
const noSubscribe = () => () => {}
const isBrowser = () => true
const isServer = () => false

// 기준정보 입력 화면의 공통 동작: 값·오류·변경 감지·취소·저장 (MasterFormPage와 함께 쓴다)
export function useMasterForm<TSchema extends z.ZodType, TResult = unknown>({
  initial,
  version: initialVersion = null,
  schema,
  save,
  afterSave,
  onSuccess,
  createdHref,
}: UseMasterFormOptions<TSchema, TResult>) {
  type Input = z.input<TSchema>
  const router = useRouter()
  const pathname = usePathname()
  // [계속 등록]으로 되돌아갈 빈 양식 (처음 받은 값)
  const [blank] = useState<Input>(initial)
  const [value, setValue] = useState<Input>(initial)
  // 등록을 마친 상태: 만든 항목의 주소 (null = 입력 중)
  const [created, setCreated] = useState<{ href: string } | null>(null)
  // [계속 등록]을 누른 횟수: 바뀔 때마다 MasterFormPage가 입력 칸을 새로 그리고 첫 칸에 초점
  const [resetCount, setResetCount] = useState(0)
  // 변경 감지 기준: 저장에 성공하면 새 값이 기준이 된다
  const [baseline, setBaseline] = useState<Input>(initial)
  const [version, setVersion] = useState<number | null>(initialVersion)
  const [errors, setErrors] = useState<FormErrors>({})
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  // 저장 시도 횟수: 바뀔 때마다 MasterFormPage가 첫 오류 칸으로 이동한다
  const [submitCount, setSubmitCount] = useState(0)
  const [pending, startTransition] = useTransition()

  const dirty = JSON.stringify(value) !== JSON.stringify(baseline)

  // ── 작성 중 내용 임시 보관 (0097): 다른 메뉴 탭에 다녀와도 이어서 쓴다 ──
  // 불러온 버전 (보관한 내용을 버릴 때 되돌릴 값)
  const [loadedVersion] = useState<number | null>(initialVersion)
  // 보관한 내용을 불러왔으면 안내 (stale = 그 사이 다른 사람이 이 자료를 고쳤다)
  const [restored, setRestored] = useState<{ stale: boolean } | null>(null)
  // 화면을 연 뒤 서랍을 한 번 확인했는지 (그 전에는 보관·비우기를 하지 않는다)
  const [draftChecked, setDraftChecked] = useState(false)
  // [나가기]로 버렸으면 더는 보관하지 않는다
  const dropped = useRef(false)
  // 마지막 보관이 성공했는지 (저장소를 못 쓰면 false → 떠날 때 예전처럼 묻는다)
  const kept = useRef(false)

  // 화면을 열 때: 이 주소에 보관한 작성 내용이 있으면 이어서 채운다
  // 저장소는 브라우저에만 있어서, 서버가 그린 화면과 맞춘 뒤(inBrowser) 그리는 중에 한 번 읽는다
  const inBrowser = useSyncExternalStore(noSubscribe, isBrowser, isServer)
  if (inBrowser && !draftChecked) {
    setDraftChecked(true)
    const draft = readDraft(pathname)
    if (draft) {
      setValue(draft.value as Input)
      // 작성을 시작할 때의 버전으로 저장해야, 그 사이 누가 고쳤으면 충돌로 막힌다
      setVersion(draft.version)
      setRestored({ stale: draft.version !== loadedVersion })
    }
  }

  // 바뀔 때마다: 변경이 있으면 보관, 없어지면(저장·취소·되돌리기) 비운다
  useEffect(() => {
    if (!draftChecked || dropped.current) return
    if (dirty && created === null) {
      kept.current = writeDraft(pathname, { value, version })
    } else {
      kept.current = false
      removeDraft(pathname)
    }
  }, [draftChecked, dirty, created, value, version, pathname])

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
    created,
    resetCount,
    // [계속 등록]: 빈 양식으로 되돌려 다음 항목을 입력한다
    startNext() {
      setValue(blank)
      setBaseline(blank)
      setVersion(null)
      setErrors({})
      setMessage(null)
      setCreated(null)
      setResetCount((n) => n + 1)
    },
    // [취소]: 처음 값(마지막 저장 값)으로 되돌린다
    cancel() {
      setValue(baseline)
      setErrors({})
      setMessage(null)
      if (restored) {
        // 보관했던 내용을 버린 것이므로 불러온 버전으로
        setVersion(loadedVersion)
        setRestored(null)
      }
    },
    // 보관한 작성 내용을 이어서 불러왔는지 (MasterFormPage가 안내를 띄운다)
    restored,
    // 떠날 때 작성 내용을 보관해 두었는지 (true면 다른 메뉴로 갈 때 묻지 않는다)
    keepsDraft() {
      return kept.current
    },
    // [나가기]: 작성 내용을 버리고 떠난다 → 보관한 것도 지운다
    dropDraft() {
      dropped.current = true
      kept.current = false
      removeDraft(pathname)
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
        setRestored(null)
        // 저장은 됐지만 알려 줄 것이 있으면 결과의 notice를 덧붙인다 (예: 할당 가능 창고 없음 경고)
        const notice = (result.data as { notice?: unknown } | null)?.notice
        const done = createdHref ? '등록했습니다.' : '저장했습니다.'
        setMessage({
          ok: true,
          text: typeof notice === 'string' && notice ? `${done} ${notice}` : done,
        })
        if (createdHref) {
          setCreated({ href: createdHref(result.data) })
          return
        }
        if (onSuccess) onSuccess(result.data)
        else router.refresh()
      })
    },
  }
}

// MasterFormPage가 쓰는 부분만 (값의 모양과 상관없이)
export type MasterFormState = Pick<
  ReturnType<typeof useMasterForm>,
  | 'errors'
  | 'message'
  | 'pending'
  | 'dirty'
  | 'submitCount'
  | 'cancel'
  | 'submit'
  | 'created'
  | 'resetCount'
  | 'startNext'
  | 'restored'
  | 'keepsDraft'
  | 'dropDraft'
>
