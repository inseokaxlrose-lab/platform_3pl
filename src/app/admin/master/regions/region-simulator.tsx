'use client'

import { useState, useTransition } from 'react'
import { StatusBadge, type StatusTone } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ADDR_GRADE, ADDR_NORM_METHOD } from '@/lib/regions/region-codes'
import { simulateRegionAction } from './actions'

// 권역 시뮬레이터 탭: 주소·우편번호 → 정제 등급·결과 → 결정된 센터·결정 기준 (저장하지 않는다)

type Simulation = Extract<Awaited<ReturnType<typeof simulateRegionAction>>, { ok: true }>['data']

const GRADE_TONE: Record<string, StatusTone> = {
  A: 'success',
  B: 'success',
  C: 'info',
  D: 'warning',
  F: 'danger',
}
const LEVEL_LABEL: Record<string, string> = { ZIP: '우편번호', BJD: '법정동', SIGUNGU: '시군구' }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children ?? '—'}</dd>
    </div>
  )
}

export function RegionSimulator({ tempZone }: { tempZone: string }) {
  const [address, setAddress] = useState('')
  const [zipCode, setZipCode] = useState('')
  const [result, setResult] = useState<Simulation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const run = (event: React.FormEvent) => {
    event.preventDefault()
    startTransition(async () => {
      const response = await simulateRegionAction({
        address,
        zipCode: zipCode || undefined,
        tempZone,
      })
      if (response.ok) {
        setResult(response.data)
        setError(null)
      } else {
        setResult(null)
        setError(response.error.message)
      }
    })
  }

  const norm = result?.norm
  const res = result?.resolution
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_1fr]">
      <form onSubmit={run} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="sim-address">주소</Label>
          <Input
            id="sim-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="예: 경기 수원시 권선구 호매실로 10 101동 202호"
            maxLength={300}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sim-zip">원본 우편번호 (선택)</Label>
          <Input
            id="sim-zip"
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            placeholder="5자리 또는 6자리"
            maxLength={10}
            className="w-40"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          위 온도대 선택({tempZone === 'ALL' ? '전체' : '온도대별'})으로 결정합니다. 저장하지
          않습니다.
        </p>
        <Button type="submit" disabled={pending || (!address.trim() && !zipCode.trim())}>
          {pending ? '확인 중…' : '결정해 보기'}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </form>

      {norm && res && (
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">주소 정제</h3>
            <dl>
              <Row label="등급">
                <StatusBadge tone={GRADE_TONE[norm.grade]}>
                  {norm.grade} {ADDR_GRADE.labels[norm.grade]}
                </StatusBadge>
              </Row>
              <Row label="방법">
                {ADDR_NORM_METHOD.labels[norm.method]}
                {norm.method === 'CACHE' &&
                  ` (처음: ${ADDR_NORM_METHOD.labels[norm.sourceMethod]})`}
              </Row>
              <Row label="우편번호">
                {norm.zipCode}
                {norm.zipMismatch && (
                  <StatusBadge tone="warning" className="ml-2">
                    입력과 다름
                  </StatusBadge>
                )}
              </Row>
              <Row label="법정동코드">{norm.bjdCode}</Row>
              <Row label="시군구코드">{norm.sigunguCode}</Row>
              <Row label="도로명주소">{norm.roadAddress}</Row>
              <Row label="지번주소">{norm.jibunAddress}</Row>
              <Row label="상세주소">{norm.detailAddress}</Row>
              {norm.candidates.length > 1 && (
                <Row label="후보">
                  {norm.candidates.length}건 —{' '}
                  {norm.candidates
                    .slice(0, 3)
                    .map((c) => `${c.roadAddress} (${c.zipCode})`)
                    .join(', ')}
                </Row>
              )}
            </dl>
            {norm.apiUnavailable && (
              <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                주소 API를 쓰지 못해 글자 해석으로만 정제했습니다: {norm.apiUnavailable}
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">배송센터 결정</h3>
            <dl>
              <Row label="센터">
                {res.centerName ? (
                  <StatusBadge tone={res.needConfirm ? 'warning' : 'success'}>
                    {res.centerName}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="danger">정하지 못함</StatusBadge>
                )}
              </Row>
              <Row label="결정 기준">
                {res.resolveLevel ? `${LEVEL_LABEL[res.resolveLevel]} ${res.resolveKey}` : null}
              </Row>
              <Row label="확인 필요">
                {res.needConfirm ? (
                  <span className="text-destructive">{res.reason}</span>
                ) : (
                  '아니오 (자동 지정)'
                )}
              </Row>
              {res.warnings.length > 0 && <Row label="알림">{res.warnings.join(' / ')}</Row>}
              {res.candidates.length > 1 && (
                <Row label="후보 센터">
                  {res.candidates.map((c) => `${c.centerName} (우편번호 ${c.zipCount})`).join(', ')}
                </Row>
              )}
            </dl>
          </section>
        </div>
      )}
    </div>
  )
}
