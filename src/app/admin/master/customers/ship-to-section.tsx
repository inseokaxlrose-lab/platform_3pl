'use client'

import { PlusIcon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import {
  ADDR_GRADE_TONE,
  CENTER_ASSIGN_STATUS_BADGE,
  CENTER_ASSIGN_TYPE,
  CENTER_CONFIRM_REASON,
} from '@/lib/customers/customer-codes'
import type { ShipToInfo } from '@/lib/customers/customer-queries'
import { EMPTY_SHIP_TO, type ShipToInput } from '@/lib/customers/customer-schema'
import { ShipToSheet } from './ship-to-sheet'

type Center = { id: string; code: string; name: string }

// 거래처 편집 화면의 "납품처" 섹션 (0082): 표 + 드로어 편집
// - 기본(라디오) · 코드 · 이름 · 주소(시군구+주소) · 정제 등급 · 배송센터 · 지정 구분 · 지정 상태 · 권역 불일치 · 상태
// - 기본 납품처·마지막 사용 중 납품처는 뺄 수 없다 (이유는 버튼에 마우스를 올리면)
// - 신규 거래처에 납품처가 없으면 저장할 때 거래처 주소로 기본 납품처를 만든다
export function ShipToSection({
  rows,
  info,
  onChange,
  shipperId,
  centers,
  customerAddress,
  isNewCustomer,
  disabled,
  error,
}: {
  rows: ShipToInput[]
  info: ShipToInfo[]
  onChange: (rows: ShipToInput[]) => void
  shipperId: string
  centers: Center[]
  customerAddress: string
  isNewCustomer: boolean
  disabled: boolean
  error?: string
}) {
  // 편집 중인 줄 (-1 = 새 납품처)
  const [editing, setEditing] = useState<number | null>(null)
  const infoOf = (row: ShipToInput) => (row.id ? info.find((i) => i.id === row.id) : undefined)
  const activeCount = rows.filter((r) => r.status === 'ACTIVE').length

  const removeBlocked = (index: number) => {
    const row = rows[index]
    if (row.isDefault) return '기본 납품처는 뺄 수 없습니다. 다른 납품처를 먼저 기본으로 정하세요.'
    if (row.status === 'ACTIVE' && activeCount <= 1)
      return '사용 중인 납품처가 1곳 이상 있어야 합니다.'
    return null
  }
  // 기본 바꾸기: 고른 줄만 기본 (사용 중인 납품처만)
  const setDefault = (index: number) =>
    onChange(
      rows.map((r, i) => ({
        ...r,
        isDefault: i === index,
        addrSync: i === index ? r.addrSync : false,
      })),
    )

  const editingRow =
    editing === null
      ? null
      : editing === -1
        ? { ...EMPTY_SHIP_TO, isDefault: rows.length === 0, centerMode: 'AUTO' as const }
        : rows[editing]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {rows.length}곳 · 기본 납품처 1곳과 사용 중 1곳 이상이 필요합니다. 주문에 납품처가 없으면
          기본 납품처로 갑니다.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setEditing(-1)}
          disabled={disabled}
        >
          <PlusIcon />
          납품처 추가
        </Button>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          {isNewCustomer
            ? '저장하면 거래처 주소로 기본 납품처가 만들어집니다. 납품처를 직접 넣으려면 [납품처 추가]를 누르세요.'
            : '납품처가 없습니다.'}
        </p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {rows.map((row, index) => {
            const saved = infoOf(row)
            const status = saved?.centerAssignStatus
            const badge = status ? CENTER_ASSIGN_STATUS_BADGE[status] : null
            return (
              <li
                key={row.id || `new-${index}`}
                className="flex flex-wrap items-start gap-3 px-3 py-2.5"
              >
                <input
                  type="radio"
                  name="ship-to-default"
                  aria-label={`${row.code} 기본 납품처`}
                  className="mt-1 size-4 accent-primary"
                  checked={row.isDefault}
                  disabled={disabled || row.status !== 'ACTIVE'}
                  onChange={() => setDefault(index)}
                />
                <button
                  type="button"
                  className="min-w-0 flex-1 space-y-1 text-left"
                  onClick={() => setEditing(index)}
                >
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-primary hover:underline">
                      {row.code || '(저장하면 자동 코드)'}
                    </span>
                    <span>{row.name}</span>
                    {row.isDefault && <StatusBadge tone="info">기본</StatusBadge>}
                    {saved?.systemCreated && row.addrSync && (
                      <StatusBadge tone="neutral">거래처 주소 연동</StatusBadge>
                    )}
                    {row.status !== 'ACTIVE' && <StatusBadge tone="neutral">사용 중지</StatusBadge>}
                    {!row.id && <StatusBadge tone="warning">저장 전</StatusBadge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.isDefault && row.addrSync
                      ? `거래처 주소: ${customerAddress || '-'}`
                      : [saved?.sigunguName, saved?.address ?? row.address]
                          .filter(Boolean)
                          .join(' · ')}
                    {saved && (
                      <>
                        {' '}
                        · 정제 등급{' '}
                        <span className={ADDR_GRADE_TONE[saved.addressGrade] ?? ''}>
                          {saved.addressGrade}
                        </span>
                      </>
                    )}
                  </p>
                  {saved && (
                    <p className="flex flex-wrap items-center gap-2 text-xs">
                      <span>배송센터 {saved.deliveryCenter ?? '-'}</span>
                      {saved.centerAssignType && (
                        <span className="text-muted-foreground">
                          (
                          {CENTER_ASSIGN_TYPE.labels[
                            saved.centerAssignType as keyof typeof CENTER_ASSIGN_TYPE.labels
                          ] ?? saved.centerAssignType}
                          )
                        </span>
                      )}
                      {badge && <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>}
                      {saved.centerConfirmReason && (
                        <span className="text-warning">
                          {CENTER_CONFIRM_REASON.labels[
                            saved.centerConfirmReason as keyof typeof CENTER_CONFIRM_REASON.labels
                          ] ?? saved.centerConfirmReason}
                        </span>
                      )}
                      {saved.regionMismatch && (
                        <span className="flex items-center gap-1 text-warning">
                          <TriangleAlertIcon className="size-3.5" />
                          권역 불일치 (권역 기준 {saved.regionCenter ?? '-'})
                        </span>
                      )}
                    </p>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {editingRow && (
        <ShipToSheet
          open
          row={editingRow}
          isNew={editing === -1}
          shipperId={shipperId}
          centers={centers}
          customerAddress={customerAddress}
          removeBlocked={editing !== null && editing >= 0 ? removeBlocked(editing) : null}
          existingCodes={rows.filter((_, i) => i !== editing).map((r) => r.code.toUpperCase())}
          assigned={(() => {
            const found = infoOf(editingRow)
            return found ? { centerId: found.deliveryCenterId, zipCode: found.zipCode } : undefined
          })()}
          disabled={disabled}
          onApply={(next) => {
            const list =
              editing === -1 ? [...rows, next] : rows.map((r, i) => (i === editing ? next : r))
            // 기본으로 표시했으면 나머지는 기본 해제
            const defaultIndex = editing === -1 ? list.length - 1 : editing!
            onChange(
              next.isDefault ? list.map((r, i) => ({ ...r, isDefault: i === defaultIndex })) : list,
            )
            setEditing(null)
          }}
          onRemove={() => {
            onChange(rows.filter((_, i) => i !== editing))
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
