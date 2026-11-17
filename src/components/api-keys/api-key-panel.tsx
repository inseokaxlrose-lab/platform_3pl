'use client'

import { ActivityIcon, BanIcon, KeyRoundIcon, PencilIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ConfirmDialog, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { unwrap } from '@/lib/actions'
import { API_KEY_STATUS, MAX_ACTIVE_KEYS } from '@/lib/api/api-codes'
import type { ShipperApiKey } from '@/lib/api/api-key-queries'
import { revokeApiKeyAction } from '@/app/admin/integration/api-keys/actions'
import { ApiKeyDialog } from './api-key-dialog'
import { IssuedKeyDialog } from './issued-key-dialog'

const STATUS_TONE = { ACTIVE: 'success', REVOKED: 'danger', EXPIRED: 'neutral' } as const

// 화주사 편집 화면 "API 키" 섹션 (0081): 키 목록 + [키 발급] + 줄마다 [수정]·[폐기]
// 키 교체: 새 키 발급 → 화주가 시스템에 적용 → 옛 키 폐기 (환경마다 사용 중인 키 최대 2개)
export function ApiKeyPanel({
  shipperId,
  keys,
  canCreate,
  canUpdate,
  canViewLogs = false,
  disabledReason,
}: {
  shipperId: string
  keys: ShipperApiKey[]
  canCreate: boolean
  canUpdate: boolean
  // API 호출 이력 조회 권한: 줄마다 [호출 이력] (이 키의 최근 7일)
  canViewLogs?: boolean
  // 발급할 수 없는 이유 (해지된 화주 등)
  disabledReason?: string
}) {
  const router = useRouter()
  const [issueOpen, setIssueOpen] = useState(false)
  const [editing, setEditing] = useState<ShipperApiKey | null>(null)
  const [issuedKey, setIssuedKey] = useState<string | null>(null)

  const activeCount = (env: string) =>
    keys.filter((k) => k.env === env && k.status === 'ACTIVE').length
  const full = activeCount('TEST') >= MAX_ACTIVE_KEYS && activeCount('LIVE') >= MAX_ACTIVE_KEYS

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          환경마다 사용 중인 키는 {MAX_ACTIVE_KEYS}개까지입니다. 교체는 새 키 발급 → 화주 시스템에
          적용 → 옛 키 폐기 순서로 합니다.
        </p>
        {canCreate && (
          <Button
            type="button"
            size="sm"
            onClick={() => setIssueOpen(true)}
            disabled={Boolean(disabledReason) || full}
            title={disabledReason ?? (full ? '기존 키를 먼저 폐기하세요' : undefined)}
          >
            <KeyRoundIcon />키 발급
          </Button>
        )}
      </div>
      {keys.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          발급한 API 키가 없습니다.
        </p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {keys.map((key) => {
            const active = key.status === 'ACTIVE'
            return (
              <li
                key={key.id}
                className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    <StatusBadge tone={key.env === 'LIVE' ? 'info' : 'neutral'}>
                      {key.env}
                    </StatusBadge>
                    <StatusBadge
                      tone={STATUS_TONE[key.status as keyof typeof STATUS_TONE] ?? 'neutral'}
                    >
                      {API_KEY_STATUS.labels[key.status as keyof typeof API_KEY_STATUS.labels] ??
                        key.status}
                    </StatusBadge>
                    {key.expiringSoon && <StatusBadge tone="warning">만료 예정</StatusBadge>}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{key.key}</p>
                  <p className="text-xs text-muted-foreground">
                    권한 {key.scopes.length}개 · 허용 IP{' '}
                    {key.ips.length === 0 ? '전체' : `${key.ips.length}개`} · 분당{' '}
                    {key.rateLimitPerMin}회 · 만료{' '}
                    {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString('ko-KR') : '없음'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    최근 사용{' '}
                    {key.lastUsedAt
                      ? `${new Date(key.lastUsedAt).toLocaleString('ko-KR')} (${key.lastUsedIp ?? '-'})`
                      : '없음'}{' '}
                    · 발급 {new Date(key.issuedAt).toLocaleDateString('ko-KR')} ({key.issuedBy})
                    {key.revokeReason && ` · 폐기 사유: ${key.revokeReason}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {canViewLogs && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/integration/api-logs?apiClient=${key.id}`}>
                        <ActivityIcon />
                        호출 이력
                      </Link>
                    </Button>
                  )}
                  {canUpdate && active && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(key)}
                      >
                        <PencilIcon />
                        수정
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button type="button" size="sm" variant="outline">
                            <BanIcon />
                            폐기
                          </Button>
                        }
                        title={`${key.name} 키를 폐기할까요?`}
                        description="즉시 효력이 생겨 이 키로 오는 다음 호출부터 거부(401)됩니다. 되돌릴 수 없습니다. 유출이 의심되면 [호출 이력]에서 이 키의 최근 7일 호출(IP·시각)을 먼저 확인하세요."
                        confirmLabel="폐기"
                        destructive
                        reason={{ label: '폐기 사유', placeholder: '예: 키 교체, 유출 의심' }}
                        onConfirm={async (reason) => {
                          unwrap(await revokeApiKeyAction({ id: key.id, reason: reason ?? '' }))
                          router.refresh()
                        }}
                      />
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {/* 팝업은 열 때마다 새로 만든다 → 늘 처음 값으로 시작 */}
      {issueOpen && (
        <ApiKeyDialog
          mode="issue"
          shipperId={shipperId}
          open
          onOpenChange={setIssueOpen}
          onIssued={setIssuedKey}
          onSaved={() => router.refresh()}
        />
      )}
      {editing && (
        <ApiKeyDialog
          mode="edit"
          shipperId={shipperId}
          apiKey={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onSaved={() => router.refresh()}
        />
      )}
      <IssuedKeyDialog fullKey={issuedKey} onClose={() => setIssuedKey(null)} />
    </div>
  )
}
