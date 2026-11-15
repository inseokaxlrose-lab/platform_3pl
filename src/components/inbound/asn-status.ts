import type { StatusFormat } from '@/components/data-grid'
import {
  ASN_CHANNEL_LABELS,
  ASN_STATUS_LABELS,
  PUTAWAY_STATUS_LABELS,
} from '@/lib/inbound/asn-schema'

// ASN 상태 배지 서식 (목록·상세 공용)
export const ASN_STATUS_FORMAT: StatusFormat = {
  PLANNED: { label: ASN_STATUS_LABELS.PLANNED, tone: 'neutral' },
  INSPECTING: { label: ASN_STATUS_LABELS.INSPECTING, tone: 'info' },
  PARTIAL: { label: ASN_STATUS_LABELS.PARTIAL, tone: 'warning' },
  COMPLETED: { label: ASN_STATUS_LABELS.COMPLETED, tone: 'success' },
  CLOSED: { label: ASN_STATUS_LABELS.CLOSED, tone: 'danger' },
}

export const PUTAWAY_STATUS_FORMAT: StatusFormat = {
  WAITING: { label: PUTAWAY_STATUS_LABELS.WAITING, tone: 'neutral' },
  PARTIAL: { label: PUTAWAY_STATUS_LABELS.PARTIAL, tone: 'warning' },
  DONE: { label: PUTAWAY_STATUS_LABELS.DONE, tone: 'success' },
}

const options = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }))

export const ASN_STATUS_OPTIONS = options(ASN_STATUS_LABELS)
export const PUTAWAY_STATUS_OPTIONS = options(PUTAWAY_STATUS_LABELS)
export const ASN_CHANNEL_OPTIONS = options(ASN_CHANNEL_LABELS)
