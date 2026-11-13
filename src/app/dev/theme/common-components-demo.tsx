'use client'

import { FilePlusIcon, PackageIcon } from 'lucide-react'
import { useState } from 'react'
import {
  ConfirmDialog,
  EmptyState,
  FormColumns,
  FormField,
  FormSection,
  PageHeader,
  SearchField,
  SearchPanel,
  StatusBadge,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// 공통 컴포넌트 견본 (버튼을 눌러 동작을 확인할 수 있다)
export function CommonComponentsDemo() {
  const [log, setLog] = useState('아직 실행한 동작이 없습니다.')
  const [shipper, setShipper] = useState('')
  const [asnNo, setAsnNo] = useState('')

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">페이지 헤더</h2>
        <div className="rounded-lg border p-6">
          <PageHeader
            className="mb-0"
            title="ASN 조회"
            description="화주사가 등록한 입고 예정 목록입니다."
            actions={
              <>
                <Button variant="outline">엑셀 다운로드</Button>
                <Button>
                  <FilePlusIcon />
                  ASN 등록
                </Button>
              </>
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">상태 배지 (톤)</h2>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone="info">예정</StatusBadge>
          <StatusBadge tone="info">검수중</StatusBadge>
          <StatusBadge tone="warning">부분확정</StatusBadge>
          <StatusBadge tone="success">확정완료</StatusBadge>
          <StatusBadge tone="danger">마감</StatusBadge>
          <StatusBadge tone="neutral">적치대기</StatusBadge>
          <StatusBadge tone="warning">유통기한 임박</StatusBadge>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">검색 조건 영역</h2>
        <SearchPanel
          className="mb-0"
          onSearch={() => setLog(`검색: 화주사=${shipper || '전체'}, ASN번호=${asnNo || '(없음)'}`)}
          onReset={() => {
            setShipper('')
            setAsnNo('')
            setLog('검색 조건 초기화')
          }}
        >
          <SearchField label="화주사">
            <Select value={shipper} onValueChange={setShipper}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A화주">A화주</SelectItem>
                <SelectItem value="B화주">B화주</SelectItem>
              </SelectContent>
            </Select>
          </SearchField>
          <SearchField label="ASN번호" htmlFor="demo-asn-no">
            <Input
              id="demo-asn-no"
              value={asnNo}
              onChange={(e) => setAsnNo(e.target.value)}
              placeholder="ASN-2026-0001"
            />
          </SearchField>
        </SearchPanel>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">확인 대화상자</h2>
        <div className="flex flex-wrap gap-2">
          <ConfirmDialog
            trigger={<Button>입고 확정</Button>}
            title="입고를 확정할까요?"
            description="확정하면 입고대기 창고에 재고가 생성됩니다."
            confirmLabel="확정"
            onConfirm={async () => {
              await new Promise((resolve) => setTimeout(resolve, 800))
              setLog('입고 확정 완료')
            }}
          />
          <ConfirmDialog
            trigger={<Button variant="destructive">잔량 마감</Button>}
            title="남은 수량을 마감할까요?"
            description="마감하면 이 ASN은 더 이상 입고 확정할 수 없습니다."
            confirmLabel="마감"
            destructive
            reason={{ label: '마감 사유', placeholder: '예: 화주사 요청으로 잔량 취소' }}
            onConfirm={(reason) => setLog(`잔량 마감 (사유: ${reason})`)}
          />
          <ConfirmDialog
            trigger={<Button variant="outline">실패 예시</Button>}
            title="실패하는 작업"
            description="확인을 누르면 서버 오류를 흉내 냅니다."
            onConfirm={() => Promise.reject(new Error('이미 마감된 ASN입니다.'))}
          />
        </div>
        <p className="text-sm text-muted-foreground">마지막 동작: {log}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">빈 상태</h2>
        <div className="rounded-lg border">
          <EmptyState
            icon={<PackageIcon />}
            title="등록된 ASN이 없습니다"
            description="ASN을 등록하면 여기에 표시됩니다."
            action={
              <Button>
                <FilePlusIcon />
                ASN 등록
              </Button>
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">입력 화면 배치 (좌우 2단)</h2>
        <p className="text-sm text-muted-foreground">
          정보가 적으면 왼쪽 단만, 많으면 왼쪽을 채우고 오른쪽으로 이어서. 단 안에서는 칸을 위에서
          아래로 한 줄에 하나씩. 좁은 화면에서는 1단.
        </p>
        <p className="text-xs font-medium text-muted-foreground">정보가 적은 화면 (왼쪽만)</p>
        <FormColumns
          left={
            <FormSection title="기본 정보">
              <FormField label="이름" required htmlFor="demo-name">
                <Input id="demo-name" />
              </FormField>
              <FormField label="설명" htmlFor="demo-desc">
                <Input id="demo-desc" />
              </FormField>
            </FormSection>
          }
        />
        <p className="text-xs font-medium text-muted-foreground">
          정보가 많은 화면 (왼쪽 → 오른쪽)
        </p>
        <FormColumns
          left={
            <FormSection title="기본 정보">
              <FormField label="회사명" required htmlFor="demo-company">
                <Input id="demo-company" />
              </FormField>
              <FormField label="대표자" htmlFor="demo-ceo">
                <Input id="demo-ceo" />
              </FormField>
            </FormSection>
          }
          right={
            <FormSection title="연락처" required description="오른쪽 단으로 이어지는 묶음">
              <FormField label="대표 전화" error="오류 문구 예시" htmlFor="demo-phone">
                <Input id="demo-phone" aria-invalid />
              </FormField>
            </FormSection>
          }
        />
      </section>
    </div>
  )
}
