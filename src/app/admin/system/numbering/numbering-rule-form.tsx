'use client'

import { InfoIcon, RotateCcwIcon, TriangleAlertIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ConfirmDialog, StatusBadge } from '@/components/common'
import { NumberInput } from '@/components/inputs'
import {
  Field,
  FormGrid,
  MasterFormPage,
  useMasterForm,
  type MasterFormHeader,
  type MasterFormSection,
} from '@/components/master-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { unwrap } from '@/lib/actions'
import {
  NUMBERING_SCOPE,
  PREFIX_SOURCE,
  previewCode,
  RESET_CYCLE,
  type NumberingRuleSpec,
} from '@/lib/numbering/numbering-codes'
import {
  numberingRuleIssues,
  numberingRuleSchema,
  type NumberingRuleInput,
} from '@/lib/numbering/numbering-rule-schema'
import { resetNumberingRuleAction, saveNumberingRuleAction } from './actions'

export type NumberingRuleForEdit = {
  target: NumberingRuleSpec['target']
  targetLabel: string
  rule: NumberingRuleSpec
  system: NumberingRuleSpec
  overridden: boolean
  rowVersion: number | null
  sample: { prefix: string; prefixNote: string; nextByCycle: Record<string, string> }
  issued: boolean
  timeZone: string
}

const SEPARATOR_LABEL: Record<string, string> = { '': '없음', '-': '하이픈 (-)', _: '밑줄 (_)' }

// 규칙 → 입력값 (빈 칸은 빈 글자)
export const toRuleInput = (rule: NumberingRuleSpec): NumberingRuleInput => ({
  target: rule.target,
  fixedPrefix: rule.fixedPrefix ?? '',
  typeChar: rule.typeChar ?? '',
  separator: (rule.separator ?? '') as NumberingRuleInput['separator'],
  dateFormat: rule.dateFormat as NumberingRuleInput['dateFormat'],
  seqLength: rule.seqLength,
  resetCycle: rule.resetCycle as NumberingRuleInput['resetCycle'],
})

// 입력값 → 규칙 (구조 칸은 지금 규칙에서) — 미리보기용
const toSpec = (base: NumberingRuleSpec, value: NumberingRuleInput): NumberingRuleSpec => ({
  ...base,
  fixedPrefix: base.prefixSource === 'FIXED' ? value.fixedPrefix.toUpperCase() : null,
  typeChar: value.typeChar.toUpperCase() || null,
  separator: value.separator || null,
  dateFormat: value.dateFormat,
  seqLength: value.seqLength,
  resetCycle: value.resetCycle,
})

// 번호 모양 글자: {화주 접두어}S000000
const formatText = (rule: NumberingRuleSpec) =>
  (rule.prefixSource === 'FIXED'
    ? (rule.fixedPrefix ?? '')
    : rule.prefixSource === 'SHIPPER_PREFIX'
      ? '{화주 접두어}'
      : '{거래처코드}') +
  (rule.typeChar ?? '') +
  (rule.dateFormat === 'YYMMDD' ? 'YYMMDD' : '') +
  (rule.separator ?? '') +
  '0'.repeat(rule.seqLength)

