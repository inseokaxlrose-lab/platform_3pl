'use client'

import { ChevronDownIcon, ChevronRightIcon, LoaderIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { StatusBadge } from '@/components/common'
import { cn } from '@/lib/utils'
import { getRegionTreeAction } from './actions'

// 지역 트리 (시도 → 시군구 → 읍면동): 펼칠 때 그 아래 단계를 불러오고, 노드마다 배정 상태 배지

export type TreeNode = {
  level: 'SIDO' | 'SIGUNGU' | 'EMD'
  code: string
  name: string
  zipCount: number
  unassigned: number
  unconfirmed: number
  centers: { centerId: string; name: string; count: number }[]
}

const keyOf = (node: Pick<TreeNode, 'level' | 'code'> | null) =>
  node ? `${node.level}:${node.code}` : 'ROOT'

// 배정 상태 배지: 한 센터면 센터 이름(일부 미배정이면 비율), 여러 센터면 '혼합'(비율은 마우스를 올리면), 미배정·확인 필요 수
export function NodeBadges({ node }: { node: TreeNode }) {
  const ratio = node.centers
    .map((c) => `${c.name} ${Math.round((c.count / node.zipCount) * 100)}%`)
    .join(', ')
  return (
    <span className="flex shrink-0 items-center gap-1">
      {node.centers.length === 1 && (
        <StatusBadge tone="info">
          {node.centers[0].name}
          {node.unassigned > 0 && ` ${Math.round((node.centers[0].count / node.zipCount) * 100)}%`}
        </StatusBadge>
      )}
      {node.centers.length > 1 && (
        <span title={ratio}>
          <StatusBadge tone="neutral">혼합</StatusBadge>
        </span>
      )}
      {node.unassigned > 0 && (
        <StatusBadge tone="warning">
          {node.unassigned === node.zipCount ? '미배정' : `미배정 ${node.unassigned}`}
        </StatusBadge>
      )}
      {node.unconfirmed > 0 && <StatusBadge tone="danger">확인 {node.unconfirmed}</StatusBadge>}
    </span>
  )
}

type RegionTreeProps = {
  tempZone: string
  // 값이 바뀌면 열린 노드를 다시 불러온다 (저장 뒤)
  reloadKey: number
  selected: TreeNode | null
  onSelect: (node: TreeNode) => void
  // 주소로 찾기: 이 경로를 펼치고 마지막 노드를 고른다
  reveal: { codes: string[]; nonce: number } | null
}

export function RegionTree({ tempZone, reloadKey, selected, onSelect, reveal }: RegionTreeProps) {
  const [children, setChildren] = useState<Record<string, TreeNode[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (parent: TreeNode | null) => {
      const key = keyOf(parent)
      setLoading((prev) => new Set(prev).add(key))
      const result = await getRegionTreeAction({
        parent: parent ? { level: parent.level, code: parent.code } : null,
        tempZone,
      })
      setLoading((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      if (!result.ok) {
        setError(result.error.message)
        return []
      }
      setChildren((prev) => ({ ...prev, [key]: result.data }))
      return result.data
    },
    [tempZone],
  )

  // 처음·온도대 변경·저장 뒤: 뿌리와 열린 노드를 다시 불러온다
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const root = await load(null)
      if (cancelled) return
      const queue = [...root]
      while (queue.length) {
        const node = queue.shift()!
        if (expanded.has(keyOf(node))) queue.push(...(await load(node)))
      }
    })()
    return () => {
      cancelled = true
    }
    // 열린 노드 목록이 바뀔 때마다 다시 부르지 않도록 expanded는 넣지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, reloadKey])

  // 주소로 찾기: 경로를 차례로 펼친다
  useEffect(() => {
    if (!reveal) return
    ;(async () => {
      let parent: TreeNode | null = null
      let list = children.ROOT ?? (await load(null))
      for (const code of reveal.codes) {
        const node: TreeNode | undefined = list.find((n) => n.code === code)
        if (!node) break
        parent = node
        if (node.level !== 'EMD' && code !== reveal.codes.at(-1)) {
          setExpanded((prev) => new Set(prev).add(keyOf(node)))
          list = children[keyOf(node)] ?? (await load(node))
        }
      }
      if (parent) onSelect(parent)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.nonce])

  const toggle = (node: TreeNode) => {
    const key = keyOf(node)
    const next = new Set(expanded)
    if (next.has(key)) next.delete(key)
    else {
      next.add(key)
      if (!children[key]) void load(node)
    }
    setExpanded(next)
  }

  const renderNodes = (list: TreeNode[], depth: number): React.ReactNode =>
    list.map((node) => {
      const key = keyOf(node)
      const open = expanded.has(key)
      const leaf = node.level === 'EMD'
      return (
        <li key={key}>
          <div
            className={cn(
              'flex items-center gap-1 rounded-md py-1 pr-1 text-sm hover:bg-muted',
              selected && keyOf(selected) === key && 'bg-accent text-accent-foreground',
            )}
            style={{ paddingLeft: depth * 16 }}
          >
            {leaf ? (
              // 읍면동은 더 펼칠 것이 없다 (들여쓰기만 맞춘다)
              <span className="size-5 shrink-0" aria-hidden />
            ) : (
              <button
                type="button"
                className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
                aria-label={open ? `${node.name} 접기` : `${node.name} 펼치기`}
                aria-expanded={open}
                onClick={() => toggle(node)}
              >
                {loading.has(key) ? (
                  <LoaderIcon className="size-3.5 animate-spin" />
                ) : open ? (
                  <ChevronDownIcon className="size-4" />
                ) : (
                  <ChevronRightIcon className="size-4" />
                )}
              </button>
            )}
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => onSelect(node)}
              title={`${node.name} — 우편번호 ${node.zipCount}개`}
            >
              {node.name}
              <span className="ml-1 text-xs text-muted-foreground">{node.zipCount}</span>
            </button>
            <NodeBadges node={node} />
          </div>
          {open && children[key] && <ul>{renderNodes(children[key], depth + 1)}</ul>}
        </li>
      )
    })

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    )
  }
  if (!children.ROOT) {
    return <p className="text-sm text-muted-foreground">지역을 불러오는 중…</p>
  }
  if (children.ROOT.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        지역 마스터가 비어 있습니다. 적재 스크립트(npm run region:load)로 먼저 넣어 주세요.
      </p>
    )
  }
  return <ul aria-label="지역 트리">{renderNodes(children.ROOT, 0)}</ul>
}
