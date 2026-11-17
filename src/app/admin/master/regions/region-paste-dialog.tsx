'use client'

import { ClipboardPasteIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CenterPick, type AssignableCenter } from './center-pick'
import type { ChangeRequest } from './region-change-dialog'

// 붙여넣기로 지정: 우편번호 목록(줄바꿈·쉼표·공백 구분) + 센터 → 변경 미리보기
// 5자리 숫자가 아닌 것은 바로 알려 주고, 없는·폐지 우편번호는 미리보기에서 제외로 보여 준다

export function parseZipText(text: string) {
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  const zips: string[] = []
  const wrong: string[] = []
  const seen = new Set<string>()
  let duplicates = 0
  for (const token of tokens) {
    const zip = token.replace(/-/g, '')
    if (!/^\d{5}$/.test(zip)) wrong.push(token)
    else if (seen.has(zip)) duplicates++
    else {
      seen.add(zip)
      zips.push(zip)
    }
  }
  return { zips, wrong, duplicates }
}

export function RegionPasteDialog({
  centers,
  tempZone,
  onRequest,
}: {
  centers: AssignableCenter[]
  tempZone: string
  onRequest: (request: ChangeRequest) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [centerId, setCenterId] = useState('')
  const parsed = parseZipText(text)

  const next = () => {
    setOpen(false)
    onRequest({
      title: '붙여넣기로 지정',
      target: { kind: 'zips', source: 'PASTE', zips: parsed.zips },
      tempZone,
      centerId,
    })
    setText('')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <ClipboardPasteIcon />
          붙여넣기로 지정
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>붙여넣기로 지정</DialogTitle>
          <DialogDescription>
            엑셀이나 문서에서 우편번호(5자리) 목록을 복사해 붙여 넣으세요. 줄바꿈·쉼표·공백으로
            나눕니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="paste-zips">우편번호</Label>
            <Textarea
              id="paste-zips"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'16613\n16620, 16625'}
            />
            <p className="text-xs text-muted-foreground">
              인식 {parsed.zips.length.toLocaleString()}건
              {parsed.duplicates > 0 && ` · 중복 ${parsed.duplicates}건 제외`}
              {parsed.wrong.length > 0 && (
                <span className="text-destructive">
                  {' '}
                  · 5자리 숫자가 아님 {parsed.wrong.length}건: {parsed.wrong.slice(0, 5).join(', ')}
                  {parsed.wrong.length > 5 && ' …'}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label>지정할 센터</Label>
            <CenterPick
              centers={centers}
              tempZone={tempZone}
              value={centerId}
              onChange={setCenterId}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button type="button" onClick={next} disabled={parsed.zips.length === 0 || !centerId}>
            미리보기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
