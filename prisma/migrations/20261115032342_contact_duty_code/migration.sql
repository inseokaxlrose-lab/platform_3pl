-- 운영사 담당자: 담당 업무를 공통코드(CONTACT_DUTY)로 바꾸고, 대표 담당자 칸을 추가한다 (docs/decisions/0031)

-- 1) 대표 담당자 칸
ALTER TABLE "company_contact" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- 2) 담당 업무 글자 → 코드 (이미 코드 모양이면 그대로, 알아볼 수 없으면 ETC)
UPDATE "company_contact" SET "duty" = CASE
  WHEN "duty" IN ('INBOUND', 'OUTBOUND', 'INVENTORY', 'SETTLEMENT', 'CONTRACT', 'IT', 'ETC') THEN "duty"
  WHEN "duty" LIKE '%입고%' THEN 'INBOUND'
  WHEN "duty" LIKE '%출고%' OR "duty" LIKE '%배송%' THEN 'OUTBOUND'
  WHEN "duty" LIKE '%재고%' THEN 'INVENTORY'
  WHEN "duty" LIKE '%정산%' OR "duty" LIKE '%청구%' THEN 'SETTLEMENT'
  WHEN "duty" LIKE '%계약%' OR "duty" LIKE '%영업%' THEN 'CONTRACT'
  WHEN upper("duty") LIKE '%IT%' OR "duty" LIKE '%전산%' OR "duty" LIKE '%시스템%' THEN 'IT'
  ELSE 'ETC'
END;

-- 3) 회사마다 첫 번째 담당자를 대표로
UPDATE "company_contact" c SET "isPrimary" = true
FROM (
  SELECT DISTINCT ON ("companyId") "id" FROM "company_contact" ORDER BY "companyId", "sortOrder"
) first
WHERE c."id" = first."id";
