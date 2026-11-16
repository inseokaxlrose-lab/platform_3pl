'use client'

import { useMemo } from 'react'
import { codeSvg, type CodeType } from '@/lib/labels/barcode'
import { formatQty } from '@/lib/units/convert'
import { cn } from '@/lib/utils'

// 라벨 양식 4종 (docs/decisions/0055, 0003 결정 6) — 라벨 단위(PLT·BOX)별 2가지
// 양식은 코드로 정의한다 (MVP). 크기는 mm, 인쇄할 때 @page 크기를 양식에 맞춘다 (1장 = 1페이지)
// 라벨은 화면 테마와 상관없이 흰 바탕·검은 글자 (프린터 출력과 같게)

export type LabelView = {
  id: string
  labelNo: string
  payload: string
  seq: number
  total: number
  labelUnit: 'PLT' | 'BOX'
  // 이 장의 수량 (기본단위)
  qty: string
  baseUnit: string
  itemCode: string
  itemName: string
  spec: string | null
  lotNo: string | null
  expiryOn: string | null
  shipperName: string
  centerName: string
  asnNo: string
  // 검수 일자 'YYYY-MM-DD'
  inspectedOn: string
}

export type LabelTemplateId = 'PLT_A' | 'PLT_B' | 'BOX_A' | 'BOX_B'

export const LABEL_TEMPLATES: Record<
  LabelTemplateId,
  { unit: 'PLT' | 'BOX'; name: string; width: number; height: number; isDefault: boolean }
> = {
  PLT_A: { unit: 'PLT', name: 'PLT 기본 (100×150mm)', width: 100, height: 150, isDefault: true },
  PLT_B: {
    unit: 'PLT',
    name: 'PLT A4 반장 (210×148mm)',
    width: 210,
    height: 148,
    isDefault: false,
  },
  BOX_A: { unit: 'BOX', name: 'BOX 기본 (100×100mm)', width: 100, height: 100, isDefault: true },
  BOX_B: { unit: 'BOX', name: 'BOX 소형 (100×50mm)', width: 100, height: 50, isDefault: false },
}

export const templatesOf = (unit: 'PLT' | 'BOX') =>
  (Object.keys(LABEL_TEMPLATES) as LabelTemplateId[]).filter(
    (id) => LABEL_TEMPLATES[id].unit === unit,
  )

export const defaultTemplateOf = (unit: 'PLT' | 'BOX') =>
  templatesOf(unit).find((id) => LABEL_TEMPLATES[id].isDefault)!

// 2D 코드 (SVG 글자를 그대로 넣는다: 우리 코드가 만든 SVG라 안전)
function Code({ type, text, className }: { type: CodeType; text: string; className?: string }) {
  const svg = useMemo(() => codeSvg(type, text), [type, text])
  return (
    <div
      className={cn('[&>svg]:h-full [&>svg]:w-full', className)}
      aria-label={`${type === 'QR' ? 'QR 코드' : 'Data Matrix'}: ${text}`}
      role="img"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

// 이름표 + 값 한 줄
function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex gap-[2mm] leading-tight">
      <span className="w-[16mm] shrink-0 text-[2.6mm] text-black/60">{label}</span>
      <span className={cn('min-w-0 break-all', strong ? 'text-[3.6mm] font-bold' : 'text-[3mm]')}>
        {value}
      </span>
    </div>
  )
}

const qtyText = (label: LabelView) => `${formatQty(label.qty)} ${label.baseUnit}`

// 큰 양식 (PLT 기본 100×150, PLT A4 반장 210×148): 품목·수량을 크게, 코드는 크게
function LargeLabel({
  label,
  codeType,
  wide,
}: {
  label: LabelView
  codeType: CodeType
  wide: boolean
}) {
  return (
    <div className={cn('flex h-full gap-[4mm] p-[5mm]', wide ? 'flex-row' : 'flex-col')}>
      <div className="flex min-w-0 flex-1 flex-col gap-[2.5mm]">
        <div className="flex items-baseline justify-between border-b border-black pb-[2mm]">
          <span className="text-[4mm] font-bold">{label.labelUnit} 관리 라벨</span>
          <span className="text-[3.4mm] font-semibold">
            {label.seq} / {label.total}
          </span>
        </div>
        <div className="text-[6mm] leading-tight font-bold break-all">{label.itemCode}</div>
        <div className="text-[4mm] leading-tight break-all">
          {label.itemName}
          {label.spec ? ` · ${label.spec}` : ''}
        </div>
        <div className="text-[9mm] leading-none font-black">{qtyText(label)}</div>
        <div className="mt-[1mm] space-y-[1.2mm]">
          <Row label="로트" value={label.lotNo ?? '-'} strong />
          <Row label="유통기한" value={label.expiryOn ?? '-'} strong />
          <Row label="화주사" value={label.shipperName} />
          <Row label="센터" value={label.centerName} />
          <Row label="ASN" value={label.asnNo} />
          <Row label="검수일" value={label.inspectedOn} />
        </div>
      </div>
      <div className={cn('flex flex-col items-center gap-[1.5mm]', wide ? 'w-[70mm]' : 'w-full')}>
        <Code
          type={codeType}
          text={label.payload}
          className={wide ? 'size-[60mm]' : 'size-[45mm]'}
        />
        <span className="font-mono text-[3.2mm] font-semibold">{label.labelNo}</span>
      </div>
    </div>
  )
}

