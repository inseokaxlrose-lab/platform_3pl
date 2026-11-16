'use client'

import { useState, useTransition } from 'react'
import { Field, FormGrid } from '@/components/master-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { EXTERNAL_SYSTEMS, EXTERNAL_SYSTEM_KEYS } from '@/config/external-systems'
import { EMPTY_EXTERNAL_CODES, type ExternalCodes } from '@/lib/master-code/external-codes-schema'
import {
  EXTERNAL_TARGET_LABELS,
  type ExternalTarget,
} from '@/lib/master-code/external-code-targets'
import { saveExternalCodesAction } from './actions'

// 목록 한 줄 (대상 + 외부코드)
export type ExternalCodeRow = {
  id: string
  code: string
  name: string
  owner: string | null
  isActive: boolean
  externalCodes: ExternalCodes
  mappedCount: number
}

// 한 대상의 외부코드 수정 팝업 (docs/decisions/0068): 연동 상대마다 한 칸, 비우면 매핑 삭제
export function ExternalCodeDialog({
  target,
  row,
  onOpenChange,
  readOnly,
  onSaved,
}: {
  target: ExternalTarget
  // 없으면 닫힘
  row: ExternalCodeRow | null
  onOpenChange: (open: boolean) => void
  readOnly: boolean
  onSaved: () => void
}) {
  const [value, setValue] = useState<ExternalCodes>(EMPTY_EXTERNAL_CODES)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // 팝업을 열 때마다 그 대상의 값으로 다시 채운다
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  const key = row ? `${target}:${row.id}` : null
  if (key !== openedFor) {
    setOpenedFor(key)
    if (row) {
      setValue({ ...EMPTY_EXTERNAL_CODES, ...row.externalCodes })
      setErrors({})
      setMessage(null)
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!row) return
    startTransition(async () => {
      const result = await saveExternalCodesAction({ target, id: row.id, codes: value })
      if (!result.ok) {
        const fieldErrors = result.error.fieldErrors ?? {}
        setErrors(
          Object.fromEntries(
            Object.entries(fieldErrors).map(([k, v]) => [k.replace(/^codes\./, ''), v[0]]),
          ),
        )
        setMessage(
          Object.keys(fieldErrors).length > 0 ? '입력값을 확인해 주세요.' : result.error.message,
        )
        return
      }
      onOpenChange(false)
      onSaved()
    })
  }

  const disabled = readOnly || pending
  const id = (system: string) => `external-code-${system}`
  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {EXTERNAL_TARGET_LABELS[target]} 외부코드 — {row?.name}
            </DialogTitle>
            <DialogDescription>
              {row?.code}
              {row?.owner && ` · ${row.owner}`} — 연동하지 않는 곳은 비워 두세요 (비우면 매핑이
              지워집니다).
            </DialogDescription>
          </DialogHeader>

          <FormGrid>
            {EXTERNAL_SYSTEM_KEYS.map((system) => (
              <Field
                key={system}
                span={6}
                label={`${EXTERNAL_SYSTEMS[system].label} 코드`}
                error={errors[system]}
                htmlFor={id(system)}
              >
                <Input
                  id={id(system)}
                  value={value[system]}
                  onChange={(e) => setValue((v) => ({ ...v, [system]: e.target.value }))}
                  disabled={disabled}
                  aria-invalid={Boolean(errors[system])}
                />
              </Field>
            ))}
          </FormGrid>

          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {readOnly ? '닫기' : '취소'}
            </Button>
            {!readOnly && (
              <Button type="submit" disabled={pending}>
                {pending ? '저장 중…' : '저장'}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
