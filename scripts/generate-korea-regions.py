# 전국 시·도 / 시·군·구 목록(src/config/korea-regions.ts) 만들기
# 1) 공공데이터포털 '국토교통부_법정동코드'(https://www.data.go.kr/data/15123287/fileData.do) CSV를 내려받는다 (CP949)
# 2) python3 -I scripts/generate-korea-regions.py <내려받은.csv> src/config/korea-regions.ts
# 3) 파일 머리의 갱신일(2026-09-29)을 새 갱신일로 바꾸고 npx prettier --write 로 정리한다
import csv, sys, json
src, out = sys.argv[1], sys.argv[2]
rows=[]
with open(src, encoding='cp949') as f:
    for r in csv.DictReader(f):
        if r['폐지여부']=='존재' and r['법정동코드'][5:]=='00000':
            rows.append((r['법정동코드'], r['법정동명'].strip()))
sido=[(c[:2],n) for c,n in rows if c[2:5]=='000']
# 세종: 시·군·구 없이 시·도 하나
for c,n in rows:
    if c.startswith('36') and len(n.split())==1 and c[:2] not in [s for s,_ in sido]:
        sido.append((c[:2], n))
sido.sort()
sgg=sorted((c[:5], c[:2], n.split()[1]) for c,n in rows if c[2:5]!='000' and len(n.split())==2)
lines=[]
lines.append("// 전국 시·도 / 시·군·구 목록 — 배송권역의 담당 지역 고르기용 (docs/decisions/0033)")
lines.append("// 자동 생성 파일: 직접 고치지 말고 scripts/generate-korea-regions.py로 다시 만든다")
lines.append("// 출처: 공공데이터포털 '국토교통부_법정동코드' (data.go.kr/data/15123287, 2026-09-29 갱신본), 폐지여부 '존재'만")
lines.append("// - 코드: 시·도 2자리, 시·군·구 5자리 (법정동코드 앞자리). 카카오 주소 검색의 bcode 앞 5자리와 같다")
lines.append("// - 일반구(예: 수원시 장안구)는 넣지 않고 시 단위까지. 세종특별자치시는 시·군·구 없이 시·도 하나")
lines.append("")
lines.append("export type Sido = { code: string; name: string }")
lines.append("export type Sigungu = { code: string; sidoCode: string; name: string }")
lines.append("")
lines.append("export const REGIONS_BASE_DATE = '2026-09-29'")
lines.append("")
lines.append("export const SIDO_LIST: readonly Sido[] = [")
for c,n in sido: lines.append(f"  {{ code: '{c}', name: '{n}' }},")
lines.append("]")
lines.append("")
lines.append("export const SIGUNGU_LIST: readonly Sigungu[] = [")
for c,s,n in sgg: lines.append(f"  {{ code: '{c}', sidoCode: '{s}', name: '{n}' }},")
lines.append("]")
open(out,'w').write("\n".join(lines)+"\n")
print(len(sido), len(sgg))