// BOX 기본 100×100: 코드 왼쪽, 정보 오른쪽
function BoxLabel({ label, codeType }: { label: LabelView; codeType: CodeType }) {
  return (
    <div className="flex h-full flex-col gap-[2mm] p-[4mm]">
      <div className="flex items-baseline justify-between border-b border-black pb-[1.5mm]">
        <span className="text-[4.5mm] font-bold break-all">{label.itemCode}</span>
        <span className="text-[3mm] font-semibold">
          {label.seq} / {label.total}
        </span>
      </div>
      <div className="truncate text-[3.2mm]">{label.itemName}</div>
      <div className="flex flex-1 gap-[3mm]">
        <div className="flex flex-col items-center gap-[1mm]">
          <Code type={codeType} text={label.payload} className="size-[38mm]" />
          <span className="font-mono text-[2.6mm]">{label.labelNo}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[1.2mm]">
          <div className="text-[6.5mm] leading-none font-black">{qtyText(label)}</div>
          <Row label="로트" value={label.lotNo ?? '-'} strong />
          <Row label="유통" value={label.expiryOn ?? '-'} strong />
          <Row label="화주사" value={label.shipperName} />
          <Row label="ASN" value={label.asnNo} />
        </div>
      </div>
    </div>
  )
}

// BOX 소형 100×50: 코드 + 핵심만 (품목·수량·로트·유통기한·번호)
function SmallBoxLabel({ label, codeType }: { label: LabelView; codeType: CodeType }) {
  return (
    <div className="flex h-full gap-[3mm] p-[3mm]">
      <Code type={codeType} text={label.payload} className="size-[42mm] shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="text-[4mm] leading-tight font-bold break-all">{label.itemCode}</div>
        <div className="truncate text-[2.8mm]">{label.itemName}</div>
        <div className="text-[5mm] leading-none font-black">{qtyText(label)}</div>
        <div className="text-[2.8mm] leading-tight">
          로트 {label.lotNo ?? '-'} · 유통 {label.expiryOn ?? '-'}
        </div>
        <div className="flex justify-between font-mono text-[2.5mm]">
          <span>{label.labelNo}</span>
          <span>
            {label.seq}/{label.total}
          </span>
        </div>
      </div>
    </div>
  )
}

// 라벨 한 장 (양식 크기 그대로, 인쇄 때 1장 = 1페이지)
export function LabelSheet({
  label,
  template,
  codeType,
}: {
  label: LabelView
  template: LabelTemplateId
  codeType: CodeType
}) {
  const size = LABEL_TEMPLATES[template]
  return (
    <div
      className="label-sheet overflow-hidden bg-white text-black"
      style={{ width: `${size.width}mm`, height: `${size.height}mm` }}
    >
      {template === 'PLT_A' && <LargeLabel label={label} codeType={codeType} wide={false} />}
      {template === 'PLT_B' && <LargeLabel label={label} codeType={codeType} wide />}
      {template === 'BOX_A' && <BoxLabel label={label} codeType={codeType} />}
      {template === 'BOX_B' && <SmallBoxLabel label={label} codeType={codeType} />}
    </div>
  )
}

// 인쇄용 CSS: 용지 크기 = 양식 크기, 여백 0, 라벨마다 새 페이지, 라벨 말고는 인쇄하지 않는다
export function LabelPrintStyle({ template }: { template: LabelTemplateId }) {
  const size = LABEL_TEMPLATES[template]
  return (
    <style>{`
@media print {
  @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
  body * { visibility: hidden; }
  .label-print-area, .label-print-area * { visibility: visible; }
  .label-print-area { position: absolute; left: 0; top: 0; }
  .label-print-area .label-sheet { break-after: page; box-shadow: none; border: 0; margin: 0; }
}
`}</style>
  )
}
