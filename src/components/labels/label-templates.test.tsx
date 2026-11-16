import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildLabelPayload } from '@/lib/labels/label-payload'
import {
  defaultTemplateOf,
  LABEL_TEMPLATES,
  LabelSheet,
  templatesOf,
  type LabelTemplateId,
  type LabelView,
} from './label-templates'

// 라벨 양식 4종 (0055)

const label: LabelView = {
  id: '1',
  labelNo: 'LB261116-00001',
  payload: buildLabelPayload({
    labelNo: 'LB261116-00001',
    centerCode: 'ICN',
    shipperCode: 'GANA',
    itemCode: 'WATER',
    lotNo: 'L1',
    expiryOn: '2027-01-31',
    qty: '1440',
    unit: 'EA',
  }),
  seq: 1,
  total: 3,
  labelUnit: 'PLT',
  qty: '1440',
  baseUnit: 'EA',
  itemCode: 'WATER',
  itemName: '생수',
  spec: null,
  lotNo: 'L1',
  expiryOn: '2027-01-31',
  shipperName: '가나식품',
  centerName: '이천센터',
  asnNo: 'AS261116-00001',
  inspectedOn: '2026-11-16',
}

describe('라벨 양식', () => {
  it('단위별 2종, 기본 양식은 하나씩', () => {
    expect(templatesOf('PLT')).toEqual(['PLT_A', 'PLT_B'])
    expect(templatesOf('BOX')).toEqual(['BOX_A', 'BOX_B'])
    expect([defaultTemplateOf('PLT'), defaultTemplateOf('BOX')]).toEqual(['PLT_A', 'BOX_A'])
  })

  it.each(Object.keys(LABEL_TEMPLATES) as LabelTemplateId[])(
    '%s: 양식 크기(mm)로, 코드·번호·수량·로트를 그린다',
    (id) => {
      const { container } = render(<LabelSheet label={label} template={id} codeType="QR" />)
      const sheet = container.querySelector('.label-sheet') as HTMLElement
      expect(sheet.style.width).toBe(`${LABEL_TEMPLATES[id].width}mm`)
      expect(sheet.style.height).toBe(`${LABEL_TEMPLATES[id].height}mm`)
      expect(screen.getByRole('img').querySelector('svg')).not.toBeNull()
      expect(container.textContent).toContain('LB261116-00001')
      expect(container.textContent).toContain('1,440 EA')
      expect(container.textContent).toContain('L1')
    },
  )
})
