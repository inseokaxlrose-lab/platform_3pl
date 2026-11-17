import 'server-only'
import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { Db } from '@/lib/prisma'
import {
  bjdFromAddress,
  bjdFullName,
  type BjdRow,
  decodeKorean,
  mainSigunguCode,
  parseAddressLine,
  parseBjdFile,
  representativeAddress,
  ZipAggregator,
} from './region-files'

// 지역 마스터 적재 (docs/decisions/0076) — 화면이 아니라 스크립트(npm run region:load)로만 갱신한다
// 전체분 적재: 법정동(있으면 고치고 없으면 넣음, 폐지 표시) → 주소DB를 우편번호별로 모아
//   우편번호(신규는 최초 버전, 이번에 없으면 폐지) · 우편번호↔법정동(이번 결과로 바꿈)
// 적재 이력(tb_region_load_hist)에 건수·상태를 남긴다. 신규 우편번호 목록을 돌려준다 (추천 배정용)
// 주소DB에 있는데 법정동 파일에 없는 법정동(두 파일 기준일 차이)은 주소DB 이름으로 덧붙이고 알려 준다

export type RegionLoadInput = {
  loadVer: string
  bjdFile: string
  addressFiles: string[]
  actor?: string
}

export type RegionLoadResult = {
  loadId: bigint
  bjdCount: number
  zipCount: number
  newZips: string[]
  abolishedZips: string[]
  crossSigunguZips: string[]
  // 법정동 파일에 없어 주소DB 이름으로 덧붙인 법정동 (주소 수 많은 순)
  addedBjds: { code: string; name: string; addressCount: number }[]
}

const CHUNK = 2000

// 큰 파일을 줄 단위로 (인코딩은 앞부분으로 판단, 이어서 같은 인코딩으로 읽는다)
async function* readLines(path: string) {
  const head = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = createReadStream(path, { start: 0, end: 65535 })
    stream.on('data', (c) => chunks.push(c as Buffer))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
  // 앞부분 끝에서 글자가 잘렸을 수 있어 마지막 몇 바이트는 빼고 판단한다
  const sample = head.length > 8 ? head.subarray(0, head.length - 4) : head
  const encoding = new TextDecoder('utf-8').decode(sample).includes('\uFFFD') ? 'euc-kr' : 'utf-8'
  const decoder = new TextDecoder(encoding)
  let rest = ''
  for await (const chunk of createReadStream(path)) {
    rest += decoder.decode(chunk as Buffer, { stream: true })
    const lines = rest.split(/\r?\n/)
    rest = lines.pop() ?? ''
    yield* lines
  }
  rest += decoder.decode()
  if (rest) yield rest
}

// 배열을 몇 개씩 나눠 처리
async function inChunks<T>(list: T[], run: (part: T[]) => Promise<unknown>) {
  for (let i = 0; i < list.length; i += CHUNK) await run(list.slice(i, i + CHUNK))
}

// 법정동 넣기·고치기 (폐지로 바뀌면 폐지일 기록)
function upsertBjds(db: Db, bjds: BjdRow[], loadVer: string) {
  return inChunks(
    bjds,
    (part) =>
      db.$executeRaw`
      INSERT INTO tb_region_bjd (bjd_cd, sido_cd, sido_nm, sigungu_cd, sigungu_nm, emd_nm, ri_nm, bjd_level, abolished_yn, load_ver)
      SELECT * FROM UNNEST(
        ${part.map((b) => b.code)}::char(10)[], ${part.map((b) => b.sidoCode)}::char(2)[],
        ${part.map((b) => b.sidoName)}::varchar[], ${part.map((b) => b.sigunguCode)}::char(5)[],
        ${part.map((b) => b.sigunguName)}::varchar[], ${part.map((b) => b.emdName)}::varchar[],
        ${part.map((b) => b.riName)}::varchar[], ${part.map((b) => b.level)}::smallint[],
        ${part.map((b) => (b.abolished ? 'Y' : 'N'))}::char(1)[], ${part.map(() => loadVer)}::varchar[]
      )
      ON CONFLICT (bjd_cd) DO UPDATE SET
        sido_nm = EXCLUDED.sido_nm, sigungu_nm = EXCLUDED.sigungu_nm, emd_nm = EXCLUDED.emd_nm,
        ri_nm = EXCLUDED.ri_nm, bjd_level = EXCLUDED.bjd_level, load_ver = EXCLUDED.load_ver,
        abolished_dt = CASE WHEN EXCLUDED.abolished_yn = 'Y' AND tb_region_bjd.abolished_yn = 'N'
                            THEN CURRENT_DATE ELSE tb_region_bjd.abolished_dt END,
        abolished_yn = EXCLUDED.abolished_yn`,
  )
}

