# Revision & 공급처 가격협상 관리 시스템

## 🎯 개념

**견적서는 일회성이 아니라 "지속적인 협상 과정"**

```
초기 견적 (Rev. A)
    ↓
공급처 1 가격 인상 협상
    ↓
Revision B 생성 (새로운 판매가 계산)
    ↓
공급처 2 가격 인하 협상
    ↓
Revision C 생성 (판매가 재계산)
    ↓
... (계속)
    ↓
최종 Revision (Rev. F) 고객 확정
    ↓
PO 발행
```

---

## 1. 데이터 모델 (개선된 설계)

### 1.1 Proforma Invoice 마스터 테이블

```sql
CREATE TABLE proforma_invoices (
  id UUID PRIMARY KEY,
  pi_number VARCHAR(100) UNIQUE,        -- PI-TMS-2026-01
  customer_id UUID FK,
  
  -- 현재 상태
  current_version VARCHAR(10),          -- "F" (현재 버전)
  status VARCHAR(50),                   -- draft, negotiating, confirmed
  
  -- 초기 정보 (변경 불가)
  initial_created_at TIMESTAMP,
  initial_created_by UUID FK,
  
  -- 마지막 수정
  last_modified_at TIMESTAMP,
  last_modified_by UUID FK,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 1.2 Revision 이력 테이블 (★ 핵심)

```sql
CREATE TABLE pi_revisions (
  id UUID PRIMARY KEY,
  pi_id UUID FK,
  version VARCHAR(10),                  -- A, B, C, D, E, F...
  revision_number INT,                  -- 1, 2, 3... (자동 증가)
  
  -- Revision 발생 원인
  revision_reason VARCHAR(255),         -- "공급처 폴린트 가격 인상",
                                        -- "고객 협상 인가",
                                        -- "다른 공급처 추가"
  related_negotiation_id UUID FK,       -- supplier_negotiation 참조
  
  -- 각 Revision의 기본 정보
  customer_id UUID FK,
  exchange_rate DECIMAL(10,4),
  payment_terms VARCHAR(100),
  incoterms VARCHAR(50),
  destination VARCHAR(255),
  validity_days INT,
  
  -- 상태
  status VARCHAR(50),                   -- draft, sent, confirmed, rejected
  
  -- 고객 반응
  customer_feedback TEXT,               -- "가격 좀 낮춰주세요"
  feedback_received_at TIMESTAMP,
  
  -- 추적
  created_at TIMESTAMP,
  created_by UUID FK,
  created_reason TEXT,                  -- "왜 이 Revision을 만들었는가"
  
  CONSTRAINT unique_pi_version UNIQUE (pi_id, version)
);
```

### 1.3 Revision 라인 아이템 (각 Revision의 상품 정보)

```sql
CREATE TABLE pi_revision_line_items (
  id UUID PRIMARY KEY,
  pi_revision_id UUID FK,
  product_id UUID FK,
  
  -- 수량
  quantity DECIMAL(10,2),
  unit VARCHAR(50),
  
  -- 매입가 정보
  cost_master_id UUID FK,               -- 어느 PO의 가격인가
  cost_krw DECIMAL(12,2),               -- 매입가 (KRW)
  supplier_id UUID FK,                  -- 어느 공급처 가격인가
  
  -- 판매가 계산
  exchange_rate DECIMAL(10,4),          -- Revision 발생 당시 환율
  profit_margin DECIMAL(5,2),           -- 10% = 0.10
  sale_price_usd DECIMAL(12,4),         -- 계산 결과
  
  -- 합계
  total_usd DECIMAL(15,4),              -- quantity × sale_price_usd
  
  -- 변경 이력
  change_reason TEXT,                   -- "폴린트 가격 5000→5200 인상"
  previous_sale_price_usd DECIMAL(12,4),-- 이전 Revision의 판매가
  price_change_percent DECIMAL(5,2),    -- 가격 변동률 (%)
  
  created_at TIMESTAMP
);
```

### 1.4 공급처 가격협상 테이블 (★ 중요)

```sql
CREATE TABLE supplier_negotiations (
  id UUID PRIMARY KEY,
  supplier_id UUID FK,                  -- 폴린트
  product_id UUID FK,                   -- Cushion Pad
  
  -- 협상 기본정보
  negotiation_number VARCHAR(100),      -- NEG-2026-001
  negotiation_date DATE,
  status VARCHAR(50),                   -- proposed, negotiating, agreed, rejected
  
  -- 기존 가격 vs 신청 가격
  current_cost_krw DECIMAL(12,2),       -- 현재: 5,000
  proposed_cost_krw DECIMAL(12,2),      -- 신청: 5,200 (인상) or 4,800 (인하)
  change_type VARCHAR(20),              -- increase, decrease
  change_percent DECIMAL(5,2),          -- 4% 인상
  
  -- 협상 이유
  reason TEXT,                          -- "원재료비 상승으로 인한 인상 요청"
  
  -- 우리의 대응
  our_response TEXT,                    -- "현재 고객 가격 유지 불가, 2% 인상만 수용"
  our_counter_offer_krw DECIMAL(12,2),  -- 5,100
  
  -- 결과
  final_agreed_cost_krw DECIMAL(12,2),  -- 최종 합의: 5,100
  agreed_at TIMESTAMP,
  
  -- 영향도
  affected_pi_revisions INT,            -- 영향받을 Revision 개수
  will_trigger_new_revision BOOLEAN,    -- TRUE (새 Revision 생성 필요)
  
  -- 추적
  initiated_by_supplier BOOLEAN,        -- TRUE (공급처 주도)
  sales_person_id UUID FK,              -- 담당 영업
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 1.5 협상 이력 (메시지 로그)

```sql
CREATE TABLE negotiation_messages (
  id UUID PRIMARY KEY,
  negotiation_id UUID FK,
  message_type VARCHAR(50),             -- email, call, meeting, chat
  sender_type VARCHAR(20),              -- supplier, internal
  sender_name VARCHAR(100),
  sender_email VARCHAR(100),
  
  content TEXT,
  attachment_url VARCHAR(500),
  
  created_at TIMESTAMP
);
```

### 1.6 비용 변동 추적 (대시보드용)

```sql
CREATE TABLE cost_change_log (
  id UUID PRIMARY KEY,
  pi_id UUID FK,
  pi_version VARCHAR(10),               -- Revision A→B→C...
  
  product_id UUID FK,
  supplier_id UUID FK,
  
  old_cost_krw DECIMAL(12,2),           -- 이전 매입가
  new_cost_krw DECIMAL(12,2),           -- 새 매입가
  change_percent DECIMAL(5,2),          -- 변동률
  
  old_sale_price_usd DECIMAL(12,4),     -- 이전 판매가
  new_sale_price_usd DECIMAL(12,4),     -- 새 판매가
  sale_price_impact DECIMAL(12,4),      -- 영향도
  
  triggered_revision_id UUID FK,        -- 이것 때문에 생긴 Revision
  
  created_at TIMESTAMP,
  created_by UUID FK
);
```

---

## 2. 실제 프로세스 플로우

### 2.1 초기 견적 (Rev. A)

```
Step 1: 영업팀이 PI 작성
  - 고객: UNION
  - 상품 1개, 수량 50 KG
  - 매입가: 5,000 KRW (폴린트)
  - 이익률: 10%
  → PI-TMS-2026-01 Rev. A 생성
    판매가: 3.78 USD/KG, 합계: 189 USD

Step 2: 고객에게 발송
  - PDF 생성
  - 이메일 발송
  - Status: sent
```

### 2.2 공급처 1 가격 인상 협상

```
Step 1: 폴린트에서 "가격 인상 요청"
  - Negotiation-2026-001 생성
  - 기존 가격: 5,000 KRW
  - 신청 가격: 5,200 KRW (4% 인상)
  - 이유: "원재료비 상승"
  - Status: proposed

Step 2: 우리 대응
  - 검토 → "전체 고객 가격 영향 분석"
  - 반대 제안: 5,100 KRW (2% 인상)
  - 메시지 발송
  - Status: negotiating

Step 3: 합의
  - 폴린트 동의: 5,100 KRW
  - Status: agreed
  - final_agreed_cost_krw = 5,100
  - agreed_at = 2026-01-16

Step 4: 새 Revision 생성 (Rev. B)
  - Revision Reason: "공급처 폴린트 가격 인상 (5000→5100)"
  - 이전 가격: 5,000 KRW
  - 새 가격: 5,100 KRW
  
  자동 계산:
    매입가 USD = 5,100 / 1,468.96 = 3.47 USD
    판매가 USD = 3.47 / 0.9 = 3.86 USD
    합계 USD = 3.86 × 50 = 193 USD
  
  → PI-TMS-2026-01 Rev. B 생성
    이전 판매가: 3.78 USD/KG (189 USD)
    새 판매가: 3.86 USD/KG (193 USD) ← 4 USD 상승

Step 5: 변경 이력 기록
  - cost_change_log에 기록
  - change_percent: +2%
  - sale_price_impact: +4 USD
```

### 2.3 고객과의 협상

```
Step 1: 고객에게 Rev. B 제시
  - "비용 증가로 인해 가격을 4 USD 인상"
  - PDF 발송
  
Step 2: 고객 피드백
  - "이렇게 높으면 안 된다"
  - customer_feedback = "Need to reduce cost"
  - Status: sent (but rejected)
  
Step 3: 우리의 대응
  - 다른 공급처 검토
  - 대안 제시
```

### 2.4 대안 공급처 추가 (Rev. C)

```
Step 1: 다른 공급처 검토
  - 공급처 B: 4,950 KRW (더 싼 가격!)
  - 검토 후 PI Rev. C 생성
  
Step 2: Rev. C (대안 1: 공급처 B 사용)
  - 매입가: 4,950 KRW (공급처 B)
  - 판매가: 3.76 USD/KG
  - 합계: 188 USD ← Rev. A보다 1 USD 저렴!
  
Step 3: 고객에게 제시
  - "원가 절감으로 이전 가격 수준 유지"
  - 다른 공급처로 대체 가능함을 보여줌
```

### 2.5 최종 확정 (Rev. C)

```
Step 1: 고객 동의
  - "Rev. C (공급처 B, 188 USD)로 진행하겠다"
  - Status: confirmed
  
Step 2: PO 발행
  - 공급처 B에게 PO-2026-002 발행
  - 수량 50 KG, 단가 4,950 KRW
  
Step 3: 배송 → Invoice 발행
  - 실제 인보이스: 188 USD 기반
```

---

## 3. Revision 생성 결정 로직

### 3.1 자동 Revision 생성 트리거

```
다음 경우 자동으로 새 Revision이 필요함:

1. 공급처 가격 협상 체결
   └─ final_agreed_cost_krw ≠ current_cost_krw

2. 새로운 공급처 추가
   └─ 더 싼 가격 발견

3. 환율 급변
   └─ 이전 환율 대비 ±3% 이상 변동

4. 고객 요청
   └─ "가격을 조정해달라"

5. 다른 상품 추가/제거
   └─ 총 수량 변경
```

### 3.2 Revision 생성 규칙

```
언제 생성?
  - 자동 또는 수동
  
Revision 번호 규칙:
  - A, B, C, D, E, F... (알파벳 순)
  - 무제한 (Z 이후 AA, AB, ... 로 계속)

각 Revision의 특징:
  - 독립적인 버전 (이전 버전에서 복사 후 수정)
  - 타임스탬프 기록
  - 생성 이유 명시
  - 담당자 기록
```

### 3.3 Revision 비교 기능

```
Rev. A vs Rev. C 비교:
┌─────────────────────────────────────┐
│ Product          │ Rev. A │ Rev. C │
├─────────────────────────────────────┤
│ Cushion Pad      │        │        │
│  - Qty           │  50 KG │  50 KG │
│  - Supplier      │ 폴린트  │ 공급처B │
│  - Cost KRW      │ 5,000  │ 4,950  │
│  - Sale Price    │ 3.78   │ 3.76   │
│  - Total USD     │  189   │  188   │
├─────────────────────────────────────┤
│ SUMMARY          │        │        │
│  - Grand Total   │  189   │  188   │
│  - Change        │    -   │  -1$   │
│  - Reason        │ 초기   │ 공급처 B │
└─────────────────────────────────────┘
```

---

## 4. 공급처 협상 관리 대시보드

### 4.1 진행 중인 협상

```
┌────────────────────────────────────────────┐
│ 협상 진행 현황                              │
├────────────────────────────────────────────┤
│                                            │
│ 진행중: 3건                                 │
│ ├─ NEG-2026-001: 폴린트 (Cushion Pad)     │
│ │  상태: negotiating (5000→5100)          │
│ │  영향도: PI-TMS-2026-01 (Rev B 생성예정)│
│ │  우리 제안: 5,100 KRW (2% 인상)        │
│ │  진행도: 70%                            │
│ │                                         │
│ ├─ NEG-2026-002: EPOSHEET 공급처          │
│ │  상태: proposed (28500→30000)           │
│ │  영향도: 2개 PI 예정                    │
│ │                                         │
│ └─ NEG-2026-003: 새 공급처 검토           │
│    상태: evaluation (4950)                │
│    비고: 더 저렴한 대안 발견               │
│                                            │
│ 합의됨: 2건                                 │
│                                            │
└────────────────────────────────────────────┘
```

### 4.2 협상이 미치는 영향

```
공급처 폴린트 (NEG-2026-001): 가격 인상 5000→5100

영향받는 PI:
  1. PI-TMS-2026-01
     └─ 현재: Rev. A (5000 기반)
     └─ 변경예정: Rev. B (5100 기반)
     └─ 고객: UNION
     └─ 판매가 변동: 189 → 193 USD
     └─ 영향: +4 USD 인상 필요

  2. PI-TMS-2026-02
     └─ 현재: Rev. A (5000 기반)
     └─ 변경예정: Rev. B (5100 기반)
     └─ 고객: THERMOSET
     └─ 판매가 변동: 235 → 243 USD
     └─ 영향: +8 USD 인상 필요

요약:
  - 영향받는 PI: 2개
  - 총 판매가 인상: +12 USD
  - 고객 설득 필요
```

---

## 5. Revision 상태 관리

### 5.1 상태 전이도

```
Draft (작성 중)
  ↓
  [고객에게 발송]
  ↓
Sent (발송됨)
  ├─ [고객 동의]
  │  ↓
  │  Confirmed (확정)
  │   ↓
  │   [새 협상 발생]
  │   ↓
  │   Need Revision (새 버전 필요)
  │
  └─ [고객 거절]
     ↓
     Rejected (거절됨)
      ↓
      [대안 마련]
      ↓
      Draft (새 Revision 작성)
```

### 5.2 각 상태의 의미

```
Draft:         내부 검토 중, 고객 미발송
Sent:          고객에게 발송, 피드백 대기
Confirmed:     고객 승인, PO 발행 준비
Rejected:      고객 거절, 재협상 필요
Archived:      더 이상 사용 안 함
```

---

## 6. Revision 이력 조회 화면

### 6.1 Revision 타임라인

```
PI-TMS-2026-01: UNION 고객

2026-01-15 10:30  Rev. A (초기)
  ├─ 상품: Cushion Pad 50KG
  ├─ 공급처: 폴린트 (5,000 KRW)
  ├─ 판매가: 189 USD
  ├─ Status: Sent
  └─ 작성: 김영업
      ↓
    [공급처 폴린트 가격 인상]
      ↓
2026-01-16 14:00  Rev. B (공급처 가격 인상)
  ├─ 상품: Cushion Pad 50KG
  ├─ 공급처: 폴린트 (5,100 KRW) ← 인상
  ├─ 판매가: 193 USD ← 4 USD 상승
  ├─ Status: Draft (검토 중)
  ├─ Reason: NEG-2026-001 (폴린트 협상 합의)
  └─ 작성: 김영업
      ↓
    [고객이 가격 거절]
      ↓
2026-01-17 09:30  Rev. C (대안 공급처)
  ├─ 상품: Cushion Pad 50KG
  ├─ 공급처: 공급처 B (4,950 KRW) ← 변경
  ├─ 판매가: 188 USD ← 1 USD 절감
  ├─ Status: Confirmed ✓
  ├─ Reason: "비용 절감으로 원가 경쟁력 확보"
  ├─ Customer Feedback: "OK, let's proceed"
  └─ 작성: 김영업
      ↓
2026-01-18 11:00  PO 발행
  └─ PO-2026-002: 공급처 B, 50KG, 4,950 KRW
```

### 6.2 각 Revision의 상세 보기

```
Rev. C 상세 정보:

기본 정보:
  - Version: C
  - Created: 2026-01-17 09:30
  - Created by: Kim Young-yup (sales)
  
생성 이유:
  Type: Cost Reduction
  Reason: "기존 공급처 가격이 높아 대안 공급처 적용"
  Related Negotiation: None (대안 발굴)
  
상품 정보:
  Cushion Pad
    ├─ Qty: 50 KG
    ├─ Previous Supplier: 폴린트 (5,100 KRW)
    ├─ Current Supplier: 공급처 B (4,950 KRW)
    ├─ Cost Change: -150 KRW (-2.9%)
    ├─ Sale Price Change: -0.02 USD (-0.53%)
    └─ Total Impact: -1 USD (188 vs 189)
  
고객 반응:
  Status: Confirmed
  Feedback: "Good price, let's move forward"
  Feedback Date: 2026-01-17 14:00
  
상태:
  Current Status: Confirmed
  Next Action: Issue PO
  PO Issued: Yes (PO-2026-002)
  Invoice Status: Pending Shipment
```

---

## 7. 백엔드 API (개선된 설계)

### 7.1 Revision 조회

```
GET /api/proforma-invoices/:piId/revisions
응답:
  {
    pi_number: "PI-TMS-2026-01",
    total_revisions: 3,
    revisions: [
      {
        version: "A",
        created_at: "2026-01-15T10:30:00Z",
        created_by: "kim_sales",
        status: "sent",
        reason: "Initial quote",
        line_items: [
          {
            product: "Cushion Pad",
            cost_krw: 5000,
            sale_price_usd: 3.78,
            total_usd: 189
          }
        ]
      },
      {
        version: "B",
        created_at: "2026-01-16T14:00:00Z",
        status: "draft",
        reason: "Supplier price increase (polint: 5000→5100)",
        related_negotiation: "NEG-2026-001",
        line_items: [
          {
            product: "Cushion Pad",
            cost_krw: 5100,
            previous_cost_krw: 5000,
            cost_change_percent: 2,
            sale_price_usd: 3.86,
            previous_sale_price_usd: 3.78,
            price_impact_usd: 0.08,
            total_usd: 193
          }
        ]
      }
    ]
  }

GET /api/proforma-invoices/:piId/revisions/:version
응답:
  {
    version: "C",
    pi_number: "PI-TMS-2026-01",
    customer_name: "UNION",
    created_at: "2026-01-17T09:30:00Z",
    created_by: "kim_sales",
    revision_reason: "Cost reduction with alternative supplier",
    change_summary: "Supplier B (cheaper alternative) applied",
    line_items: [...],
    total_usd: 188,
    status: "confirmed",
    customer_feedback: "Good price, let's move forward",
    related_documents: {
      po_number: "PO-2026-002",
      po_status: "confirmed"
    }
  }
```

### 7.2 Revision 비교

```
GET /api/proforma-invoices/:piId/compare-revisions?v1=A&v2=C
응답:
  {
    comparison: {
      product: "Cushion Pad",
      rev_a: {
        version: "A",
        supplier: "폴린트",
        cost_krw: 5000,
        sale_price_usd: 3.78,
        total_usd: 189
      },
      rev_c: {
        version: "C",
        supplier: "공급처 B",
        cost_krw: 4950,
        sale_price_usd: 3.76,
        total_usd: 188
      },
      differences: {
        supplier_changed: true,
        cost_change_krw: -50,
        cost_change_percent: -1.0,
        price_change_usd: -0.02,
        price_change_percent: -0.53,
        total_impact_usd: -1
      }
    }
  }
```

### 7.3 새 Revision 생성

```
POST /api/proforma-invoices/:piId/create-revision
입력:
  {
    revision_reason: "Supplier negotiation concluded",
    related_negotiation_id: "NEG-2026-001",
    line_items: [
      {
        product_id: "product_cushion",
        supplier_id: "supplier_polint",
        cost_master_id: "cm_2026_001",
        quantity: 50,
        unit: "KG",
        profit_margin: 0.10
      }
    ]
  }

응답:
  {
    pi_id: "pi_001",
    pi_number: "PI-TMS-2026-01",
    new_version: "B",
    status: "draft",
    line_items: [
      {
        product: "Cushion Pad",
        cost_krw: 5100,
        sale_price_usd: 3.86,
        total_usd: 193,
        price_change: "+4 USD (vs Rev. A)"
      }
    ],
    created_at: "2026-01-16T14:00:00Z"
  }
```

### 7.4 Revision 확정

```
PUT /api/proforma-invoices/:piId/revisions/:version/confirm
입력:
  {
    confirmation_reason: "Customer approved",
    next_action: "issue_po"
  }

응답:
  {
    message: "PI-TMS-2026-01 Rev. C confirmed",
    version: "C",
    status: "confirmed",
    po_ready: true,
    next_step: "issue_po"
  }
```

### 7.5 공급처 협상 API

```
POST /api/supplier-negotiations
입력:
  {
    supplier_id: "supplier_polint",
    product_id: "product_cushion",
    current_cost_krw: 5000,
    proposed_cost_krw: 5200,
    reason: "원재료비 상승으로 인한 인상 요청"
  }

응답:
  {
    negotiation_id: "NEG-2026-001",
    supplier_name: "폴린트",
    status: "proposed",
    change_type: "increase",
    change_percent: 4.0,
    affected_pis: 2,
    created_at: "2026-01-15"
  }

PUT /api/supplier-negotiations/:negotiationId/respond
입력:
  {
    response: "counter_offer",
    counter_offer_krw: 5100,
    message: "현재 고객 상황을 고려하면 2% 인상만 수용 가능합니다."
  }

응답:
  {
    status: "negotiating",
    our_counter: 5100,
    updated_at: "2026-01-16"
  }

PUT /api/supplier-negotiations/:negotiationId/agree
입력:
  {
    final_cost_krw: 5100,
    agreement_date: "2026-01-16"
  }

응답:
  {
    status: "agreed",
    final_cost_krw: 5100,
    will_trigger_revision: true,
    affected_pis: [
      {
        pi_number: "PI-TMS-2026-01",
        current_version: "A",
        will_create_version: "B"
      }
    ]
  }
```

---

## 8. Revision 자동 생성 엔진

### 8.1 협상 합의 후 자동 처리

```typescript
async function onSupplierNegotiationAgreed(negotiation) {
  // 1. 이 공급처의 가격이 사용된 모든 PI 찾기
  const affectedPIs = await db.query(`
    SELECT pi.id, pi.pi_number, pi.current_version
    FROM proforma_invoices pi
    JOIN pi_revisions pr ON pi.id = pr.pi_id AND pr.version = pi.current_version
    JOIN pi_revision_line_items prli ON pr.id = prli.pi_revision_id
    WHERE prli.supplier_id = ?
      AND prli.product_id = ?
      AND pi.status IN ('draft', 'sent')
    ORDER BY pi.created_at DESC
  `, [negotiation.supplier_id, negotiation.product_id]);

  // 2. 각 PI에 대해 새 Revision 생성
  for (const pi of affectedPIs) {
    const latestRevision = await db.query(`
      SELECT * FROM pi_revisions WHERE pi_id = ? ORDER BY version DESC LIMIT 1
    `, [pi.id]);

    // 새 Revision 버전 생성 (A→B, B→C 등)
    const nextVersion = getNextVersion(latestRevision.version);
    
    // 새 매입가 적용 (합의된 가격)
    const newRevision = {
      pi_id: pi.id,
      version: nextVersion,
      revision_reason: `${negotiation.supplier_name} price agreed (${negotiation.current_cost_krw}→${negotiation.final_agreed_cost_krw})`,
      related_negotiation_id: negotiation.id,
      status: 'draft'
    };

    // 라인 아이템 생성 (이전 Revision 복사 + 가격만 변경)
    for (const lineItem of latestRevision.line_items) {
      if (lineItem.supplier_id === negotiation.supplier_id) {
        // 이 라인은 가격 변경
        const newCostUSD = negotiation.final_agreed_cost_krw / pi.exchange_rate;
        const newSalePrice = newCostUSD / (1 - lineItem.profit_margin);
        
        // 변경 사항 기록
        const costChangeLog = {
          pi_id: pi.id,
          pi_version: nextVersion,
          old_cost_krw: lineItem.cost_krw,
          new_cost_krw: negotiation.final_agreed_cost_krw,
          old_sale_price_usd: lineItem.sale_price_usd,
          new_sale_price_usd: newSalePrice,
          triggered_revision_id: newRevision.id
        };
        
        await db.save('cost_change_log', costChangeLog);
      }
    }

    // 데이터베이스에 새 Revision 저장
    await db.save('pi_revisions', newRevision);
    
    // PI의 current_version 업데이트
    await db.update('proforma_invoices', 
      { id: pi.id },
      { current_version: nextVersion, updated_at: new Date() }
    );
  }
}
```

---

## 9. 대시보드 개선사항

### 9.1 Revision 히스토리 대시보드

```
┌────────────────────────────────────────────┐
│ Revision & 협상 관리 대시보드                │
├────────────────────────────────────────────┤
│                                            │
│ 📊 현황 요약                                │
│ ├─ 활성 PI: 8개                            │
│ ├─ 진행 중 Revision: 3개                   │
│ ├─ 진행 중 협상: 2건                       │
│ └─ 이번달 Revision 생성: 12개               │
│                                            │
│ 🔄 최근 Revision 활동                      │
│ ├─ PI-TMS-2026-01                        │
│ │  Rev. A → Rev. C (2번 업그레이드)        │
│ │  최근 변경: 2026-01-17 (공급처 B 적용)   │
│ │  상태: Confirmed                        │
│ │  판매가: 189 USD → 188 USD (1$ 절감)    │
│ │                                         │
│ ├─ PI-TMS-2026-02                        │
│ │  Rev. A (현재)                          │
│ │  상태: Sent (고객 피드백 대기)           │
│ │                                         │
│ └─ PI-TMS-2026-03                        │
│    Rev. A → Rev. B (진행 중)              │
│    이유: 폴린트 가격 협상 합의             │
│    상태: Draft (내부 검토 중)              │
│                                            │
│ 💰 협상 진행도                              │
│ ├─ NEG-2026-001 (폴린트): 90% [합의]      │
│ │  가격 인상: 5000 → 5100 (2%)            │
│ │  영향받는 PI: 2개                       │
│ │                                         │
│ ├─ NEG-2026-002 (공급처C): 50% [진행중]   │
│ │  가격 협상: 28500 → 27000 (인하 요청)   │
│ │  영향받는 PI: 1개                       │
│ │                                         │
│ └─ NEG-2026-003 (신규): 10% [평가중]      │
│    신규 공급처 검토: 4950                  │
│                                            │
└────────────────────────────────────────────┘
```

### 9.2 임팩트 분석

```
협상 결과별 판매가 영향도:

NEG-2026-001 (폴린트 2% 인상):
  ├─ PI-TMS-2026-01: +4 USD (189→193)
  └─ PI-TMS-2026-02: +8 USD (235→243)
  총 영향: +12 USD

NEG-2026-002 (공급처C 협상 진행):
  └─ PI-TMS-2026-03: -5 USD (245→240) [예상]
  총 영향: -5 USD (양수)

월별 Revision 통계:
  2026년 1월: 12개 Revision 생성
  ├─ 공급처 가격 변동: 8개
  ├─ 고객 요청: 3개
  └─ 환율 변동: 1개
```

---

## 10. DB 마이그레이션 스크립트

```sql
-- Revision 관리용 새 테이블 생성

-- 1. pi_revisions (기존 업데이트)
ALTER TABLE pi_revisions ADD COLUMN related_negotiation_id UUID;
ALTER TABLE pi_revisions ADD COLUMN customer_feedback TEXT;
ALTER TABLE pi_revisions ADD COLUMN feedback_received_at TIMESTAMP;

-- 2. 공급처 협상
CREATE TABLE supplier_negotiations (
  id UUID PRIMARY KEY,
  supplier_id UUID FK NOT NULL,
  product_id UUID FK NOT NULL,
  negotiation_number VARCHAR(100) UNIQUE,
  negotiation_date DATE,
  status VARCHAR(50),
  current_cost_krw DECIMAL(12,2),
  proposed_cost_krw DECIMAL(12,2),
  change_type VARCHAR(20),
  change_percent DECIMAL(5,2),
  reason TEXT,
  our_response TEXT,
  our_counter_offer_krw DECIMAL(12,2),
  final_agreed_cost_krw DECIMAL(12,2),
  agreed_at TIMESTAMP,
  will_trigger_new_revision BOOLEAN,
  initiated_by_supplier BOOLEAN,
  sales_person_id UUID FK,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

-- 3. 협상 메시지
CREATE TABLE negotiation_messages (
  id UUID PRIMARY KEY,
  negotiation_id UUID FK NOT NULL,
  message_type VARCHAR(50),
  sender_type VARCHAR(20),
  sender_name VARCHAR(100),
  sender_email VARCHAR(100),
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. 비용 변동 로그
CREATE TABLE cost_change_log (
  id UUID PRIMARY KEY,
  pi_id UUID FK NOT NULL,
  pi_version VARCHAR(10),
  product_id UUID FK NOT NULL,
  supplier_id UUID FK,
  old_cost_krw DECIMAL(12,2),
  new_cost_krw DECIMAL(12,2),
  change_percent DECIMAL(5,2),
  old_sale_price_usd DECIMAL(12,4),
  new_sale_price_usd DECIMAL(12,4),
  sale_price_impact DECIMAL(12,4),
  triggered_revision_id UUID FK,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID FK
);

-- 인덱스
CREATE INDEX idx_supplier_neg_status ON supplier_negotiations(supplier_id, status);
CREATE INDEX idx_cost_change_pi ON cost_change_log(pi_id, pi_version);
```

---

## 11. 개발 일정 (수정)

기존: 6주 → **수정: 8주**

```
Week 1-2: DB 설계 & 구축 (Revision 관리 포함)
Week 3: PO & Cost Master
Week 4: Proforma Invoice (Revision 기본)
Week 5: Supplier Negotiation 시스템
Week 6-7: Revision 자동 생성 엔진 & 대시보드
Week 8: 테스트 & 배포

추가 복잡도:
  - Revision 자동 생성 로직
  - 공급처 협상 이력 추적
  - 변경 영향도 계산
  - 대시보드 고도화
```

---

## 12. 최종 정리

### 핵심 개념
```
기존 설계:        PI = 견적서 (일회성)
신규 설계:        PI = 지속적인 협상 과정 (Rev. A→B→C→...)
```

### 중요 테이블
```
1. pi_revisions           ← Revision 이력 관리
2. supplier_negotiations   ← 공급처 협상
3. cost_change_log        ← 비용 변동 추적
4. negotiation_messages   ← 협상 메시지
```

### 자동화
```
협상 합의 → 자동으로 새 Revision 생성 → 판매가 재계산
```

### 사용자 경험
```
영업팀: 협상 → Revision 자동 생성 → 고객 재제시
구매팀: PO 발행 → 가격 변동 → 협상 시작
```
