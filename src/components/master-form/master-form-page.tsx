'use client'

import { ArrowRightIcon, PlusIcon, RotateCcwIcon, SaveIcon } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { AppPage } from '@/components/app-page'
import { StatusBadge } from '@/components/common'
import type { PageHeaderProps } from '@/components/common/page-header'
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
  // 제목 오른쪽 (예: 추가 버튼)
  action?: React.ReactNode
  content: React.ReactNode
  // true면 "따로 처리하는 섹션": 자기 버튼으로 바로 처리하는 내용(계정 사용 중지, 요약 표 등)
  // 폼 밖에 그려 저장·변경 감지에서 빠지고, 폼 섹션들 뒤에 온다 (목차에는 함께, 제목 옆 "바로 적용")
  standalone?: boolean
}

// 헤더: 제목·설명·meta·보조 버튼 (저장·취소는 이 틀이 맨 오른쪽에 붙인다)
export type MasterFormHeader = Omit<PageHeaderProps, 'className'>

type MasterFormPageProps = {
  // useMasterForm의 반환값
  form: MasterFormState
  header: MasterFormHeader
  // 위에서 아래로 그릴 섹션 (새 섹션은 이 배열에 추가만 하면 목차에도 생긴다)
  sections: MasterFormSection[]
  // 수정 권한이 없으면 true: 저장·취소를 숨긴다 (입력 칸 잠금은 화면에서 disabled로)
  readOnly?: boolean
}

const sectionDomId = (id: string) => `section-${id}`
// 고정 헤더 아래로 맞추는 위치: 상단 바(3.5rem) + 메뉴 탭(2.5rem, 0069) + 페이지 헤더 높이 + 여유 1rem
const BELOW_HEADER = 'calc(6rem + var(--page-header-h, 0px) + 1rem)'

// 기준정보 입력 화면 틀 (docs/ui-guidelines.md "입력 화면", "페이지 틀")
// - AppPage(form): 헤더는 화면 전체 폭·고정, 왼쪽 목차 + 본문(최대 폭, 왼쪽 정렬)
// - 헤더 오른쪽: 보조 버튼 → 변경사항 있음 · [취소] · [저장] → [도움말] (스크롤해도 늘 보인다)
// - 섹션은 카드 대신 구분선, 저장 검사에 실패하면 첫 오류 칸으로, 저장하지 않고 떠나면 확인 창
export function MasterFormPage({
  form,
  header,
  sections: allSections,
  readOnly = false,
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
  const editable = !readOnly && formSections.length > 0

  // 지금 보는 섹션: 헤더 아래 위쪽 1/3 안에 들어온 섹션
  // 섹션 배열은 그릴 때마다 새로 만들어지므로 id 목록 글자로 비교한다 (매번 다시 관찰하지 않게)
  const sectionKey = sections.map((s) => s.id).join(',')
  useEffect(() => {
    const elements = sectionKey
      .split(',')
      .map((id) => document.getElementById(sectionDomId(id)))
      .filter((el): el is HTMLElement => el !== null)
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length === 0) return
        const id = visible[0].target.getAttribute('data-section-id')!
        setActiveId((current) => (current === id ? current : id))
      },
      { rootMargin: '-20% 0px -60% 0px' },
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [sectionKey])

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
    if (first.matches('input, button, textarea, [role="combobox"]')) {
      first.focus({ preventScroll: true })
    }
    // 저장 시도마다 한 번만 (오류 문구가 바뀔 때 다시 끌어당기지 않게)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.submitCount, form.errors])

  // [계속 등록] 뒤: 맨 위로 올리고 첫 입력 칸에 초점 (입력 칸은 key로 새로 그려져 비어 있다)
  useEffect(() => {
    if (form.resetCount === 0) return
    window.scrollTo({ top: 0 })
    formRef.current
      ?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [role="combobox"]:not([disabled])',
      )
      ?.focus()
  }, [form.resetCount])

  // 등록을 마친 상태: 결과 문구 · [등록한 항목 보기] · [계속 등록](주 버튼)
  const createdControls = editable && form.created && (
    <>
      {form.message && (
        <p role="status" className="text-sm text-success">
          {form.message.text}
        </p>
      )}
      <Button asChild variant="outline">
        <Link href={form.created.href}>
          <ArrowRightIcon />
          등록한 항목 보기
        </Link>
      </Button>
      <Button type="button" onClick={form.startNext}>
        <PlusIcon />
        계속 등록
      </Button>
    </>
  )

  // 헤더 오른쪽 저장 영역: 결과 문구 또는 "변경사항 있음" · [취소] · [저장](주 버튼, 맨 오른쪽)
  const saveControls =
    createdControls ||
    (editable && (
      <>
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
        {/* 헤더는 폼 밖에 있어서 form 속성으로 폼과 잇는다 */}
        <Button type="submit" form={formId} disabled={!form.dirty || form.pending}>
          <SaveIcon />
          {form.pending ? '저장 중…' : '저장'}
        </Button>
      </>
    ))

  const toc = (
    <nav aria-label="섹션 목차" className="sticky" style={{ top: BELOW_HEADER }}>
      <ul className="space-y-1 border-l text-sm">
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
                  <span aria-label="오류 있음" className="size-1.5 rounded-full bg-destructive" />
                )}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )

  return (
    <AppPage
      variant="form"
      {...header}
      actions={
        (header.actions || saveControls) && (
          <>
            {header.actions}
            {saveControls}
          </>
        )
      }
      aside={toc}
    >
      <form id={formId} ref={formRef} onSubmit={form.submit} noValidate>
        {/* 등록을 마치면 입력 칸을 잠근다(방금 등록한 값 확인용). [계속 등록]마다 key가 바뀌어 칸을 새로 그린다 */}
        <fieldset key={form.resetCount} disabled={form.created !== null} className="contents">
          {formSections.map((section, index) => renderSection(section, index))}
        </fieldset>
      </form>
      {standaloneSections.map((section, index) =>
        renderSection(section, formSections.length + index),
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
    </AppPage>
  )
}

// 섹션 하나: 카드 대신 위쪽 구분선(진하게, 첫 섹션은 선 없음) + 제목 앞 색 막대, 간격은 section 토큰
function renderSection(section: MasterFormSection, index: number) {
  return (
    <section
      key={section.id}
      id={sectionDomId(section.id)}
      data-section-id={section.id}
      aria-labelledby={`${sectionDomId(section.id)}-title`}
      style={{ scrollMarginTop: BELOW_HEADER }}
      className={cn('pb-section', index > 0 && 'border-t border-foreground/15 pt-section')}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span aria-hidden className="h-5 w-1 shrink-0 rounded-full bg-primary" />
            {/* 섹션 이름은 제목 글자만 ("바로 적용" 표시는 빼고) */}
            <span id={`${sectionDomId(section.id)}-title`}>{section.title}</span>
            {section.standalone && (
              <span className="rounded-sm border px-1.5 py-0.5 text-xs leading-none font-normal text-muted-foreground">
                바로 적용
              </span>
            )}
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