export async function loadRegionMaster(db: Db, input: RegionLoadInput): Promise<RegionLoadResult> {
  const hist = await db.regionLoadHist.create({
    data: {
      loadVer: input.loadVer,
      sourceName: [input.bjdFile, ...input.addressFiles].join(', ').slice(0, 500),
      loadType: 'FULL',
      createdBy: input.actor ?? 'system',
    },
  })
  try {
    // 1) 법정동
    const bjds = parseBjdFile(decodeKorean(await readFile(input.bjdFile)))
    await upsertBjds(db, bjds, input.loadVer)
    const knownBjd = new Set(bjds.map((b) => b.code))

    // 2) 주소DB → 우편번호별로 모으기
    const aggregator = new ZipAggregator()
    const added = new Map<string, { bjd: BjdRow; addressCount: number }>()
    for (const file of input.addressFiles) {
      let lineNo = 0
      for await (const line of readLines(file)) {
        lineNo++
        const row = parseAddressLine(line, lineNo)
        if (!row) continue
        if (!knownBjd.has(row.bjdCode)) {
          const extra = added.get(row.bjdCode)
          if (extra) extra.addressCount++
          else added.set(row.bjdCode, { bjd: bjdFromAddress(row), addressCount: 1 })
        }
        aggregator.add(row)
      }
    }
    // 우편번호↔법정동이 법정동 표를 참조하므로 우편번호보다 먼저 넣는다
    await upsertBjds(
      db,
      [...added.values()].map((a) => a.bjd),
      input.loadVer,
    )
    const zips = [...aggregator.zips.values()].map((z) => {
      const sigunguCode = mainSigunguCode(z)
      return { ...z, sidoCode: sigunguCode.slice(0, 2), sigunguCode }
    })
    if (zips.length === 0) throw new Error('주소DB에서 우편번호를 하나도 읽지 못했습니다.')

    // 3) 우편번호: 신규·기존·폐지 구분
    const existing = new Set(
      (await db.regionZip.findMany({ select: { code: true } })).map((z) => z.code),
    )
    const loaded = new Set(zips.map((z) => z.zipCode))
    const newZips = zips.filter((z) => !existing.has(z.zipCode)).map((z) => z.zipCode)
    const abolishedZips = [...existing].filter((code) => !loaded.has(code))
    await inChunks(
      zips,
      (part) =>
        db.$executeRaw`
        INSERT INTO tb_region_zip (zip_cd, sido_cd, sigungu_cd, rep_addr, addr_cnt, abolished_yn, first_load_ver, last_load_ver)
        SELECT z, s, g, r, c, 'N', ${input.loadVer}, ${input.loadVer} FROM UNNEST(
          ${part.map((z) => z.zipCode)}::char(5)[], ${part.map((z) => z.sidoCode)}::char(2)[],
          ${part.map((z) => z.sigunguCode)}::char(5)[], ${part.map((z) => representativeAddress(z))}::varchar[],
          ${part.map((z) => z.addressCount)}::int[]
        ) AS t(z, s, g, r, c)
        ON CONFLICT (zip_cd) DO UPDATE SET
          sido_cd = EXCLUDED.sido_cd, sigungu_cd = EXCLUDED.sigungu_cd, rep_addr = EXCLUDED.rep_addr,
          addr_cnt = EXCLUDED.addr_cnt, abolished_yn = 'N', last_load_ver = EXCLUDED.last_load_ver`,
    )
    if (abolishedZips.length > 0) {
      await db.regionZip.updateMany({
        where: { code: { in: abolishedZips } },
        data: { abolishedYn: 'Y' },
      })
    }

    // 4) 우편번호 ↔ 법정동: 이번 결과로 바꾼다
    const links = zips.flatMap((z) =>
      [...z.bjdCounts.entries()].map(([bjdCode, count]) => ({
        zip: z.zipCode,
        bjd: bjdCode,
        count,
      })),
    )
    await db.$executeRaw`DELETE FROM tb_region_zip_bjd WHERE zip_cd = ANY(${[...loaded]}::char(5)[])`
    await inChunks(
      links,
      (part) =>
        db.$executeRaw`
        INSERT INTO tb_region_zip_bjd (zip_cd, bjd_cd, addr_cnt)
        SELECT * FROM UNNEST(${part.map((l) => l.zip)}::char(5)[], ${part.map((l) => l.bjd)}::char(10)[], ${part.map((l) => l.count)}::int[])`,
    )

    await db.regionLoadHist.update({
      where: { id: hist.id },
      data: {
        status: 'DONE',
        endedAt: new Date(),
        bjdCount: bjds.length + added.size,
        zipCount: zips.length,
        newCount: newZips.length,
        changedCount: zips.length - newZips.length,
        abolishedCount: abolishedZips.length,
      },
    })
    return {
      loadId: hist.id,
      bjdCount: bjds.length + added.size,
      zipCount: zips.length,
      newZips,
      abolishedZips,
      crossSigunguZips: [...aggregator.crossSigungu],
      addedBjds: [...added.values()]
        .sort((a, b) => b.addressCount - a.addressCount)
        .map((a) => ({ code: a.bjd.code, name: bjdFullName(a.bjd), addressCount: a.addressCount })),
    }
  } catch (error) {
    await db.regionLoadHist.update({
      where: { id: hist.id },
      data: {
        status: 'FAILED',
        endedAt: new Date(),
        errorMessage: (error instanceof Error ? error.message : String(error)).slice(0, 2000),
      },
    })
    throw error
  }
}

// 지금 적재된 지역 마스터 버전 (마지막으로 성공한 전체분)
export async function currentRegionLoadVer(db: Db) {
  const last = await db.regionLoadHist.findFirst({
    where: { status: 'DONE' },
    orderBy: { startedAt: 'desc' },
    select: { loadVer: true, endedAt: true },
  })
  return last
}
