import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AppPage } from '@/components/app-page'
import { StatusBadge } from '@/components/common'
import { BackToListButton } from '@/components/master-list'
import { AccessDenied } from '@/components/permission'
import { API_CODE_LABELS } from '@/lib/api/api-codes'
import { getApiLogDetail } from '@/lib/api/api-log-queries'
import { getCurrentScope, hasPermission } from '@/lib/session'

export const metadata: Metadata = { title: 'API 호출 상세' }

const RESULT_TONE = { SUCCESS: 'success', PARTIAL: 'warning', FAIL: 'danger' } as const
const RESULT_LABEL = { SUCCESS: '성공', PARTIAL: '부분 성공', FAIL: '실패' } as const
const ITEM_TONE = {
  CREATED: 'success',
  UPDATED: 'success',
  UNCHANGED: 'neutral',
  DUPLICATE: 'warning',
  FAIL: 'danger',
} as const

// 요청 한 건 상세 (0081 ②): 요약 · 건별 결과 · 요청/응답 본문(개인정보 가림)
export default async function ApiLogDetailPage({
  params,
}: PageProps<'/admin/integration/api-logs/[requestId]'>) {
  const scope = await getCurrentScope()
  if (!(await hasPermission('integration.api-logs.read')) || scope.kind !== 'ALL') {
    return <AccessDenied />
  }
  const { requestId } = await params
  if (!/^req_\d{8}_[0-9a-f]{16}$/.test(requestId)) notFound()
  const log = await getApiLogDetail(requestId, scope)
  if (!log) notFound()

  const result = log.result as keyof typeof RESULT_TONE
  // 같은 키의 최근 7일 호출 (유출 의심 확인용)
  const sevenDaysAgo = new Date(log.requestedAt.getTime() - 7 * 86_400_000).toLocaleDateString(
    'sv-SE',
    { timeZone: 'Asia/Seoul' },
  )
  const day = log.requestedAt.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const facts: [string, React.ReactNode][] = [
    ['요청 일시', log.requestedAt.toLocaleString('ko-KR')],
    ['API', `${API_CODE_LABELS[log.apiCode] ?? log.apiCode} · ${log.httpMethod} ${log.path}`],
    [
      '화주사',
      log.shipper ? (
        <Link
          className="text-primary hover:underline"
          href={`/admin/master/shippers/${log.shipper.id}`}
        >
          {log.shipper.name} ({log.shipper.code})
        </Link>
      ) : (
        '-'
      ),
    ],
    [
      '키',
      log.key ? (
        <span className="flex flex-wrap items-center gap-2">
          {log.key.name} ({log.key.env.toLowerCase()}_{log.key.keyPrefix}_••••)
          <Link
            className="text-primary hover:underline"
            href={`/admin/integration/api-logs?apiClient=${log.key.id}&requestedAt=${sevenDaysAgo}~${day}`}
          >
            이 키의 최근 7일 호출
          </Link>
        </span>
      ) : (
        '-'
      ),
    ],
    ['호출 IP', log.clientIp ?? '-'],
    ['HTTP 상태 · 처리 시간', `${log.httpStatus} · ${log.durationMs.toLocaleString()}ms`],
    ['오류코드', log.errorCode ?? '-'],
    ['Idempotency-Key', log.idempotencyKey ?? '-'],
    [
      '건수 (전체/성공/실패)',
      log.totalCount > 0 ? `${log.totalCount} / ${log.successCount} / ${log.failCount}` : '-',
    ],
  ]

  return (
    <AppPage
      title={`API 호출 ${log.requestId}`}
      description="본문은 저장할 때 개인정보(이름·전화·주소·이메일)를 가린 값입니다. 90일이 지나면 본문은 비워집니다."
      meta={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={RESULT_TONE[result] ?? 'neutral'}>
            {RESULT_LABEL[result] ?? log.result}
          </StatusBadge>
          {log.env && (
            <StatusBadge tone={log.env === 'LIVE' ? 'info' : 'neutral'}>{log.env}</StatusBadge>
          )}
        </span>
      }
      actions={<BackToListButton listPath="/admin/integration/api-logs" />}
    >
      <div className="grid gap-section">
        <section className="grid gap-card">
          <h2 className="text-base font-semibold">요약</h2>
          <dl className="grid gap-x-6 gap-y-2 rounded-md border p-card text-sm sm:grid-cols-[10rem_1fr]">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        {log.items.length > 0 && (
          <section className="grid gap-card">
            <h2 className="text-base font-semibold">건별 결과 ({log.items.length})</h2>
            <ul className="divide-y rounded-md border text-sm">
              {log.items.map((item) => (
                <li
                  key={item.seq}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                >
                  <span className="w-10 text-muted-foreground tabular-nums">#{item.seq}</span>
                  <span className="font-medium">{item.extDocNo ?? '-'}</span>
                  <StatusBadge tone={ITEM_TONE[item.result as keyof typeof ITEM_TONE] ?? 'neutral'}>
                    {item.result}
                  </StatusBadge>
                  {item.internalId && (
                    <span className="text-xs text-muted-foreground">ID {item.internalId}</span>
                  )}
                  {item.errorCode && (
                    <span className="text-destructive">
                      {item.errorCode}
                      {item.errorMsg && ` · ${item.errorMsg}`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {(['requestBody', 'responseBody'] as const).map((key) => (
          <section key={key} className="grid gap-card">
            <h2 className="text-base font-semibold">
              {key === 'requestBody' ? '요청 본문' : '응답 본문'}
            </h2>
            {log[key] ? (
              <pre className="max-h-[32rem] overflow-auto rounded-md border bg-muted/40 p-card font-mono text-xs leading-relaxed">
                {log[key]}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                {log.bodyPurged
                  ? '보관 기간(90일)이 지나 본문을 비웠습니다.'
                  : key === 'requestBody'
                    ? '본문이 없는 요청입니다 (GET 등).'
                    : '같은 Idempotency-Key로 다시 보낸 요청이라 처음 응답을 그대로 돌려줬습니다.'}
              </p>
            )}
          </section>
        ))}
      </div>
    </AppPage>
  )
}
