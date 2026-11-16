'use client'

import { useState } from 'react'
import {
  LABEL_TEMPLATES,
  LabelSheet,
  type LabelTemplateId,
  type LabelView,
} from '@/components/labels'
import { Button } from '@/components/ui/button'
import { buildLabelPayload } from '@/lib/labels/label-payload'
import type { CodeType } from '@/lib/labels/barcode'

const sample = (labelUnit: 'PLT' | 'BOX', qty: string, seq: number, total: number): LabelView => {
  const labelNo = `LB261116-0000${seq}`
  return {
    id: String(seq),
    labelNo,
    payload: buildLabelPayload({
      labelNo,
      centerCode: 'ICN',
      shipperCode: 'GANA',
      itemCode: 'WATER-500',
      lotNo: 'L240101',
      expiryOn: '2027-01-31',
      qty,
      unit: 'EA',
    }),
    seq,
    total,
    labelUnit,
    qty,
    baseUnit: 'EA',
    itemCode: 'WATER-500',
    itemName: '생수 500ml',
    spec: '24입',
    lotNo: 'L240101',
    expiryOn: '2027-01-31',
    shipperName: '가나식품',
    centerName: '이천센터',
    asnNo: 'AS261116-00001',
    inspectedOn: '2026-11-16',
  }
}

export function LabelsShowcase() {
  const [codeType, setCodeType] = useState<CodeType>('QR')
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(['QR', 'DATAMATRIX'] as const).map((type) => (
          <Button
            key={type}
            type="button"
            variant={codeType === type ? 'default' : 'outline'}
            onClick={() => setCodeType(type)}
          >
            {type === 'QR' ? 'QR 코드' : 'Data Matrix'}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-start gap-8">
        {(Object.keys(LABEL_TEMPLATES) as LabelTemplateId[]).map((id) => {
          const unit = LABEL_TEMPLATES[id].unit
          return (
            <figure key={id} className="space-y-2">
              <figcaption className="text-sm font-medium">{LABEL_TEMPLATES[id].name}</figcaption>
              <div className="border shadow-sm">
                <LabelSheet
                  label={unit === 'PLT' ? sample('PLT', '1440', 3, 3) : sample('BOX', '24', 2, 5)}
                  template={id}
                  codeType={codeType}
                />
              </div>
            </figure>
          )
        })}
      </div>
    </div>
  )
}