// 체번 규칙 수정 (docs/decisions/0085): 모양 칸만 바꾼다 — 번호 범위·접두어 출처는 시스템이 정한 구조
// 저장하면 이 운영사 규칙이 시스템 기본보다 우선한다. 저장 전에 서버가 기존 코드와 겹치는지 검사한다
export function NumberingRuleForm({
  header,
  numbering,
  readOnly,
}: {
  header: MasterFormHeader
  numbering: NumberingRuleForEdit
  readOnly: boolean
}) {
  const router = useRouter()
  const form = useMasterForm({
    initial: toRuleInput(numbering.rule),
    version: numbering.rowVersion,
    schema: numberingRuleSchema,
    save: (value: NumberingRuleInput, version) =>
      saveNumberingRuleAction({ ...value, rowVersion: version }),
    // 처음 저장하면 운영사 규칙이 생긴다 → 화면을 다시 읽어 배지·되돌리기 버튼을 맞춘다
    onSuccess: () => router.refresh(),
  })
  const { value, set, errors } = form
  const disabled = readOnly || form.pending
  const id = (key: string) => `numbering-${key}`
  const base = numbering.rule
  const fixed = base.prefixSource === 'FIXED'
  const draft = toSpec(base, value)
  // 화면에서 먼저 보이는 구조 검사 (접두어 모양·코드 칸 길이)
  const issues = numberingRuleIssues(
    {
      target: numbering.target,
      fixedPrefix: draft.fixedPrefix ?? '',
      typeChar: value.typeChar,
      separator: value.separator,
      dateFormat: value.dateFormat,
      seqLength: value.seqLength,
    },
    base.prefixSource as 'FIXED' | 'SHIPPER_PREFIX' | 'PARENT_CD',
  )
  const issueOf = (path: string) => issues.find((i) => i.path === path)?.message
  const preview = previewCode(
    draft,
    numbering.sample.prefix,
    numbering.sample.nextByCycle,
    new Date(),
    numbering.timeZone,
  )
  const changedFromSaved = formatText(draft) !== formatText(base)

  const select = <K extends 'separator' | 'dateFormat' | 'resetCycle'>(
    key: K,
    label: string,
    options: Record<string, string>,
    hint?: string,
  ) => (
    <Field label={label} span={4} error={errors[key]} htmlFor={id(key)} hint={hint}>
      <Select
        value={value[key] === '' ? 'NONE_SEP' : value[key]}
        onValueChange={(v) =>
          set({ [key]: v === 'NONE_SEP' ? '' : v } as Partial<NumberingRuleInput>)
        }
        disabled={disabled}
      >
        <SelectTrigger id={id(key)} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([v, text]) => (
            <SelectItem key={v} value={v === '' ? 'NONE_SEP' : v}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )

  const sections: MasterFormSection[] = [
    {
      id: 'shape',
      title: '번호 모양',
      description:
        '접두어 + 구분 문자 + 날짜 + 구분자 + 일련번호 순서로 붙습니다. 번호 범위와 접두어 출처는 대상마다 정해져 있어 바꿀 수 없습니다.',
      content: (
        <FormGrid>
          <Field label="번호 범위" span={4} hint="이 범위 안에서 번호가 하나씩 늘어납니다">
            <Input
              value={NUMBERING_SCOPE.labels[base.scope as keyof typeof NUMBERING_SCOPE.labels]}
              disabled
            />
          </Field>
          <Field
            label="접두어"
            span={4}
            required={fixed}
            error={errors.fixedPrefix ?? issueOf('fixedPrefix')}
            htmlFor={id('fixedPrefix')}
            hint={
              fixed
                ? '영문 대문자 1~5자'
                : PREFIX_SOURCE.labels[base.prefixSource as keyof typeof PREFIX_SOURCE.labels]
            }
          >
            <Input
              id={id('fixedPrefix')}
              value={
                fixed
                  ? value.fixedPrefix
                  : base.prefixSource === 'SHIPPER_PREFIX'
                    ? '화주 코드 접두어'
                    : '거래처코드'
              }
              onChange={(e) => set({ fixedPrefix: e.target.value.toUpperCase() })}
              disabled={disabled || !fixed}
              maxLength={5}
            />
          </Field>
          <Field
            label="구분 문자"
            span={4}
            error={errors.typeChar}
            htmlFor={id('typeChar')}
            hint="영문 대문자 1자 (비우면 없음)"
          >
            <Input
              id={id('typeChar')}
              value={value.typeChar}
              onChange={(e) => set({ typeChar: e.target.value.toUpperCase() })}
              disabled={disabled}
              maxLength={1}
            />
          </Field>
          {select('dateFormat', '날짜', { NONE: '없음', YYMMDD: 'YYMMDD (등록일)' })}
          {select('separator', '구분자', SEPARATOR_LABEL, '날짜와 일련번호 사이')}
          <Field
            label="일련번호 자리수"
            span={4}
            required
            error={errors.seqLength ?? issueOf('seqLength')}
            htmlFor={id('seqLength')}
            hint="2~8 (자리수를 넘으면 길어집니다)"
          >
            <NumberInput
              id={id('seqLength')}
              value={value.seqLength}
              onChange={(n) => set({ seqLength: n ?? 2 })}
              min={2}
              max={8}
              disabled={disabled}
            />
          </Field>
          {select(
            'resetCycle',
            '일련번호 초기화',
            RESET_CYCLE.labels,
            '초기화하려면 날짜가 있어야 합니다',
          )}
        </FormGrid>
      ),
    },
    {
      id: 'preview',
      title: '미리보기',
      content: (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-[8rem_1fr] gap-y-2">
            <dt className="text-muted-foreground">다음 번호</dt>
            <dd>
              <span className="font-mono text-base font-semibold">{preview}</span>
              {numbering.sample.prefixNote && !fixed && (
                <span className="ml-2 text-xs text-muted-foreground">
                  ({numbering.sample.prefixNote})
                </span>
              )}
            </dd>
            <dt className="text-muted-foreground">번호 모양</dt>
            <dd className="font-mono">{formatText(draft)}</dd>
            <dt className="text-muted-foreground">시스템 기본</dt>
            <dd className="font-mono">{formatText(numbering.system)}</dd>
          </dl>
          {numbering.issued && changedFromSaved && (
            <p className="flex items-start gap-1.5 rounded-md bg-warning/10 px-3 py-2 text-warning">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
              이미 이 대상으로 발급한 번호가 있습니다. 저장하면 앞으로 붙는 번호만 새 모양이 되고,
              예전 번호는 그대로 남습니다. 일련번호는 이어집니다.
            </p>
          )}
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <InfoIcon className="mt-0.5 size-4 shrink-0" />
            저장할 때 새 모양의 번호가 이미 있는 코드(직접 넣은 코드 등)와 겹치는지 확인하고, 겹치면
            저장하지 않습니다.
          </p>
        </div>
      ),
    },
  ]

  return (
    <MasterFormPage
      header={{
        ...header,
        meta: (
          <StatusBadge tone={numbering.overridden ? 'info' : 'neutral'}>
            {numbering.overridden ? '운영사 규칙' : '시스템 기본'}
          </StatusBadge>
        ),
        actions: (
          <>
            {header.actions}
            {!readOnly && numbering.overridden && numbering.rowVersion !== null && (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="outline">
                    <RotateCcwIcon />
                    기본으로 되돌리기
                  </Button>
                }
                title={`${numbering.targetLabel} 번호를 시스템 기본 모양으로 되돌릴까요?`}
                description={`앞으로 붙는 번호가 ${formatText(numbering.system)} 모양이 됩니다. 이미 붙은 번호는 그대로이고 일련번호는 이어집니다.`}
                confirmLabel="되돌리기"
                onConfirm={async () => {
                  unwrap(
                    await resetNumberingRuleAction({
                      target: numbering.target,
                      rowVersion: numbering.rowVersion!,
                    }),
                  )
                  router.refresh()
                }}
              />
            )}
          </>
        ),
      }}
      form={form}
      readOnly={readOnly}
      sections={sections}
    />
  )
}
