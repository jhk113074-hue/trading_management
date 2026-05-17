# YSACC Proforma Invoice 시스템 설계
## 실제 양식 기반 - 모든 항목 포함

---

## 📋 목차
1. [견적서 양식 분석](#1-견적서-양식-분석)
2. [실제 항목 정리](#2-실제-항목-정리)
3. [DB 스키마 (양식 기반)](#3-db-스키마-양식-기반)
4. [견적서 레이아웃 (양식 그대로)](#4-견적서-레이아웃-양식-그대로)
5. [계산 로직](#5-계산-로직)
6. [AntiGravity 구현](#6-antigravity-구현)

---

## 1. 견적서 양식 분석

### 1.1 YSACC 견적서 2가지 유형

```
Type 1: EPP용 견적서 (PF-EPP-2026-01)
  - 고객: EPP Composites Pvt. Ltd. (INDIA)
  - Incoterms: EXW
  - Delivery: 6 week

Type 2: Thermoset용 견적서 (PI-TMS-2025-05)
  - 고객: THERMOSET TECHNOLOGIES MIDDLE EAST L.L.C (UAE)
  - Incoterms: DOOR TO DOOR
  - Delivery: 2 weeks

→ 양식 구조는 거의 동일, 항목도 동일
→ 양식 하나로 통일 가능!
```

### 1.2 회사 정보 (고정)

```
┌─────────────────────────────────────────┐
│        YSACC CO.,LTD                    │
│                                         │
│ Address 1:                              │
│ 201-1HO, 1251, GAROSU-RO,              │
│ HEUNGDEOK-GU, CHEONGJU-SI,             │
│ CHUNGCHEONGBUK-DO, 28616, KOREA        │
│                                         │
│ Address 2 (옵션):                       │
│ 302 Ho, 180, SEONGBONG-RO, SEOWON-GU, │
│ CHEONGJU-SI, CHUNGCHEONGBUK-DO,        │
│ 28645, KOREA                            │
│                                         │
│ TEL: +82-70-4141-2927                  │
│ FAX: +82-303-3444-1130                 │
│ TEL: +82-10-7361-1130                  │
│ Email: jhkim1130@ysacc.co.kr           │
│ Contact Point: Ju Han, Kim              │
│                                         │
└─────────────────────────────────────────┘
```

### 1.3 거래 조건 (실제 항목들)

```
DEPARTURE PORT:        Busan, Korea / Busan, South Korea
                       (항상 "Busan" 고정)

INCOTERMS:             EXW, DOOR TO DOOR, CIF 등
                       (고객별로 다름)

PACKAGING SPEC:        Export Standard Packaging
                       (항상 이것으로 고정)

DESTINATION:           INDIA, JEBEL ALI, DUBAI 등
                       (고객별로 다름)

VALIDITY:              "4 weeks from the offered date"
                       "2 weeks from the offered date"
                       (고객별로 다름)

ORIGIN:                KOREA
                       (항상 "KOREA" 고정)

Payment Term:          "TT in advance"
                       "100% LC 90 days from BL date"
                       (고객별로 다름)

DELIVERY TERM:         "6 week", "2 weeks" 등
                       (고객별로 다름)
```

### 1.4 은행 정보 (고정)

```
┌─────────────────────────────────────┐
│    BANK INFORMATION (고정)          │
├─────────────────────────────────────┤
│                                     │
│ 1. Bank Name:                       │
│    INDUSTRIAL BANK OF KOREA,        │
│    SEOUL, KOREA                     │
│                                     │
│ 2. Bank Account No.:                │
│    143-129260-56-00012              │
│                                     │
│ 3. Bank Address:                    │
│    50, ULCHIRO 2-GA, CHUNG-GU,     │
│    SEOUL, 100-758, SOUTH KOREA     │
│                                     │
│ 4. Beneficiary:                     │
│    YSACC Co., LTD                  │
│                                     │
│ 5. Swift Code:                      │
│    IBKOKRSEXXX                      │
│                                     │
└─────────────────────────────────────┘
```

### 1.5 상품 라인 (핵심)

```
┌──────────────────────────────────────────────────────────┐
│ PRODUCT | SPEC | PRICE/M | Q'TY(M) | UNIT | TOTAL | Remark
├──────────────────────────────────────────────────────────┤
│                                                          │
│ 1. Cushion Pad    │ Ø30×25mm  │ 3.7  │ 50   │ KG  │ 185 │
│    For drilling   │ Color: Blk│      │      │     │     │
│    Machine        │           │      │      │     │     │
│                   │           │      │      │     │     │
│ 2. FEDEX COST    │           │ 150  │ 1    │ BL  │ 150 │
│                   │           │      │      │     │     │
│ SUB TOTAL        │           │      │      │     │ 335 │
│                                                          │
└──────────────────────────────────────────────────────────┘

각 라인 필수 항목:
  - PRODUCT: 상품명 ★
  - SPEC: 규격, 사양 ★
  - PRICE/M (U/PRICE): 단가 (USD) ★
  - Q'TY(M): 수량 ★
  - UNIT: 단위 (KG, BOX, BL, PCS 등) ★
  - TOTAL: 합계 (=PRICE × Q'TY)
  - Remark: 비고, 특별사항 (선택)
```

---

## 2. 실제 항목 정리

### 2.1 고객 정보 (Customers 테이블)

```sql
고객 정보 항목:
  - 고객 회사명          (Messers: )
  - 주소 라인 1         (주소 첫번째 줄)
  - 주소 라인 2-3       (주소 추가 줄)
  - 도시                (DUBAI, RAJKOT 등)
  - 국가                (INDIA, UAE 등)
  - 담당자명            (Contact Person)
  - 이메일              (선택)
  - 전화                (선택)

예시:
  고객: THERMOSET TECHNOLOGIES MIDDLE EAST L.L.C
  주소: P.O BOX 118157, Tel: 00971 4 885228
       37 STREET, DUBAI INVESTMENT PARK - 1 -, DUBAI, UAE
  도시: DUBAI
  국가: UAE
```

### 2.2 거래 조건 (고객별로 저장)

```sql
거래 조건 항목:
  - DEPARTURE PORT: 부산 (고정)
  - INCOTERMS: EXW, DOOR TO DOOR, CIF 등
  - PACKAGING SPEC: "Export Standard Packaging" (고정)
  - DESTINATION: INDIA, JEBEL ALI 등
  - VALIDITY: "4 weeks from the offered date" 등
  - ORIGIN: KOREA (고정)
  - Payment Term: "TT in advance", "100% LC 90 days" 등
  - DELIVERY TERM: "6 week", "2 weeks" 등

저장 방식:
  이 정보들을 customers 테이블에 저장하면,
  PI 작성 시 고객 선택 시 자동으로 로드!
```

### 2.3 상품 라인 항목 (가장 중요)

```sql
각 라인마다 필수 저장:

1. PRODUCT (상품명)
   - "Cushion Pad"
   - "FEDEX COST"
   - "Fiber Glass Cloths" 등

2. SPEC (규격)
   - "Ø30×25mm, Color: Black"
   - "Size: 1150mm(W) * 200M(L), 176±8g/M2"
   - "Manufacturer: KGF, KN1717-1150N2" 등

3. PRICE/M (U/PRICE) - 판매가 (USD)
   - "3.7" (수동 입력 또는 공식으로 계산)
   - "150" (Freight 등)
   - "200" (자동 계산)

4. Q'TY (수량)
   - "50", "200", "1" 등
   - 숫자만 입력

5. UNIT (단위)
   - "KG" (킬로그램)
   - "M" (미터)
   - "BL" (빌) - Freight
   - "BOX", "PCS" 등

6. TOTAL (합계)
   - = PRICE × Q'TY
   - 자동 계산

7. Remark (비고)
   - "1150mm x 200M / Box"
   - "Export Standard Packaging" 등
   - 선택사항
```

### 2.4 뒷단 계산 항목 (숨겨진 항목들)

```
Thermoset 양식에서 발견된 계산 항목:

PALLETS: 팔레트 수
  예: 1, 2, 3... (컨테이너 계산용)

공간 (Space): 차지하는 공간
  예: 1, 2...

구매가 (Cost in KRW):
  예: 5000 (원가)

환율 (Exchange Rate):
  예: 1450, 1330

이익율 (Profit Margin):
  예: 0.05 (5%), 0.1 (10%)

컨테이너 (Container):
  공식으로 계산되는 항목
  예: =D28*M28 (판매가 × 이익율 계산)

이 항목들은:
  - 내부 계산용 (고객 견적에는 표시 안함)
  - 시스템에서 자동 계산
  - 판매가 공식: =ROUNDUP(J/K/(1-L), 2)
    (구매가 / 환율 / (1-이익율))
```

---

## 3. DB 스키마 (양식 기반)

### 3.1 Customers 테이블 (확장)

```sql
CREATE TABLE customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  
  -- 고객 기본 정보
  name VARCHAR(255) NOT NULL,                    -- "THERMOSET TECHNOLOGIES..."
  
  -- 주소 (라인별 저장)
  address_line1 VARCHAR(500),                    -- "P.O BOX 118157..."
  address_line2 VARCHAR(500),                    -- "37 STREET, DUBAI..."
  country VARCHAR(100),                          -- "UAE"
  city VARCHAR(100),                             -- "DUBAI"
  phone VARCHAR(50),                             -- "00971 4 885228"
  
  -- 담당자
  contact_person VARCHAR(100),
  email VARCHAR(100),
  
  -- 거래 조건 (고객별로 저장)
  departure_port VARCHAR(100) DEFAULT 'Busan, Korea',  -- 항상 Busan
  incoterms VARCHAR(50),                         -- "DOOR TO DOOR"
  destination VARCHAR(100),                      -- "JEBEL ALI"
  packaging_spec VARCHAR(255) DEFAULT 'Export Standard Packaging',
  origin VARCHAR(100) DEFAULT 'KOREA',
  payment_terms VARCHAR(255),                    -- "100% LC 90 days from BL date"
  delivery_term VARCHAR(100),                    -- "2 weeks"
  validity_term VARCHAR(255),                    -- "2 weeks from the offered date"
  
  -- 상태
  status VARCHAR(50) DEFAULT 'active',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 예시 데이터
INSERT INTO customers VALUES (
  'thermoset_uuid',
  'ysacc_uuid',
  'THERMOSET TECHNOLOGIES MIDDLE EAST L.L.C',
  'P.O BOX 118157',
  '37 STREET, DUBAI INVESTMENT PARK - 1 -, DUBAI, UAE',
  'UAE',
  'DUBAI',
  '+971 4 885228',
  NULL,
  NULL,
  'Busan, Korea',
  'DOOR TO DOOR',
  'JEBEL ALI',
  'Export Standard Packaging',
  'KOREA',
  '100% LC 90 days from BL date',
  '2 weeks',
  '2 weeks from the offered date',
  'active',
  NOW(),
  NOW()
);
```

### 3.2 Proforma Invoices 테이블 (확장)

```sql
CREATE TABLE proforma_invoices (
  pi_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  
  -- PI 기본 정보
  pi_number VARCHAR(100) NOT NULL UNIQUE,        -- "PI-TMS-2025-05"
  pi_date DATE NOT NULL,
  
  -- 고객 정보
  customer_id UUID NOT NULL REFERENCES customers(customer_id),
  
  -- 거래 조건 (고객에서 로드되지만 수정 가능)
  departure_port VARCHAR(100),
  incoterms VARCHAR(50),
  packaging_spec VARCHAR(255),
  destination VARCHAR(100),
  origin VARCHAR(100),
  payment_terms VARCHAR(255),
  delivery_term VARCHAR(100),
  validity_term VARCHAR(255),
  
  -- 상태
  current_version VARCHAR(10) DEFAULT 'A',
  status VARCHAR(50) DEFAULT 'draft',
  
  -- 금액
  subtotal_usd DECIMAL(15,4),                    -- SUM of all line totals
  total_usd DECIMAL(15,4),                       -- Subtotal (same unless tax/fees)
  
  -- 추적
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP,
  sent_by UUID REFERENCES users(user_id),
  confirmed_at TIMESTAMP,
  
  CONSTRAINT unique_pi_number UNIQUE(company_id, pi_number)
);

-- 예시 데이터
INSERT INTO proforma_invoices VALUES (
  'pi_001_uuid',
  'ysacc_uuid',
  'PI-TMS-2025-05',
  '2025-12-18',
  'thermoset_uuid',
  'Busan, Korea',
  'DOOR TO DOOR',
  'Export Standard Packaging',
  'JEBEL ALI',
  'KOREA',
  '100% LC 90 days from BL date',
  '2 weeks',
  '2 weeks from the offered date',
  'A',
  'draft',
  335,  -- subtotal
  335,  -- total
  'kim_user_uuid',
  NOW(),
  NOW(),
  NULL,
  NULL,
  NULL
);
```

### 3.3 PI Line Items 테이블 (정확함)

```sql
CREATE TABLE pi_line_items (
  pli_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_id UUID NOT NULL REFERENCES proforma_invoices(pi_id) ON DELETE CASCADE,
  
  -- 라인 순번
  line_number INT,
  
  -- 상품 정보 (실제 항목들)
  product VARCHAR(255),                          -- "Cushion Pad"
  spec VARCHAR(500),                             -- "Ø30×25mm, Color: Black"
  
  -- 가격 & 수량
  price_usd DECIMAL(12,4),                       -- "3.7" (판매가)
  quantity DECIMAL(10,2),                        -- "50"
  unit VARCHAR(50),                              -- "KG"
  total_usd DECIMAL(15,4),                       -- =price × qty
  
  -- 비고
  remark TEXT,                                   -- "1150mm x 200M / Box"
  
  -- 내부 계산 항목 (고객 견적에는 표시 안함)
  pallets INT,
  space INT,
  cost_krw DECIMAL(12,2),                        -- "5000"
  exchange_rate DECIMAL(10,4),                   -- "1450"
  profit_margin DECIMAL(5,2),                    -- "0.05"
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 예시 데이터
INSERT INTO pi_line_items VALUES (
  'pli_001_uuid',
  'ysacc_uuid',
  'pi_001_uuid',
  1,
  'Cushion Pad',
  'Size: Ø30×25mm',
  3.7,
  50,
  'KG',
  185,  -- 3.7 × 50
  NULL,
  1,
  1,
  5000,
  1450,
  0.05,
  NOW()
);

INSERT INTO pi_line_items VALUES (
  'pli_002_uuid',
  'ysacc_uuid',
  'pi_001_uuid',
  2,
  'FEDEX COST',
  NULL,
  150,
  1,
  'BL',
  150,  -- 150 × 1
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NOW()
);
```

---

## 4. 견적서 레이아웃 (양식 그대로)

### 4.1 실제 인쇄 레이아웃

```
═════════════════════════════════════════════════════════════
                        YSACC CO.,LTD
              
201-1HO, 1251, GAROSU-RO, HEUNGDEOK-GU,
CHEONGJU-SI, CHUNGCHEONGBUK-DO, 28616, KOREA
                   
TEL : +82-70-4141-2927   FAX : +82-303-3444-1130
TEL : +82-10-7361-1130
E-mail : jhkim1130@ysacc.co.kr
Contact Point : Ju Han, Kim

                    Proforma Invoice
═════════════════════════════════════════════════════════════

Messers : THERMOSET TECHNOLOGIES MIDDLE EAST L.L.C
         P.O BOX 118157
         37 STREET, DUBAI INVESTMENT PARK - 1 -, DUBAI, UAE

  Gentlemen, We are very pleased to offer you as Follows;

═════════════════════════════════════════════════════════════

DEPARTURE PORT :      Busan, Korea      INCOTERMS :     DOOR TO DOOR

PACKAGING SPEC. :     Export Standard   DESTINATION :   JEBEL ALI
                      Packaging

VALIDITY :            2 weeks from      ORIGIN :        KOREA
                      the offered date

                Payment Term :    100% LC 90 days from BL date
              DELIVERY TERM :     2 weeks

═════════════════════════════════════════════════════════════

Bank Info. :

1. Bank Name : INDUSTRIAL BANK OF KOREA, SEOUL, KOREA
2. Bank Account No. : 143-129260-56-00012
3. Bank Address : 50, ULCHIRO 2-GA, CHUNG-GU, SEOUL, 100-758, SOUTH KOREA
4. Beneficiary : YSACC Co., LTD
5. Swift Code : IBKOKRSEXXX

═════════════════════════════════════════════════════════════

| No.| PRODUCT         | SPEC               | PRICE/M | Q'TY(M) | UNIT | TOTAL | Remark
├────┼─────────────────┼────────────────────┼─────────┼─────────┼──────┼───────┼────────
│ 1  │ Cushion Pad     │ Ø30×25mm           │  3.7    │   50    │ KG   │ 185   │ 1150×200
│    │ For drilling    │ Color: Black       │         │         │      │       │ 
├────┼─────────────────┼────────────────────┼─────────┼─────────┼──────┼───────┼────────
│ 2  │ FEDEX COST      │                    │  150    │   1     │ BL   │ 150   │
├────┼─────────────────┼────────────────────┼─────────┼─────────┼──────┼───────┼────────
│    │ SUB TOTAL       │                    │         │         │      │ 335   │
├────┴─────────────────┴────────────────────┴─────────┴─────────┴──────┴───────┴────────

═════════════════════════════════════════════════════════════

※ Notes

1. Package Size: 210×200×75H, GW: 0.6KG

2. This is basic price. This can be changed as following your added requests.

3. Terms & Conditions as per our standard practice.

═════════════════════════════════════════════════════════════

Prepared by: Ju Han Kim                  Date: 2025-12-18
            Managing Director

Accepted by: ________________


Company Seal: [COMPANY SEAL]

═════════════════════════════════════════════════════════════
```

---

## 5. 계산 로직

### 5.1 판매가 계산

```
양식의 계산 공식:

PRICE/M = ROUNDUP(구매가 / 환율 / (1 - 이익율), 2)

예시:
  구매가: 5,000 KRW
  환율: 1,450
  이익율: 5% (0.05)
  
  Cost USD = 5,000 / 1,450 = 3.45 USD
  Sale Price = 3.45 / (1 - 0.05) = 3.45 / 0.95 = 3.63 USD
  
  → PRICE/M = 3.63

또다른 예시 (Thermoset 실제 데이터):
  구매가: 19,200 KRW (Row 20)
  환율: (Row 12)
  이익율: (Row 13)
  → 자동 계산됨
```

### 5.2 라인 합계 계산

```
TOTAL = PRICE/M × Q'TY

예시:
  Line 1: 3.7 × 50 = 185 USD
  Line 2: 150 × 1 = 150 USD
  
  SUB TOTAL = 185 + 150 = 335 USD
```

### 5.3 일반적인 계산들

```
공간 계산:
  예: =D28*M28 (판매가 × 이익율 관련 계산)

컨테이너 계산:
  예: =L40/1000, =M40+15 등
  (무게/부피 기반 컨테이너 수 계산)

이런 계산들은:
  - 고객 견적서에는 보이지 않음 (뒷단)
  - 내부 코스트 계산용
  - 시스템에서 자동 처리
```

---

## 6. AntiGravity 구현

### 6.1 고객 선택 시 자동로드

```
Step 1: Customer 드롭다운 선택
  "THERMOSET TECHNOLOGIES MIDDLE EAST L.L.C" 클릭
  
Step 2: 자동으로 로드되는 정보
  ✓ DEPARTURE PORT: Busan, Korea
  ✓ INCOTERMS: DOOR TO DOOR
  ✓ PACKAGING SPEC: Export Standard Packaging
  ✓ DESTINATION: JEBEL ALI
  ✓ ORIGIN: KOREA
  ✓ Payment Term: 100% LC 90 days from BL date
  ✓ DELIVERY TERM: 2 weeks
  ✓ VALIDITY: 2 weeks from the offered date
```

### 6.2 라인 아이템 입력

```
화면:
┌────────────────────────────────────────────────┐
│ [+ 상품 라인 추가]                            │
├────────────────────────────────────────────────┤
│                                                │
│ Line 1:                                        │
│ PRODUCT: [Cushion Pad] ★                     │
│ SPEC: [Ø30×25mm, Color: Black]              │
│ PRICE/M: [3.7]                              │
│ Q'TY(M): [50]                               │
│ UNIT: [KG ▼]                                │
│ TOTAL: [185] (자동계산)                      │
│ Remark: [1150mm x 200M / Box]               │
│                                                │
│ [삭제]                                         │
│                                                │
├────────────────────────────────────────────────┤
│                                                │
│ Line 2:                                        │
│ PRODUCT: [FEDEX COST]                         │
│ SPEC: []                                      │
│ PRICE/M: [150]                              │
│ Q'TY(M): [1]                                │
│ UNIT: [BL ▼]                                │
│ TOTAL: [150] (자동계산)                      │
│ Remark: []                                    │
│                                                │
│ [삭제]                                         │
│                                                │
├────────────────────────────────────────────────┤
│ SUB TOTAL: [335]                             │
│                                                │
└────────────────────────────────────────────────┘
```

### 6.3 뒷단 계산 항목 (숨김)

```
이 항목들은 화면에 보이지 않지만,
데이터베이스에는 저장됨:

고급 탭 또는 숨은 섹션:
  Pallets: [1]
  Space: [1]
  Cost KRW: [5000]
  Exchange Rate: [1450]
  Profit Margin: [0.05]

(일반 사용자는 안보이는 항목)
(판매가 계산에 사용되는 항목들)
```

### 6.4 PDF 생성 (양식 그대로)

```
[PDF 다운로드] 클릭

→ YSACC_PI_TMS_2025_05.pdf 생성

포함 내용 (양식 그대로):
  ✓ YSACC 회사 정보
  ✓ 고객 정보 (Messers: ...)
  ✓ 거래 조건 (DEPARTURE PORT, INCOTERMS 등)
  ✓ 은행 정보
  ✓ 상품 테이블 (PRODUCT, SPEC, PRICE/M, Q'TY, UNIT, TOTAL, Remark)
  ✓ SUB TOTAL
  ✓ Notes
  ✓ 서명란
  ✓ Company Seal
```

---

## 7. 구현 체크리스트 (2주)

### Week 1: DB & 화면

```
Day 1: Customers 테이블 확장
  ☐ departure_port, incoterms, destination 등 추가
  ☐ THERMOSET, EPP 고객 데이터 입력

Day 2: PI 테이블
  ☐ pi_number, pi_date, customer_id 등
  ☐ departure_port ~ validity_term 추가
  ☐ subtotal_usd, total_usd

Day 3: PI Line Items 테이블
  ☐ product, spec, price_usd, quantity, unit
  ☐ total_usd (자동계산)
  ☐ cost_krw, exchange_rate, profit_margin (뒷단)

Day 4-5: 화면 설계
  ☐ 고객 선택 → 거래조건 자동로드
  ☐ 라인 아이템 입력 (PRODUCT, SPEC, PRICE, QTY, UNIT)
  ☐ 합계 자동계산
  ☐ 테스트
```

### Week 2: PDF & 정리

```
Day 1-2: PDF 생성
  ☐ 양식 그대로 PDF 템플릿
  ☐ 모든 정보 포함

Day 3-4: 이메일 & 고급기능
  ☐ 이메일 발송
  ☐ Excel Export (라인 아이템만)

Day 5: 최종 테스트
  ☐ Thermoset 고객 PI 생성
  ☐ EPP 고객 PI 생성
  ☐ PDF 생성 확인
  ☐ 모든 정보 정확한지 검증
  ☐ 완성!
```

---

## 최종 정리

```
YSACC 견적서 양식의 특징:

1. 회사 정보: 고정
2. 거래 조건: 고객별로 다름 (Customers에 저장)
3. 은행 정보: 고정
4. 상품 라인: 가변 (각 PI마다 다름)
   ├─ PRODUCT: 상품명
   ├─ SPEC: 상품 규격
   ├─ PRICE/M: 판매가 (USD)
   ├─ Q'TY: 수량
   ├─ UNIT: 단위 (KG, BL, BOX 등)
   ├─ TOTAL: 합계
   └─ Remark: 비고

5. 뒷단 계산: 내부용 (비표시)
   ├─ 구매가 (KRW)
   ├─ 환율
   ├─ 이익율
   └─ 자동 계산 값들

구현 방식:
  - Customers에 거래조건 저장
  - PI 작성 시 고객 선택 → 거래조건 자동로드
  - 라인 아이템 추가
  - PDF 생성 시 양식 그대로 출력

데이터베이스:
  - customers: 고객 + 거래조건
  - proforma_invoices: PI 헤더 + 거래조건 (수정 가능)
  - pi_line_items: 라인 아이템 + 계산 항목
```

---

## 🎯 **다음 단계**

```
이제 준비할 것:

1. 실제 고객 데이터 입력
   ☐ THERMOSET 고객 정보
   ☐ EPP 고객 정보
   ☐ 다른 고객들

2. 실제 상품 데이터 입력
   ☐ Cushion Pad
   ☐ EPOSHEET
   ☐ Fiber Glass Cloths 등

3. 실제 매입가 정보 입력
   ☐ 폴린트
   ☐ 현대파이버
   ☐ 다른 공급사

그러면 시스템이 완벽하게 동작합니다!
```
