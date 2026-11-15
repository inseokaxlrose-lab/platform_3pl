'use client'

import { MapPinIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { loadKakaoPostcode, toAddress } from './kakao-postcode'

export type AddressValue = { zipCode: string; address: string; addressDetail: string }

type AddressInputProps = {
  // 저장 형식 그대로 (운영사·센터 등 기존 API 칸 이름 유지)
  value: AddressValue
  onChange: (value: AddressValue) => void
  disabled?: boolean
  errors?: Partial<Record<keyof AddressValue, string>>
  // 입력칸 id 앞부분 (한 화면에 주소가 여러 개일 때 구분). 기본주소 칸 id = `${idPrefix}-address`
  idPrefix?: string // 주소 검색으로 고르면 지번주소를 알려 준다 (지번주소를 따로 저장하는 화면만, 예: 운영사 addr_jibun)
  // 직접 입력으로 주소를 바꾸면 빈 글자를 알려 준다 (검색 결과와 어긋나지 않게)
  onJibunAddress?: (jibunAddress: string) => void
}

// 주소 입력 (권장 span 12): [우편번호][주소 검색] 한 줄 → 기본주소 → 상세주소 (docs/decisions/0024)
// 카카오 우편번호로 우편번호·기본주소를 채우고, 상세주소만 직접 입력한다
// 검색 서비스를 불러오지 못하면 우편번호·주소도 직접 입력할 수 있게 연다
export function AddressInput({
  value,
  onChange,
  disabled,
  errors = {},
  idPrefix = 'address',
  onJibunAddress,
}: AddressInputProps) {
  const [open, setOpen] = useState(false)
  const [manual, setManual] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const detailInput = useRef<HTMLInputElement>(null)
  // 주소를 골라서 닫혔는지 (그렇다면 닫힐 때 초점을 상세주소로)
  const selected = useRef(false)
  const set = (patch: Partial<AddressValue>) => onChange({ ...value, ...patch })
  const error = errors.zipCode ?? errors.address ?? errors.addressDetail ?? loadError

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Input
          id={`${idPrefix}-zip`}
          aria-label="우편번호"
          className="w-28"
          value={value.zipCode}
          readOnly={!manual}
          disabled={disabled}
          inputMode="numeric"
          placeholder="우편번호"
          aria-invalid={Boolean(errors.zipCode)}
          onChange={(e) => set({ zipCode: e.target.value })}
        />
        {!disabled && (
          <Button type="button" variant="outline" onClick={() => setOpen(true)}>
            <MapPinIcon />
            주소 검색
          </Button>
        )}
      </div>
      <Input
        id={`${idPrefix}-address`}
        aria-label="주소"
        value={value.address}
        readOnly={!manual}
        disabled={disabled}
        placeholder={manual ? '주소를 직접 입력하세요' : '[주소 검색]으로 입력합니다'}
        aria-invalid={Boolean(errors.address)}
        onChange={(e) => {
          set({ address: e.target.value })
          onJibunAddress?.('')
        }}
      />
      <Input
        ref={detailInput}
        id={`${idPrefix}-detail`}
        aria-label="상세주소"
        value={value.addressDetail}
        disabled={disabled}
        placeholder="상세주소 (동·층·호수 등)"
        aria-invalid={Boolean(errors.addressDetail)}
        onChange={(e) => set({ addressDetail: e.target.value })}
      />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-lg"
          onCloseAutoFocus={(event) => {
            // 기본 동작(검색 버튼으로 초점 복귀) 대신 상세주소 입력으로
            if (!selected.current) return
            selected.current = false
            event.preventDefault()
            detailInput.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>주소 검색</DialogTitle>
            <DialogDescription>도로명·건물명·지번으로 검색하고 결과를 고르세요.</DialogDescription>
          </DialogHeader>
          {open && (
            <PostcodeEmbed
              onSelect={({ jibunAddress, ...found }) => {
                set({ ...found, addressDetail: value.addressDetail })
                onJibunAddress?.(jibunAddress)
                selected.current = true
                setOpen(false)
              }}
              onError={() => {
                setOpen(false)
                setManual(true)
                setLoadError(
                  '주소 검색 서비스를 불러오지 못했습니다. 우편번호와 주소를 직접 입력해 주세요.',
                )
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// 카카오 우편번호 검색 화면을 상자 안에 넣는다 (팝업 창 차단 걱정 없음)
function PostcodeEmbed({
  onSelect,
  onError,
}: {
  onSelect: (value: { zipCode: string; address: string; jibunAddress: string }) => void
  onError: () => void
}) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    loadKakaoPostcode()
      .then((Postcode) => {
        if (cancelled || !box.current) return
        new Postcode({
          oncomplete: (data) => onSelect(toAddress(data)),
          width: '100%',
          height: '100%',
        }).embed(box.current, { autoClose: false })
      })
      .catch(() => !cancelled && onError())
    return () => {
      cancelled = true
    }
    // 열릴 때 한 번만 붙인다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={box} className="h-[28rem] w-full overflow-hidden rounded-md border" />
}
