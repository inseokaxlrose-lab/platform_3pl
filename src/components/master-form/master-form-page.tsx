'use client'

import { RotateCcwIcon, SaveIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { StatusBadge } from '@/components/common'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDirtyGuard } from './use-dirty-guard'
import type { MasterFormState } from './use-master-form'

export type MasterFormSection = {
  // 목차·이동용 id (영문, 예: 'basic')
  id: string
  title: string
  description?: React.ReactNode
  // 제목 오른쪽 (예: 안내 배지)
  action?: React.ReactNode
  content: React.ReactNode
  // true면 "따로 처리하는 섹션": 자기 버튼으로 바로 처리하는 내용(계정 사용 중지, 요약 표 등)
  // 폼 밖에 그려 저장 막대·변경 감지에서 빠지고, 폼 섹션들 뒤에 온다 (목차에는 함께)
  standalone?: boolean
}

type MasterFormPageProps = {
  // useMasterForm의 반환값
  form: MasterFormState
  // 위에서 아래로 그릴 섹션 (새 섹션은 이 배열에 추가만 하면 목차에도 생긴다)
  sections: MasterFormSection[]
  // 수정 권한이 없으면 true: 저장 막대를 숨긴다 (입력 칸 잠금은 화면에서 disabled로)
  readOnly?: boolean
  // 저장 막대 왼쪽에 함께 보여줄 정보 (예: 마지막 수정)
  meta?: React.ReactNode
}

const sectionDomId = (id: string) => `section-${id}`

// 기준정보 입력 화면 틀 (docs/ui-guidelines.md)
// - 본문은 제한 폭(max-w-5xl)으로 가운데, 넓은 화면에서는 왼쪽에 섹션 목차(지금 보는 섹션·오류 섹션 표시)
// - 섹션은 카드 대신 구분선으로 나눈다 (테두리 중첩 금지)
// - 아래 고정 저장 막대: 변경사항 있음 · [취소] · [저장]. 변경이 없으면 둘 다 꺼진다
// - 저장 검사에 실패하면 첫 오류 칸으로 스크롤·초점, 저장하지 않은 채 떠나려 하면 확인 창
export function MasterFormPage({
  form,
  sections: allSections,
  readOnly = false,
  meta,
}: MasterFormPageProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const formId = useId()
  // 폼 섹션 먼저, 따로 처리하는 섹션은 뒤로 (폼 안에 다른 폼이 들어가지 않게 폼 밖에 그린다)
  const formSections = allSections.filter((s) => !s.standalone)
  const standaloneSections = allSections.filter((s) => s.standalone)
  const sections = [...formSections, ...standaloneSections]
  const [activeId, setActiveId] = useState(sections[0]?.id)
  const [errorSectionIds, setErrorSectionIds] = useState<string[]>([])
  const guard = useDirtyGuard(form.dirty && !readOnly)

  // 지금 보는 섹션: 화면 위쪽 1/3 안에 들어온 섹션
  useEffect(() => {
    const elements = sections
      .map((s) => document.getElementById(sectionDomId(s.id)))
      .filter((el): el is HTMLElement => el !== null)
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) setActiveId(visible[0].target.getAttribute('data-section-id')!)
      },
      { rootMargin: '0px 0px -66% 0px' },
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [sections])

  // 오류가 있는 섹션 (목차에 빨간 점), 저장을 누를 때마다 첫 오류 칸으로 이동
  useEffect(() => {
    const root = formRef.current
    if (!root) return
    const invalid = (el: Element) => el.querySelector('[aria-invalid="true"], [role="alert"]')
    // 폼 섹션만 본다 (따로 처리하는 섹션의 안내 문구는 저장 오류가 아님)
    setErrorSectionIds(
      formSections
        .map((s) => s.id)
        .filter((id) => {
          const el = document.getElementById(sectionDomId(id))
          return el !== null && invalid(el) !== null
        }),
    )
    if (form.submitCount === 0 || Object.keys(form.errors).length === 0) return
    const first = root.querySelector<HTMLElement>('[aria-invalid="true"], section [role="alert"]')
    if (!first) return
    first.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // 입력 칸이면 초점까지 (표 전체 오류 문구처럼 칸이 아니면 스크롤만)
    if (first.matches('input, button, textarea, [role="combobox"]'))
      first.focus({ preventScroll: true })
    // 저장 시도마다 한 번만 (오류 문구가 바뀔 때 다시 끌어당기지 않게)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.submitCount, form.errors])

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="섹션 목차" className="hidden lg:block">
          <ul className="sticky top-20 space-y-1 border-l text-sm">
            {sections.map((s) => {
              const hasError = errorSectionIds.includes(s.id)
              return (
                <li key={s.id}>
                  <a
                    href={`#${sectionDomId(s.id)}`}
                    aria-current={activeId === s.id ? 'true' : undefined}
                    className={cn(
                      '-ml-px flex items-center gap-2 border-l-2 border-transparent py-1 pl-3 text-muted-foreground hover:text-foreground',
                      activeId === s.id && 'border-primary font-medium text-foreground',
                      hasError && 'text-destructive hover:text-destructive',
                    )}
                    onClick={(event) => {
                      event.preventDefault()
                      document
                        .getElementById(sectionDomId(s.id))
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      setActiveId(s.id)
                    }}
                  >
                    {s.title}
                    {hasError && (
                      <span
                        aria-label="오류 있음"
                        className="size-1.5 rounded-full bg-destructive"
                      />
                    )}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          <form id={formId} ref={formRef} onSubmit={form.submit} noValidate>
            {formSections.map((section, index) => renderSection(section, index))}
          </form>
          {standaloneSections.map((section, index) =>
            renderSection(section, formSections.length + index),
          )}
        </div>
      </div>

      {!readOnly && formSections.length > 0 && (
        <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="mr-auto flex items-center gap-3 text-xs text-muted-foreground">
            {meta}
          </div>
          {form.message ? (
            <p
              role={form.message.ok ? 'status' : 'alert'}
              className={cn('text-sm', form.message.ok ? 'text-success' : 'text-destructive')}
            >
              {form.message.text}
            </p>
          ) : (
            form.dirty && <StatusBadge tone="warning">변경사항 있음</StatusBadge>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={!form.dirty || form.pending}
            onClick={form.cancel}
          >
            <RotateCcwIcon />
            취소
          </Button>
          {/* 저장 막대는 폼 밖에 있어서 form 속성으로 폼과 잇는다 */}
          <Button type="submit" form={formId} disabled={!form.dirty || form.pending}>
            <SaveIcon />
            {form.pending ? '저장 중…' : '저장'}
          </Button>
        </div>
      )}

      <AlertDialog open={guard.pendingHref !== null} onOpenChange={(open) => !open && guard.stay()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>저장하지 않은 변경사항이 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              이 화면을 떠나면 입력한 내용이 사라집니다. 그래도 나갈까요?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>계속 작성</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={guard.leave}>
              나가기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// 섹션 하나: 카드 대신 위쪽 구분선 (첫 섹션은 선 없음)
function renderSection(section: MasterFormSection, index: number) {
  return (
    <section
      key={section.id}
      id={sectionDomId(section.id)}
      data-section-id={section.id}
      aria-labelledby={`${sectionDomId(section.id)}-title`}
      className={cn('scroll-mt-20 pb-8', index > 0 && 'border-t pt-8')}
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id={`${sectionDomId(section.id)}-title`} className="text-base font-semibold">
            {section.title}
          </h2>
          {section.description && (
            <p className="text-sm text-muted-foreground">{section.description}</p>
          )}
        </div>
        {section.action}
      </div>
      {section.content}
    </section>
  )
}
