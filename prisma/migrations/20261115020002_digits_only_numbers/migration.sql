-- 사업자등록번호·전화번호를 하이픈 없이 숫자만 저장한다 (docs/decisions/0029)
-- 표 구조는 그대로, 이미 들어 있는 값만 숫자로 바꾼다. 빈 글자가 되면 null

UPDATE "company" SET "businessNumber" = regexp_replace("businessNumber", '\D', '', 'g');
UPDATE "company" SET
  "phone" = NULLIF(regexp_replace("phone", '\D', '', 'g'), ''),
  "fax" = NULLIF(regexp_replace("fax", '\D', '', 'g'), '');

UPDATE "company_contact" SET "phone" = NULLIF(regexp_replace("phone", '\D', '', 'g'), '');

UPDATE "center" SET
  "phone" = NULLIF(regexp_replace("phone", '\D', '', 'g'), ''),
  "fax" = NULLIF(regexp_replace("fax", '\D', '', 'g'), ''),
  "managerPhone" = NULLIF(regexp_replace("managerPhone", '\D', '', 'g'), '');
