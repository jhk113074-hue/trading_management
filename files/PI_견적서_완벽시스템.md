# Proforma Invoice(견적서) 완벽 시스템 설계
## 고객정보, Incoterms, Payment Term, 납기 모두 포함

---

## 📋 목차
1. [견적서에 필요한 모든 정보](#1-견적서에-필요한-모든-정보)
2. [DB 스키마](#2-db-스키마-완벽-정의)
3. [견적서 작성 화면 설계](#3-견적서-작성-화면-설계)
4. [단계별 구현 (Week 1-2)](#4-단계별-구현-week-1-2)
5. [실제 예시 (YSACC 기준)](#5-실제-예시-ysacc-기준)
6. [API 명세](#6-api-명세)
7. [테스트 케이스](#7-테스트-케이스)

---

## 1. 견적서에 필요한 모든 정보

### 1.1 견적서 헤더 정보 (필수)

```
┌─────────────────────────────────────────────┐
│           PROFORMA INVOICE                  │
├─────────────────────────────────────────────┤
│                                             │
│ PI Number: PI-YSACC-2026-01                │ ★ 자동생성
│ PI Date: 2026-01-15                        │ ★ 오늘
│                                             │
│ From: (공급업체)                             │
│   회사명: (주)와이에스에이씨씨 YSACC       │
│   주소: 청주시 흥덕구 ...                   │
│   TEL: 043-1234-5678                       │
│   Email: contact@ysacc.co.kr              │
│   Website: www.ysacc.co.kr                 │
│                                             │
│ To: (고객사) ★ 필수                         │
│   회사명: UNION (또는 회사 약자)            │
│   주소: PO BOX 1234, Dubai, UAE            │
│   Contact: John Smith                       │
│   Email: john@union.com                     │
│   Phone: +971-4-XXXXXXX                     │
│                                             │
└─────────────────────────────────────────────┘
```

### 1.2 견적서 거래 조건 (필수)

```
┌─────────────────────────────────────────────┐
│        TRADE TERMS & CONDITIONS             │
├─────────────────────────────────────────────┤
│                                             │
│ Incoterms: CIF (Cost, Insurance, Freight)  │ ★
│ 설명: 우리가 운송료/보험료까지 부담        │
│                                             │
│ Destination Port: JEBEL ALI, DUBAI          │ ★
│ (또는: Port of Dubai, Port Said, 등)       │
│                                             │
│ Payment Terms: LC 90 Days                   │ ★
│ 설명: 신용장, B/L 발급 90일 후 결제        │
│                                             │
│ Shipping Method:                            │
│   □ Sea Freight (해상운송) - 일반적        │
│   □ Air Freight (항공운송) - 긴급           │
│   □ Truck (육로운송) - 근거리               │
│                                             │
│ Validity: 30 Days from PI Date              │ ★
│ (2026-01-15 ~ 2026-02-14)                  │
│ 설명: 이 견적서는 30일간 유효               │
│                                             │
│ Remarks/Special Instructions:               │
│   - FOB에서 CIF로 변경 가능                 │
│   - 급할 시 항공운송 가능                   │
│   - Quantity 10% 이상 시 할인 가능         │
│                                             │
└─────────────────────────────────────────────┘
```

### 1.3 상품 정보 (반복 - 1개 이상)

```
┌─────────────────────────────────────────────────────────┐
│ ITEMS / LINE DETAILS                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Item 1:                                                 │
│   Product: Cushion Pad (EVA Foam)           ★          │
│   Description: Ø30×25mm, Color: Black                  │
│   Qty: 50                                   ★          │
│   Unit: KG                                  ★          │
│   Unit Price: USD 3.78 / KG                 ★          │
│   Total: USD 189.00                         ★ 자동계산│
│                                                         │
│ Item 2:                                                 │
│   Product: EPOSHEET                         ★          │
│   Description: Thickness 3mm, 1000×1000mm              │
│   Qty: 10                                   ★          │
│   Unit: BOX                                 ★          │
│   Unit Price: USD 213.79 / BOX              ★          │
│   Total: USD 2,137.90                       ★ 자동계산│
│                                                         │
│ ...                                                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 1.4 금액 정보 (자동 계산)

```
┌──────────────────────────┐
│     PRICING SUMMARY      │
├──────────────────────────┤
│                          │
│ Subtotal: USD 2,326.90   │ ★ 자동계산
│ (All items)              │
│                          │
│ Handling/Packaging:      │ (선택)
│ + USD 0.00               │
│                          │
│ Freight Charges:         │ (CIF의 경우)
│ + USD 150.00             │
│ (Estimate based on weight)│
│                          │
│ Insurance:               │ (CIF의 경우)
│ + USD 30.00              │
│ (Approx 1.3% of FOB)     │
│                          │
│ ─────────────────────    │
│ Grand Total: USD 2,506.90│ ★ 자동계산
│                          │
│ Note: All prices in      │
│ US Dollar (USD)          │
│                          │
└──────────────────────────┘
```

### 1.5 은행 정보 & 추가 정보

```
┌──────────────────────────────────────────┐
│      BANKING INFORMATION                 │
├──────────────────────────────────────────┤
│                                          │
│ Bank Name: Industrial Bank of Korea      │
│ (IBK International)                      │
│                                          │
│ Account Name: YSACC CO., LTD             │
│ Account Number: 143-129260-56-00012      │
│ Swift Code: IBKOKRSEXXX                  │
│                                          │
│ Correspondent Bank:                      │
│ Bank of America, New York                │
│ SWIFT: BOFAUS3N                          │
│                                          │
│ Note: Please indicate PI Number in       │
│ remittance details                       │
│                                          │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│    ADDITIONAL INFORMATION                │
├──────────────────────────────────────────┤
│                                          │
│ 1. Documents Required:                   │
│    ☐ Commercial Invoice                 │
│    ☐ Packing List                       │
│    ☐ Bill of Lading (B/L)               │
│    ☐ Certificate of Origin (CO)         │
│                                          │
│ 2. Inspection:                           │
│    Third party inspection by SGS         │
│    or Intertek (Buyer's account)         │
│                                          │
│ 3. Quality Assurance:                    │
│    100% inspection before shipment       │
│                                          │
│ 4. Returns/Claims:                       │
│    Claims must be made within            │
│    15 days of receipt                    │
│                                          │
└──────────────────────────────────────────┘
```

### 1.6 서명 & 유효성

```
┌──────────────────────────────────────────┐
│    VALIDITY & AUTHORIZATION              │
├──────────────────────────────────────────┤
│                                          │
│ This quotation is valid for:             │
│ 30 days from the date hereof             │
│ Valid Until: 2026-02-14                  │
│                                          │
│ Prepared by:                             │
│ Name: Kim Young-up (Sales Manager)       │
│ Date: 2026-01-15                         │
│ Signature: _________________             │
│                                          │
│ Company Seal: [YSACC SEAL]              │
│                                          │
│ E-mail: kim@ysacc.co.kr                 │
│ Tel: +82-43-1234-5678                   │
│                                          │
└──────────────────────────────────────────┘
```

---

## 2. DB 스키마 (완벽 정의)

### 2.1 테이블: proforma_invoices (PI 헤더)

```sql
CREATE TABLE proforma_invoices (
  pi_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  
  -- PI 번호 & 날짜
  pi_number VARCHAR(100) NOT NULL UNIQUE,           -- PI-YSACC-2026-01
  pi_date DATE NOT NULL,                            -- 2026-01-15
  
  -- 고객 정보 ★
  customer_id UUID NOT NULL REFERENCES customers(customer_id),
  
  -- 거래 조건 ★★★
  incoterms VARCHAR(50) NOT NULL,                   -- CIF, FOB, DDP 등
  destination_port VARCHAR(255) NOT NULL,           -- JEBEL ALI, DUBAI
  destination_country VARCHAR(100),                 -- UAE
  
  payment_terms VARCHAR(100) NOT NULL,              -- LC 90 Days, 현금선불
  shipping_method VARCHAR(50),                      -- Sea, Air, Truck
  
  -- 환율 & 금액
  exchange_rate DECIMAL(10,4) NOT NULL,             -- 1468.96
  default_profit_margin DECIMAL(5,2),               -- 0.10 (10%)
  
  -- 유효기간
  validity_days INT DEFAULT 30,                     -- 30일
  valid_until_date DATE,                            -- 2026-02-14 (자동계산)
  
  -- 상태
  current_version VARCHAR(10) DEFAULT 'A',          -- A, B, C...
  status VARCHAR(50) DEFAULT 'draft',               -- draft, sent, confirmed
  
  -- 특수 사항
  remarks TEXT,                                     -- FOB로 변경 가능, 할인 조건 등
  handling_charges DECIMAL(12,2) DEFAULT 0,         -- 포장료
  freight_charges DECIMAL(12,2) DEFAULT 0,          -- 운송료 (CIF의 경우)
  insurance_charges DECIMAL(12,2) DEFAULT 0,        -- 보험료 (CIF의 경우)
  
  -- 금액 (자동 계산)
  subtotal_usd DECIMAL(15,4),                       -- 모든 상품 합
  total_usd DECIMAL(15,4),                          -- 최종 합계
  
  -- 추적
  created_by UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP,                                -- 이메일 발송일
  sent_by UUID REFERENCES users(user_id),
  confirmed_at TIMESTAMP,                           -- 고객 확정일
  
  CONSTRAINT unique_pi_number UNIQUE(company_id, pi_number)
);

-- 인덱스
CREATE INDEX idx_pi_company ON proforma_invoices(company_id);
CREATE INDEX idx_pi_customer ON proforma_invoices(customer_id);
CREATE INDEX idx_pi_status ON proforma_invoices(status);
CREATE INDEX idx_pi_incoterms ON proforma_invoices(incoterms);
```

### 2.2 테이블: pi_revisions (Revision 관리)

```sql
CREATE TABLE pi_revisions (
  pr_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_id UUID NOT NULL REFERENCES proforma_invoices(pi_id) ON DELETE CASCADE,
  
  -- Revision 정보
  version VARCHAR(10) NOT NULL,                     -- A, B, C...
  revision_number INT,                              -- 1, 2, 3...
  
  -- 거래 조건 (Revision별로 달라질 수 있음)
  incoterms VARCHAR(50),
  destination_port VARCHAR(255),
  payment_terms VARCHAR(100),
  validity_days INT,
  exchange_rate DECIMAL(10,4),
  
  -- Revision 이유
  revision_reason VARCHAR(500),                     -- "공급처 가격 변경", "고객 요청"
  related_negotiation_id UUID,
  
  -- 상태
  status VARCHAR(50) DEFAULT 'draft',               -- draft, sent, confirmed, rejected
  customer_feedback TEXT,                           -- "가격 좀 낮춰주세요"
  feedback_received_at TIMESTAMP,
  
  -- 금액
  subtotal_usd DECIMAL(15,4),
  total_usd DECIMAL(15,4),
  
  -- 추적
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(user_id),
  sent_at TIMESTAMP,
  
  CONSTRAINT unique_pi_version UNIQUE(pi_id, version)
);

CREATE INDEX idx_pr_company ON pi_revisions(company_id);
CREATE INDEX idx_pr_pi ON pi_revisions(pi_id);
```

### 2.3 테이블: pi_revision_line_items (라인 아이템)

```sql
CREATE TABLE pi_revision_line_items (
  pril_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_revision_id UUID NOT NULL REFERENCES pi_revisions(pr_id) ON DELETE CASCADE,
  
  -- 상품 정보
  product_id UUID NOT NULL REFERENCES products(product_id),
  description VARCHAR(500),                         -- "Ø30×25mm, Color: Black"
  
  -- 매입가
  cost_master_id UUID REFERENCES cost_master(cm_id),
  cost_krw DECIMAL(12,2) NOT NULL,                  -- 5000
  supplier_id UUID REFERENCES suppliers(supplier_id),
  
  -- 수량
  quantity DECIMAL(10,2) NOT NULL,                  -- 50
  unit VARCHAR(50) NOT NULL,                        -- KG
  
  -- 환율
  exchange_rate DECIMAL(10,4) NOT NULL,
  
  -- 이익률 & 판매가
  profit_margin DECIMAL(5,2) NOT NULL,              -- 0.10 (10%)
  cost_usd DECIMAL(12,4),                           -- 자동계산: 5000/1468.96
  sale_price_usd DECIMAL(12,4) NOT NULL,            -- 자동계산: 3.78
  line_total_usd DECIMAL(15,4) NOT NULL,            -- 자동계산: 189
  
  -- 변경 이력
  change_reason TEXT,
  previous_sale_price_usd DECIMAL(12,4),
  price_change_percent DECIMAL(5,2),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pril_company ON pi_revision_line_items(company_id);
CREATE INDEX idx_pril_revision ON pi_revision_line_items(pi_revision_id);
```

### 2.4 초기 데이터 예시

```sql
-- 고객 데이터
INSERT INTO customers (
  customer_id, company_id, name, country, city, address,
  contact_person, email, phone, payment_terms, status
) VALUES (
  'union_uuid',
  'ysacc_uuid',
  'UNION',
  'UAE',
  'DUBAI',
  'PO BOX 1234, Dubai, UAE',
  'John Smith',
  'john@union.com',
  '+971-4-XXXXXXX',
  'LC 90 Days',
  'active'
);

-- PI 생성 (UNION 고객)
INSERT INTO proforma_invoices (
  pi_id, company_id, pi_number, pi_date, customer_id,
  incoterms, destination_port, destination_country,
  payment_terms, exchange_rate, validity_days, valid_until_date,
  remarks, created_by
) VALUES (
  'pi_001_uuid',
  'ysacc_uuid',
  'PI-YSACC-2026-01',
  '2026-01-15',
  'union_uuid',
  'CIF',
  'JEBEL ALI',
  'UAE',
  'LC 90 Days',
  1468.96,
  30,
  '2026-02-14',
  'FOB로 변경 가능, 수량 10% 이상 시 할인',
  'kim_user_uuid'
);
```

---

## 3. 견적서 작성 화면 설계

### 3.1 전체 화면 레이아웃

```
┌────────────────────────────────────────────────────────────┐
│  Proforma Invoice 작성                  [뒤로] [저장] [확정] │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  [Section 1: PI 기본 정보]                                │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ PI Number: PI-YSACC-2026-01 [읽기전용]              │ │
│  │ PI Date: [2026-01-15] (오늘)                        │ │
│  │                                                      │ │
│  │ Customer: [UNION 🔍] ★ 필수                         │ │
│  │ └─ Contact: John Smith <john@union.com>            │ │
│  │ └─ Address: PO BOX 1234, Dubai, UAE                │ │
│  │ └─ Country: UAE                                    │ │
│  │ └─ Payment Terms: LC 90 Days (자동로드)             │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  [Section 2: 거래 조건] ★★★ 핵심                         │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Incoterms: [CIF ▼] ★ 필수                           │ │
│  │ └─ CIF: 우리가 운송비+보험료 부담                   │ │
│  │ └─ FOB: 구매자가 운송비 부담                        │ │
│  │ └─ DDP: 우리가 전부 부담                            │ │
│  │                                                      │ │
│  │ Destination Port: [JEBEL ALI ________]             │ │
│  │ (또는: Dubai, Port Said, Singapore 등)            │ │
│  │                                                      │ │
│  │ Payment Terms: [LC 90 Days ▼]                      │ │
│  │ └─ 신용장, B/L 발급 후 90일 결제                   │ │
│  │                                                      │ │
│  │ Shipping Method: [Sea Freight ▼]                   │ │
│  │ └─ Sea: 해상 (일반적, 저렴)                        │ │
│  │ └─ Air: 항공 (빠름, 비쌈)                          │ │
│  │ └─ Truck: 육로 (근거리)                             │ │
│  │                                                      │ │
│  │ Validity: [30] Days                                 │ │
│  │ (Valid Until: 2026-02-14)                           │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  [Section 3: 환율 & 이익률]                              │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Exchange Rate: [1468.96] [최신가 가져오기]          │ │
│  │ 최신: 1469.50 (2026-01-15 10:30)                    │ │
│  │                                                      │ │
│  │ Default Profit Margin: [10] % ★                     │ │
│  │ (각 라인에서 수정 가능)                              │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  [Section 4: 상품 라인] ★★★                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ [+ 상품 추가]                                        │ │
│  │                                                      │ │
│  │ # Product    Desc      Qty  Unit Cost KRW Margin    │ │
│  │ ──────────────────────────────────────────────────── │ │
│  │ 1 Cushion Pad Ø30×25mm  50   KG  5000   10%        │ │
│  │  │ Cost USD: 3.40   Sale: 3.78   Total: 189        │ │
│  │ 2 EPOSHEET   3mm thick  10  BOX  28000   10%        │ │
│  │  │ Cost USD: 19.06  Sale: 21.18  Total: 211.8      │ │
│  │                                                      │ │
│  │ [삭제] [수정]                                        │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  [Section 5: 추가 비용]                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Handling/Packaging: [0.00] USD                       │ │
│  │ Freight Charges (CIF): [150.00] USD                  │ │
│  │ Insurance (CIF): [30.00] USD                         │ │
│  │                                                      │ │
│  │ Note: CIF 선택 시만 운송료/보험료 입력             │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  [Section 6: 금액 합계]                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Subtotal:      USD 2,326.90                          │ │
│  │ Handling:      USD 0.00                              │ │
│  │ Freight:       USD 150.00                            │ │
│  │ Insurance:     USD 30.00                             │ │
│  │ ────────────────────────                             │ │
│  │ Grand Total:   USD 2,506.90                          │ │
│  │                                                      │ │
│  │ 환산 (참고): KRW 3,681,090,000 (약 3.68B KRW)       │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  [Section 7: 추가 정보]                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Remarks/Notes:                                       │ │
│  │ [FOB 변경 가능]                                     │ │
│  │ [수량 10% 이상 할인]                                │ │
│  │ [긴급할 시 항공운송 가능]                           │ │
│  │                                                      │ │
│  │ Bank Information:                                    │ │
│  │ □ Display on PI (은행정보 표시)                     │ │
│  │                                                      │ │
│  │ Documents Required:                                  │ │
│  │ ☑ Commercial Invoice  ☑ Packing List               │ │
│  │ ☑ B/L                 ☑ Certificate of Origin       │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  [버튼]                                                   │
│  [임시저장] [확정] [PDF 미리보기] [PDF 다운로드]         │
│  [Excel 다운로드] [이메일 발송] [고객에게 공유]         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 3.2 Customer 선택 드롭다운 (상세)

```
Customer: [UNION 🔍]

드롭다운 선택 시 자동으로 로드되는 정보:

┌────────────────────────────────────────┐
│ UNION                                  │
│                                        │
│ 기본 정보:                             │
│  회사명: UNION                        │
│  국가: UAE                             │
│  도시: DUBAI                           │
│                                        │
│ 연락처:                                │
│  담당자: John Smith                    │
│  이메일: john@union.com               │
│  전화: +971-4-XXXXXXX                 │
│                                        │
│ 배송 주소:                             │
│  PO BOX 1234, Dubai, UAE             │
│                                        │
│ 거래 조건:                             │
│  결제조건: LC 90 Days                 │
│  선호 Incoterms: CIF                 │
│  통상 선적지: JEBEL ALI              │
│                                        │
│ [선택]                                 │
│                                        │
└────────────────────────────────────────┘

선택 시:
  - Contact: John Smith <john@union.com> 자동 표시
  - Payment Terms: LC 90 Days 자동 로드
  - Destination Port: JEBEL ALI 자동 제시
  - Incoterms: CIF 자동 제시
```

### 3.3 Product 선택 & Cost Master 자동 로드

```
[상품 추가] 클릭 시:

┌────────────────────────────────────────┐
│ 상품 추가                              │
├────────────────────────────────────────┤
│                                        │
│ Product: [Cushion Pad 🔍]  ★★★       │
│                                        │
│ Cushion Pad 선택 시:                   │
│                                        │
│ ✓ 최신 매입가 자동 로드:               │
│   Cost KRW: 5,000 (폴린트, PO-2026-001)│
│   Supplier: 폴린트                    │
│   Effective Date: 2026-01-15          │
│                                        │
│ ✓ 자동 계산:                           │
│   Cost USD = 5000 / 1468.96 = 3.40   │
│   Exchange Rate: 1468.96              │
│                                        │
│ Description: [Ø30×25mm, Color: Black] │
│                                        │
│ Quantity: [50]                         │
│ Unit: [KG ▼]                          │
│                                        │
│ Profit Margin: [10] %  ★★             │
│ (기본값 10%, 수정 가능)               │
│                                        │
│ ✓ 판매가 자동 계산:                    │
│   Sale Price USD = 3.40 / (1-0.10)    │
│              = 3.40 / 0.9             │
│              = 3.78 USD               │
│                                        │
│ ✓ 라인 합계:                           │
│   Total USD = 3.78 × 50 = 189 USD    │
│                                        │
│ [추가] [취소]                         │
│                                        │
└────────────────────────────────────────┘
```

---

## 4. 단계별 구현 (Week 1-2)

### Week 1: DB 스키마 & 고객 관리

#### Day 1 (Mon): Customers 테이블 완벽 정의

```sql
-- Customers 테이블 (고객 정보)
CREATE TABLE customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  
  -- 기본 정보
  name VARCHAR(255) NOT NULL,                       -- UNION
  business_number VARCHAR(20),
  
  -- 주소 정보 ★
  country VARCHAR(100) NOT NULL,                    -- UAE
  city VARCHAR(100),                                -- DUBAI
  address VARCHAR(500),                             -- PO BOX 1234
  zip_code VARCHAR(20),
  
  -- 연락처 ★
  contact_person VARCHAR(100),                      -- John Smith
  contact_title VARCHAR(100),                       -- Manager, Director
  email VARCHAR(100),
  phone VARCHAR(20),
  fax VARCHAR(20),
  
  -- 거래 조건 ★★★
  payment_terms VARCHAR(100),                       -- LC 90 Days
  preferred_incoterms VARCHAR(50),                  -- CIF, FOB
  preferred_port VARCHAR(255),                      -- JEBEL ALI
  preferred_shipping_method VARCHAR(50),            -- Sea, Air
  credit_limit DECIMAL(15,2),
  
  -- 상태
  status VARCHAR(50) DEFAULT 'active',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX idx_customer_company ON customers(company_id);
CREATE INDEX idx_customer_country ON customers(country);

-- 샘플 데이터
INSERT INTO customers VALUES (
  'union_uuid',
  'ysacc_uuid',
  'UNION',
  NULL,
  'UAE',
  'DUBAI',
  'PO BOX 1234, Dubai, UAE',
  NULL,
  'John Smith',
  'Manager',
  'john@union.com',
  '+971-4-XXXXXXX',
  '+971-4-YYYYYYY',
  'LC 90 Days',
  'CIF',
  'JEBEL ALI',
  'Sea Freight',
  500000,
  'active',
  NOW(),
  NOW()
);

소요 시간: 30분
```

#### Day 2 (Tue): PI 테이블 생성

```sql
CREATE TABLE proforma_invoices (
  pi_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  
  pi_number VARCHAR(100) NOT NULL UNIQUE,
  pi_date DATE NOT NULL,
  
  -- 고객 정보 ★
  customer_id UUID NOT NULL REFERENCES customers(customer_id),
  
  -- 거래 조건 ★★★
  incoterms VARCHAR(50) NOT NULL,
  destination_port VARCHAR(255) NOT NULL,
  destination_country VARCHAR(100),
  payment_terms VARCHAR(100) NOT NULL,
  shipping_method VARCHAR(50),
  
  -- 환율 & 금액
  exchange_rate DECIMAL(10,4) NOT NULL,
  default_profit_margin DECIMAL(5,2),
  
  -- 유효기간
  validity_days INT DEFAULT 30,
  valid_until_date DATE,
  
  -- 상태
  current_version VARCHAR(10) DEFAULT 'A',
  status VARCHAR(50) DEFAULT 'draft',
  
  -- 추가 비용
  remarks TEXT,
  handling_charges DECIMAL(12,2) DEFAULT 0,
  freight_charges DECIMAL(12,2) DEFAULT 0,
  insurance_charges DECIMAL(12,2) DEFAULT 0,
  
  -- 금액 (자동 계산)
  subtotal_usd DECIMAL(15,4),
  total_usd DECIMAL(15,4),
  
  -- 추적
  created_by UUID NOT NULL REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP,
  sent_by UUID REFERENCES users(user_id),
  confirmed_at TIMESTAMP
);

CREATE SEQUENCE pi_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION generate_pi_number()
RETURNS TRIGGER AS $$
DECLARE
  v_company_code VARCHAR(50);
BEGIN
  SELECT company_code INTO v_company_code
  FROM companies WHERE company_id = NEW.company_id;
  
  IF NEW.pi_number IS NULL THEN
    NEW.pi_number := 'PI-' || v_company_code || '-'
                     || TO_CHAR(NEW.pi_date, 'YYYY') || '-'
                     || LPAD(nextval('pi_number_seq')::text, 2, '0');
  END IF;
  
  -- valid_until_date 자동 계산
  NEW.valid_until_date := NEW.pi_date + (NEW.validity_days || ' days')::INTERVAL;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pi_number
BEFORE INSERT ON proforma_invoices
FOR EACH ROW
EXECUTE FUNCTION generate_pi_number();

소요 시간: 45분
```

#### Day 3 (Wed): Revision & Line Items 테이블

```sql
CREATE TABLE pi_revisions (
  pr_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_id UUID NOT NULL REFERENCES proforma_invoices(pi_id) ON DELETE CASCADE,
  
  version VARCHAR(10) NOT NULL,
  revision_number INT,
  
  -- 거래 조건 (각 revision별로 다를 수 있음)
  incoterms VARCHAR(50),
  destination_port VARCHAR(255),
  payment_terms VARCHAR(100),
  validity_days INT,
  exchange_rate DECIMAL(10,4),
  
  -- Revision 이유
  revision_reason VARCHAR(500),
  related_negotiation_id UUID,
  
  -- 상태
  status VARCHAR(50) DEFAULT 'draft',
  customer_feedback TEXT,
  feedback_received_at TIMESTAMP,
  
  -- 금액
  subtotal_usd DECIMAL(15,4),
  total_usd DECIMAL(15,4),
  
  -- 추적
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(user_id),
  sent_at TIMESTAMP,
  
  CONSTRAINT unique_pi_version UNIQUE(pi_id, version)
);

CREATE TABLE pi_revision_line_items (
  pril_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_revision_id UUID NOT NULL REFERENCES pi_revisions(pr_id) ON DELETE CASCADE,
  
  -- 상품
  product_id UUID NOT NULL REFERENCES products(product_id),
  description VARCHAR(500),
  
  -- 매입가
  cost_master_id UUID REFERENCES cost_master(cm_id),
  cost_krw DECIMAL(12,2) NOT NULL,
  supplier_id UUID REFERENCES suppliers(supplier_id),
  
  -- 수량
  quantity DECIMAL(10,2) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  
  -- 환율 & 계산
  exchange_rate DECIMAL(10,4) NOT NULL,
  profit_margin DECIMAL(5,2) NOT NULL,
  cost_usd DECIMAL(12,4),
  sale_price_usd DECIMAL(12,4) NOT NULL,
  line_total_usd DECIMAL(15,4) NOT NULL,
  
  -- 변경 이력
  change_reason TEXT,
  previous_sale_price_usd DECIMAL(12,4),
  price_change_percent DECIMAL(5,2),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

소요 시간: 45분
```

#### Day 4 (Thu): PI 작성 화면 구현 (AntiGravity)

```
AntiGravity Page Builder:

1. Page 생성: ProformaInvoicePage

2. Section 1: PI 기본 정보
   Components:
     - PI Number: Text (Read-only)
       Binding: {{ piData.pi_number }}
     - PI Date: Date Picker
       Binding: {{ piData.pi_date }}
       Default: Today
     - Customer: Dropdown
       Data Source: SELECT * FROM customers WHERE company_id = {{ currentCompanyId }}
       Display: {{ customer_name }}
       onChange: {{ onCustomerSelected() }}

3. Section 2: 거래 조건 ★★★
   Components:
     - Incoterms: Dropdown
       Options: CIF, FOB, DDP, EXW
       onChange: {{ onIncotermsChanged() }}
     
     - Destination Port: Text Input
       Suggestions: "JEBEL ALI", "Port Said", "Singapore"
     
     - Payment Terms: Dropdown (고객 선택 시 자동로드)
       Binding: {{ piData.payment_terms }}
     
     - Shipping Method: Radio Button
       Options: Sea Freight, Air Freight, Truck
     
     - Validity Days: Number Input
       Default: 30
       onChange: {{ calculateValidUntilDate() }}
     
     - Valid Until: Text (Read-only)
       Binding: {{ piData.valid_until_date }}

4. Section 3: 환율 & 이익률
   Components:
     - Exchange Rate: Number Input
       Binding: {{ piData.exchange_rate }}
       onChange: {{ recalculateAll() }}
     
     - Default Profit Margin: Number Input (%)
       Binding: {{ piData.default_profit_margin }}

5. Section 4: 상품 라인
   Component: Data Table (In-Memory)
   [상품 추가] 버튼
   
   Columns:
     - Product: Dropdown
       onChange: {{ loadCostMaster() }}
     - Description: Text
       Auto-complete 제시
     - Qty: Number
     - Unit: Dropdown
     - Cost KRW: Text (Read-only, 자동로드)
     - Margin: Number (%)
     - Sale USD: Text (Read-only, 자동계산)
     - Total USD: Text (Read-only, 자동계산)
     - [Delete]

6. Section 5: 추가 비용
   Components:
     - Handling Charges: Number
     - Freight Charges: Number (CIF만)
     - Insurance Charges: Number (CIF만)

7. Section 6: 금액 합계
   Components:
     - Subtotal: Text (Read-only, 자동계산)
     - Handling: Text
     - Freight: Text
     - Insurance: Text
     - Grand Total: Text (Read-only, 자동계산)

8. Section 7: 추가 정보
   Components:
     - Remarks: Text Area
     - Bank Info: Checkbox
     - Documents: Checkboxes

소요 시간: 2시간
```

#### Day 5 (Fri): 핵심 동작 & 테스트

```
구현할 동작:

1. Customer 선택 시:
   Action: onCustomerSelected()
   ├─ Contact: John Smith 자동 표시
   ├─ Payment Terms: LC 90 Days 자동 로드
   ├─ Incoterms: CIF 자동 제시
   └─ Destination Port: JEBEL ALI 자동 제시

2. Product 선택 시:
   Action: loadCostMaster()
   ├─ cost_master 조회
   ├─ Cost KRW: 5000 로드
   ├─ Cost USD: 5000/1468.96 = 3.40 계산
   └─ Sale Price USD: 3.40/0.9 = 3.78 계산

3. 수량 또는 환율 변경 시:
   Action: recalculateAll()
   ├─ 모든 라인 재계산
   └─ 전체 합계 업데이트

4. PI 저장 시:
   Action: savePIWithRevision()
   ├─ PI 저장 (version A)
   ├─ Revision A 생성
   └─ Line Items 저장

테스트:
  ☐ Customer 선택 → 정보 자동로드
  ☐ Product 선택 → 매입가 자동로드
  ☐ 판매가 계산: 10% = 3.78 USD ✓
  ☐ PI 저장 및 번호 생성: PI-YSACC-2026-01 ✓

소요 시간: 2시간
```

### Week 2: PDF/Excel & 고급 기능

#### Day 1-2: PDF 생성

```
PDF 템플릿: PI-YSACC-2026-01.pdf

[YSACC 로고]

PROFORMA INVOICE

PI #: PI-YSACC-2026-01
Date: 2026-01-15
Valid Until: 2026-02-14

FROM:                              TO:
(주)와이에스에이씨씨             UNION
청주시 ...                        PO BOX 1234, Dubai, UAE
043-1234-5678                    Contact: John Smith
contact@ysacc.co.kr              john@union.com

─────────────────────────────────────────────

TRADE TERMS & CONDITIONS:
Incoterms: CIF
Destination: JEBEL ALI, UAE
Payment Terms: LC 90 Days
Shipping: Sea Freight
Validity: 30 Days

─────────────────────────────────────────────

ITEMS:
No. | Product | Desc | Qty | Unit | Unit Price | Total
1   | Cushion | Ø30  | 50  | KG   | USD 3.78   | USD 189.00
    | Pad     |      |     |      |            |
2   | EPOSHEET| 3mm  | 10  | BOX  | USD 213.79 | USD 2,137.90

─────────────────────────────────────────────

SUMMARY:
Subtotal:                            USD 2,326.90
Freight Charges (CIF):               USD 150.00
Insurance (CIF):                     USD 30.00
────────────────────────────────────────────────
GRAND TOTAL:                         USD 2,506.90

─────────────────────────────────────────────

BANKING INFORMATION:
Bank: Industrial Bank of Korea
Account: 143-129260-56-00012
Swift: IBKOKRSEXXX

─────────────────────────────────────────────

Prepared by: Kim Young-up
Date: 2026-01-15
[COMPANY SEAL]

소요 시간: 2시간
```

#### Day 3: Excel Export

```
Sheet 1: PI Summary
  - PI Number
  - Customer
  - Date
  - Incoterms
  - Destination
  - Payment Terms
  - Exchange Rate
  - Validity

Sheet 2: Line Items
  Product | Description | Qty | Unit | Cost KRW | Cost USD | Margin | Sale Price | Total USD

Sheet 3: Pricing
  Subtotal
  Freight
  Insurance
  Grand Total (USD)
  Grand Total (KRW)

소요 시간: 1.5시간
```

#### Day 4: 이메일 발송

```
기능:
  1. PI 작성 완료 → [이메일 발송] 버튼
  2. 수신자: customer_email (자동로드)
  3. CC: 영업팀, 재정팀
  4. 제목: "Proforma Invoice PI-YSACC-2026-01"
  5. 본문:
     - 회사 인사말
     - PI 요약 정보
     - 다운로드 링크
  6. 첨부: PDF 파일

소요 시간: 1.5시간
```

#### Day 5: 통합 테스트

```
테스트 시나리오:

1. PI 작성 완료
   ☑ PI-YSACC-2026-01 생성됨
   ☑ 고객: UNION
   ☑ Incoterms: CIF
   ☑ Destination: JEBEL ALI
   ☑ Payment Terms: LC 90 Days
   ☑ Grand Total: USD 2,506.90

2. PDF 생성
   ☑ 모든 정보 포함
   ☑ 금액 정확함
   ☑ 형식 전문성 있음

3. Excel Export
   ☑ 모든 라인 아이템
   ☑ 금액 계산 정확

4. 이메일 발송
   ☑ john@union.com 으로 발송
   ☑ 제목/본문 정확
   ☑ PDF 첨부됨

소요 시간: 2시간
```

---

## 5. 실제 예시 (YSACC 기준)

### 5.1 고객사: UNION (UAE)

```
고객 정보:
  회사명: UNION
  국가: UAE
  도시: DUBAI
  주소: PO BOX 1234, Dubai, UAE
  담당자: John Smith (Manager)
  이메일: john@union.com
  전화: +971-4-XXXXXXX
  
  거래 조건:
  - 결제조건: LC 90 Days
  - 선호 Incoterms: CIF
  - 선호 선적지: JEBEL ALI
  - 선호 운송: Sea Freight
```

### 5.2 PI 작성: UNION에게 보낼 견적서

```
PI Number: PI-YSACC-2026-01
PI Date: 2026-01-15
Customer: UNION

거래 조건:
  Incoterms: CIF (우리가 운송비+보험료 부담)
  Destination: JEBEL ALI, UAE
  Payment Terms: LC 90 Days (신용장, B/L 발급 후 90일 결제)
  Shipping: Sea Freight (해상운송)
  Validity: 30 Days (2026-02-14까지 유효)

상품 라인:

1. Cushion Pad
   - 규격: Ø30×25mm, Color: Black
   - 수량: 50 KG
   - 매입가: 5,000 KRW/KG (폴린트, PO-2026-001에서)
   - 매입가 USD: 5,000 / 1,468.96 = 3.40 USD/KG
   - 이익률: 10%
   - 판매가: 3.40 / (1-0.10) = 3.40 / 0.9 = 3.78 USD/KG
   - 소계: 3.78 × 50 = 189 USD

2. EPOSHEET
   - 규격: Thickness 3mm, 1000×1000mm
   - 수량: 10 BOX
   - 매입가: 28,000 KRW/BOX (폴린트)
   - 매입가 USD: 28,000 / 1,468.96 = 19.06 USD/BOX
   - 이익률: 10%
   - 판매가: 19.06 / 0.9 = 21.18 USD/BOX
   - 소계: 21.18 × 10 = 211.80 USD

금액:
  Subtotal: 189 + 211.80 = 400.80 USD
  
  추가 비용 (CIF):
  - Handling/Packaging: 0 USD
  - Freight (예상): 150 USD
  - Insurance (예상): 30 USD
  
  Grand Total: 400.80 + 150 + 30 = 580.80 USD

은행정보:
  Bank: Industrial Bank of Korea
  Account: 143-129260-56-00012
  Swift: IBKOKRSEXXX

비고:
  - FOB로 변경 가능 (구매자가 운송비 부담)
  - 수량 10% 이상 시 가격 협상 가능
  - 긴급한 경우 항공운송 가능

작성자: Kim Young-up (Sales Manager)
날짜: 2026-01-15
```

---

## 6. API 명세

### 6.1 PI 작성 API

```
POST /api/proforma-invoices

요청:
{
  "company_id": "ysacc_uuid",
  "customer_id": "union_uuid",
  "pi_date": "2026-01-15",
  
  // 거래 조건 ★★★
  "incoterms": "CIF",
  "destination_port": "JEBEL ALI",
  "destination_country": "UAE",
  "payment_terms": "LC 90 Days",
  "shipping_method": "Sea Freight",
  
  // 환율 & 이익률
  "exchange_rate": 1468.96,
  "default_profit_margin": 0.10,
  
  // 유효기간
  "validity_days": 30,
  
  // 추가 비용
  "handling_charges": 0,
  "freight_charges": 150,
  "insurance_charges": 30,
  
  // 비고
  "remarks": "FOB로 변경 가능",
  
  // 라인 아이템
  "line_items": [
    {
      "product_id": "cushion_uuid",
      "description": "Ø30×25mm, Color: Black",
      "quantity": 50,
      "unit": "KG",
      "profit_margin": 0.10
    },
    {
      "product_id": "eposheet_uuid",
      "description": "Thickness 3mm",
      "quantity": 10,
      "unit": "BOX",
      "profit_margin": 0.10
    }
  ]
}

응답 (201):
{
  "status": "success",
  "data": {
    "pi_id": "pi_001_uuid",
    "pi_number": "PI-YSACC-2026-01",
    "customer_name": "UNION",
    "customer_address": "PO BOX 1234, Dubai, UAE",
    "incoterms": "CIF",
    "destination_port": "JEBEL ALI",
    "payment_terms": "LC 90 Days",
    "exchange_rate": 1468.96,
    "validity_until": "2026-02-14",
    "current_version": "A",
    "status": "draft",
    
    "line_items": [
      {
        "product_name": "Cushion Pad",
        "quantity": 50,
        "unit": "KG",
        "cost_krw": 5000,
        "cost_usd": 3.40,
        "profit_margin": 0.10,
        "sale_price_usd": 3.78,
        "line_total_usd": 189
      },
      {
        "product_name": "EPOSHEET",
        "quantity": 10,
        "unit": "BOX",
        "cost_krw": 28000,
        "cost_usd": 19.06,
        "profit_margin": 0.10,
        "sale_price_usd": 21.18,
        "line_total_usd": 211.80
      }
    ],
    
    "subtotal_usd": 400.80,
    "freight_charges": 150,
    "insurance_charges": 30,
    "total_usd": 580.80,
    
    "created_at": "2026-01-15T10:30:00Z"
  }
}
```

### 6.2 PI 조회 API

```
GET /api/proforma-invoices/{{ pi_id }}

응답:
{
  "pi_id": "pi_001_uuid",
  "pi_number": "PI-YSACC-2026-01",
  "current_version": "A",
  
  // 고객 정보
  "customer": {
    "name": "UNION",
    "address": "PO BOX 1234, Dubai, UAE",
    "contact_person": "John Smith",
    "email": "john@union.com"
  },
  
  // 거래 조건
  "incoterms": "CIF",
  "destination_port": "JEBEL ALI",
  "payment_terms": "LC 90 Days",
  "exchange_rate": 1468.96,
  
  // 금액
  "subtotal_usd": 400.80,
  "total_usd": 580.80,
  
  // Revision 이력
  "revisions": [
    {
      "version": "A",
      "created_at": "2026-01-15T10:30:00Z",
      "status": "draft"
    },
    {
      "version": "B",
      "created_at": "2026-01-16T14:00:00Z",
      "status": "sent",
      "revision_reason": "폴린트 가격 인상"
    }
  ]
}
```

### 6.3 PDF 생성 API

```
GET /api/proforma-invoices/{{ pi_id }}/pdf?version=A

응답: PDF 파일 다운로드
  파일명: PI-YSACC-2026-01-A.pdf
```

### 6.4 이메일 발송 API

```
POST /api/proforma-invoices/{{ pi_id }}/send-email

요청:
{
  "to": "john@union.com",
  "cc": ["sales@ysacc.co.kr", "finance@ysacc.co.kr"],
  "subject": "Proforma Invoice PI-YSACC-2026-01",
  "message": "Please find attached the quotation...",
  "include_pdf": true
}

응답:
{
  "status": "success",
  "message": "Email sent to john@union.com",
  "sent_at": "2026-01-15T10:35:00Z"
}
```

---

## 7. 테스트 케이스

### 7.1 PI 작성 테스트

```
테스트 1: 기본 PI 작성
  입력:
    Customer: UNION
    Incoterms: CIF
    Destination: JEBEL ALI
    Cushion Pad 50KG @ 10% margin
  
  예상 결과:
    ☑ PI-YSACC-2026-01 생성
    ☑ Sale Price: 3.78 USD/KG
    ☑ Total: 189 USD
    ☑ Freight: 150 USD (CIF)
    ☑ Grand Total: 339 USD
    ☑ Valid Until: 2026-02-14

테스트 2: Product 선택 시 매입가 자동로드
  입력:
    Cushion Pad 선택
  
  예상 결과:
    ☑ Cost KRW: 5,000 로드
    ☑ Cost USD: 3.40 계산
    ☑ Sale Price: 3.78 계산 (10% margin)

테스트 3: 환율 변경 시 재계산
  입력:
    Exchange Rate: 1468.96 → 1500
  
  예상 결과:
    ☑ Cost USD: 5,000/1500 = 3.33
    ☑ Sale Price: 3.33 / 0.9 = 3.70
    ☑ 모든 금액 재계산됨

테스트 4: 이익률 변경 시 재계산
  입력:
    Profit Margin: 10% → 15%
  
  예상 결과:
    ☑ Sale Price: 3.40 / 0.85 = 4.00 USD
    ☑ 라인 합계: 4.00 × 50 = 200 USD

모두 ☑ = PI 시스템 완성! ✓
```

---

## 최종 체크리스트

```
Week 1:
  ☐ Customers 테이블 (고객 정보 완벽)
  ☐ Proforma Invoices 테이블
  ☐ PI Revisions 테이블
  ☐ PI Line Items 테이블
  ☐ PI 작성 화면 (AntiGravity)
  ☐ Customer 자동로드 동작
  ☐ Product 선택 시 매입가 자동로드
  ☐ 판매가 자동 계산
  ☐ PI 저장 & 번호 생성
  ☐ 테스트 완료

Week 2:
  ☐ PDF 생성
  ☐ Excel Export
  ☐ 이메일 발송
  ☐ 통합 테스트

다음: PO, 협상, Revision 시스템
```

---

## 🎯 **지금 바로 시작하세요!**

```
1. 고객 정보 준비
   UNION 고객 정보를 DB에 입력

2. Week 1부터 시작
   Day 1: Customers 테이블 생성
   Day 2: PI 테이블 생성
   ...

3. 2주 후 완성
   ☑ 완벽한 견적서 시스템
   ☑ 모든 거래 조건 포함
   ☑ PDF & Excel 생성
   ☑ 이메일 자동 발송

준비됐나요? 시작하세요! 🚀
```
