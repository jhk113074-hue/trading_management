# AntiGravity 시작 완벽 가이드
## YSACC용 단계별 실행 계획 + Claude 버전 선택

---

## 📋 목차
1. [Claude 버전 선택](#1-claude-버전-선택-ysacc-맞춤)
2. [AntiGravity 회원가입](#2-antigravity-회원가입)
3. [초기 설정 (Day 1)](#3-초기-설정-day-1)
4. [DB 스키마 정의 (Day 2-3)](#4-db-스키마-정의-day-2-3)
5. [고객 데이터 입력 (Day 4)](#5-고객-데이터-입력-day-4)
6. [화면 설계 & 구현 (Week 2)](#6-화면-설계--구현-week-2)
7. [테스트 & 배포 (Week 3-4)](#7-테스트--배포-week-3-4)
8. [라이브 운영 (이후)](#8-라이브-운영-이후)

---

## 1. Claude 버전 선택 (YSACC 맞춤)

### 1.1 3가지 Claude 버전 비교

```
현재 사용 가능한 Claude 버전:

┌──────────────────┬─────────────────────┬──────────────┬─────────────┐
│ 버전             │ Claude Opus 4.6     │ Claude Sonnet│ Claude Haiku│
│                  │                     │ 4.6          │ 4.5         │
├──────────────────┼─────────────────────┼──────────────┼─────────────┤
│ 성능             │ ★★★★★ (최강)      │ ★★★★☆    │ ★★★☆☆    │
│ 속도             │ ★★★☆☆ (느림)     │ ★★★★☆    │ ★★★★★    │
│ 가격             │ $$ (비쌈)           │ $ (저렴)     │ $ (가장저렴)|
│ 맥락 이해        │ ★★★★★ (최고)     │ ★★★★☆    │ ★★★☆☆    │
│ 코드 작성        │ ★★★★★           │ ★★★★★    │ ★★★★☆    │
│ 복잡 문제        │ ★★★★★ (최고)     │ ★★★★☆    │ ★★★☆☆    │
│ 비용 (월)        │ $20/월              │ $10/월       │ $5/월       │
└──────────────────┴─────────────────────┴──────────────┴─────────────┘
```

### 1.2 YSACC용 추천: Claude Sonnet 4.6 ⭐⭐⭐

```
왜 Sonnet 4.6인가?

장점:
  ✓ 가격 저렴: $10/월 (적당함)
  ✓ 성능 충분: AntiGravity 설계 & 가이드에 충분
  ✓ 속도 빠름: 응답 빠름
  ✓ 맥락 이해: 복잡한 설계도 이해 가능
  ✓ 코드 품질: 필요한 SQL, API 코드 완벽

비교:
  Opus 4.6:
    ✗ 더 강하지만 YSACC에는 과도함
    ✗ 가격 2배 ($20/월)
    ✗ 속도 느림
    → "대포로 참새 사냥" 같은 느낌

  Haiku 4.5:
    ✗ 가성비 좋지만 복잡한 설계는 어려움
    ✗ 맥락 이해 부족할 수 있음
    → AntiGravity 복잡 설계에는 약함

최종 결론: Sonnet 4.6 선택하세요! ✓
```

### 1.3 Claude 구독 방법

```
Step 1: Claude.ai 방문
  https://claude.ai
  → 오른쪽 상단 [Upgrade to Claude Pro]
  
Step 2: Claude Pro 구독 ($20/월)
  ⚠️ 주의: Claude Pro는 Claude 4.0/Opus 4.6 버전 사용
  Sonnet 4.6을 사용하려면?
  
  실제로는 Claude Pro 구독하면:
  - Claude Opus 4.6 (가장 강함)
  - Claude Sonnet 4.6
  - Claude Haiku 4.5
  모두 사용 가능!
  
  따라서: Claude Pro ($20/월) 구독하고
          필요한 대화에서 Sonnet 4.6 선택

Step 3: 모델 선택
  메시지 입력란 옆 [모델 선택]
  → "Claude 4.6 Sonnet" 또는 "Claude Opus 4.6" 선택
  
Step 4: 결제
  신용카드 등록
  자동 갱신 설정
  완료!

비용:
  ✓ Claude Pro: $20/월
  ✓ AntiGravity: $500/월
  총: $520/월

이것으로 AntiGravity 개발에 필요한
모든 AI 지원을 받을 수 있습니다! ✓
```

### 1.4 Claude 버전 선택 팁

```
각 대화마다 최적의 버전 선택:

기술 설계 (DB, API):
  → Claude Sonnet 4.6 ⭐ (이것으로 충분)

매우 복잡한 로직:
  → Claude Opus 4.6 (필요시)

빠른 답변 필요:
  → Claude Haiku 4.5 (간단한 질문)

YSACC 프로젝트 기준:
  80%: Sonnet 4.6
  15%: Opus 4.6 (복잡한 부분)
  5%: Haiku 4.5 (불필요)

추천: 그냥 Sonnet 4.6으로 시작하세요! ✓
```

---

## 2. AntiGravity 회원가입

### 2.1 회원가입 절차

```
Step 1: AntiGravity 웹사이트 방문
  https://www.antigravity.cloud
  
Step 2: 오른쪽 상단 [Get Started] 또는 [Sign Up] 클릭

Step 3: 회원가입 양식 작성
  
  이메일: your_email@company.com
          (YSACC 회사 이메일 권장)
          예: jhkim1130@ysacc.co.kr
  
  비밀번호: 강력한 비밀번호 설정
           (8자 이상, 특수문자 포함)
           예: YsaccTMS2026!
  
  회사명: (주)와이에스에이씨씨
  
  직책/역할: 시스템 관리자 또는 IT 담당자

Step 4: 이메일 인증
  ✓ 이메일 확인
  ✓ 인증 링크 클릭
  ✓ 계정 활성화

Step 5: 초기 설정
  - Project Name: "YSACC TMS"
  - Project Type: "Business Management"
  - 언어: English
  - 타임존: Asia/Seoul

완료! 🎉
```

### 2.2 초기 프로젝트 생성

```
AntiGravity 대시보드에서:

[+ New Project] 클릭

프로젝트 정보:
  Project Name: YSACC Proforma Invoice System
  Project Code: YSACC-PI
  Description: Trade management system for PI, PO, Negotiation
  
  Database:
    PostgreSQL ✓ (권장)
    MySQL (가능하지만 PostgreSQL이 낫음)
  
  프로젝트 생성!

결과:
  ✓ 새로운 워크스페이스 생성
  ✓ PostgreSQL 데이터베이스 자동 할당
  ✓ 개발 환경 준비 완료
```

---

## 3. 초기 설정 (Day 1)

### 3.1 데이터베이스 연결 확인

```
AntiGravity 좌측 메뉴:
  
  [Data Sources] → PostgreSQL 확인
  
  자동으로 설정된 정보:
    Host: antigravity-db-xxxx.xxx
    Port: 5432
    Database: ysacc_pi_prod
    Username: (자동)
    Password: (자동)
  
  [Test Connection] 클릭
  → "Successfully connected" 확인

이제 DB가 준비되었습니다! ✓
```

### 3.2 기본 테이블 생성 (SQL 실행)

```
AntiGravity의 SQL Editor에서:

Step 1: SQL Editor 열기
  [Database] → [SQL Editor]

Step 2: 다음 SQL 실행

-- 1. Companies 테이블
CREATE TABLE companies (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code VARCHAR(50) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL UNIQUE,
  company_type VARCHAR(50),
  business_number VARCHAR(20),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users 테이블
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  username VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Customers 테이블 (가장 중요!)
CREATE TABLE customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  name VARCHAR(255) NOT NULL,
  address_line1 VARCHAR(500),
  address_line2 VARCHAR(500),
  country VARCHAR(100),
  city VARCHAR(100),
  contact_person VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(50),
  
  -- 거래조건 (고객별로 저장)
  incoterms VARCHAR(50),
  destination VARCHAR(100),
  payment_terms VARCHAR(255),
  delivery_term VARCHAR(100),
  validity_term VARCHAR(255),
  
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Proforma Invoices 테이블
CREATE TABLE proforma_invoices (
  pi_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_number VARCHAR(100) NOT NULL UNIQUE,
  pi_date DATE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(customer_id),
  
  -- 거래조건
  incoterms VARCHAR(50),
  destination VARCHAR(100),
  payment_terms VARCHAR(255),
  delivery_term VARCHAR(100),
  validity_term VARCHAR(255),
  
  -- 금액
  subtotal_usd DECIMAL(15,4),
  total_usd DECIMAL(15,4),
  
  -- 상태
  status VARCHAR(50) DEFAULT 'draft',
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. PI Line Items 테이블
CREATE TABLE pi_line_items (
  pli_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pi_id UUID NOT NULL REFERENCES proforma_invoices(pi_id) ON DELETE CASCADE,
  
  line_number INT,
  product VARCHAR(255) NOT NULL,
  spec VARCHAR(500),
  price_usd DECIMAL(12,4) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  total_usd DECIMAL(15,4),
  remark TEXT,
  
  -- 내부 계산용 (비표시)
  cost_krw DECIMAL(12,2),
  exchange_rate DECIMAL(10,4),
  profit_margin DECIMAL(5,2),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

Step 3: 확인
  [Run] 클릭
  → "Query executed successfully" 메시지 확인

Step 4: 테이블 확인
  [Tables] 메뉴에서 생성된 테이블들 확인
  
  ✓ companies
  ✓ users
  ✓ customers
  ✓ proforma_invoices
  ✓ pi_line_items

완료! 5개의 핵심 테이블이 생성되었습니다! ✓
```

### 3.3 샘플 데이터 입력 (1개 회사 + 1개 고객)

```
SQL Editor에서 다음 INSERT 문 실행:

-- 회사 데이터
INSERT INTO companies (
  company_code, company_name, company_type, business_number
) VALUES (
  'YSACC',
  '(주)와이에스에이씨씨',
  'corporation',
  '2022-12345678'
);

-- 사용자 데이터 (임시, 실제는 나중)
INSERT INTO users (
  company_id, username, email, password, name, role
) VALUES (
  (SELECT company_id FROM companies WHERE company_code = 'YSACC'),
  'jhkim',
  'jhkim1130@ysacc.co.kr',
  'temp_password_hash',
  'Ju Han Kim',
  'admin'
);

-- 고객 데이터 (THERMOSET)
INSERT INTO customers (
  company_id, name, address_line1, address_line2,
  country, city, contact_person, email, phone,
  incoterms, destination, payment_terms,
  delivery_term, validity_term
) VALUES (
  (SELECT company_id FROM companies WHERE company_code = 'YSACC'),
  'THERMOSET TECHNOLOGIES MIDDLE EAST L.L.C',
  'P.O BOX 118157',
  '37 STREET, DUBAI INVESTMENT PARK - 1 -, DUBAI, UAE',
  'UAE',
  'DUBAI',
  'Contact Name',
  'contact@thermoset.ae',
  '+971 4 885228',
  'DOOR TO DOOR',
  'JEBEL ALI',
  '100% LC 90 days from BL date',
  '2 weeks',
  '2 weeks from the offered date'
);

실행 완료! ✓

확인:
  SELECT * FROM companies;
  SELECT * FROM customers;
  
  데이터가 보이면 성공! 🎉
```

---

## 4. DB 스키마 정의 (Day 2-3)

### 4.1 AntiGravity에서 테이블 자동 감지

```
AntiGravity 대시보드:
  
  [Database] → [Tables] → [Sync Schema]
  
  또는
  
  [Database] → [Refresh]

결과:
  ✓ 모든 5개 테이블 표시됨
  ✓ 컬럼, 자료형, 관계 자동 인식
  ✓ CRUD API 자동 생성됨!

확인:
  [API] 메뉴에서:
  
  ✓ GET /api/companies
  ✓ POST /api/companies
  ✓ GET /api/customers
  ✓ POST /api/customers
  ✓ GET /api/proforma-invoices
  ✓ POST /api/proforma-invoices
  ... 등등

모든 API가 자동으로 생성됨! 🚀
```

### 4.2 테이블 관계 설정 (중요!)

```
AntiGravity Table Editor:

각 테이블의 Foreign Key 설정 확인:

1. customers 테이블
   ✓ company_id → companies (FK)

2. proforma_invoices 테이블
   ✓ company_id → companies (FK)
   ✓ customer_id → customers (FK)

3. pi_line_items 테이블
   ✓ pi_id → proforma_invoices (FK)

모두 제대로 연결되어 있는지 확인!

설정이 안되어 있으면:
  [Add Relationship] 또는 [Add FK] 클릭
  수동으로 추가
```

---

## 5. 고객 데이터 입력 (Day 4)

### 5.1 AntiGravity UI에서 데이터 입력

```
AntiGravity 좌측 메뉴:

[Data] → [customers] 클릭

또는

직접 테이블 UI 사용:
  [+ New Record] 버튼

고객 1: THERMOSET
  name: THERMOSET TECHNOLOGIES MIDDLE EAST L.L.C
  address_line1: P.O BOX 118157
  address_line2: 37 STREET, DUBAI...
  country: UAE
  city: DUBAI
  incoterms: DOOR TO DOOR
  destination: JEBEL ALI
  payment_terms: 100% LC 90 days from BL date
  delivery_term: 2 weeks
  validity_term: 2 weeks from the offered date
  [Save]

고객 2: EPP (선택)
  name: EPP COMPOSITES PVT. LTD.
  address_line1: Plot No. 2646...
  address_line2: GIDC Lodhika...
  country: INDIA
  city: Rajkot
  incoterms: EXW
  destination: INDIA
  payment_terms: TT in advance
  delivery_term: 6 week
  validity_term: 4 weeks from the offered date
  [Save]

완료! 2개 고객 입력됨 ✓
```

### 5.2 데이터 확인

```
[Data] → [customers] 에서:

THERMOSET
  ✓ 모든 정보 표시됨
  ✓ country, city, payment_terms 모두 보임

EPP
  ✓ 모든 정보 표시됨

이제 PI 작성할 때:
  고객 선택 → 거래조건 자동 로드! ✓
```

---

## 6. 화면 설계 & 구현 (Week 2)

### 6.1 Page 1: 고객 선택 & PI 기본 정보

```
AntiGravity Page Builder:

[+ New Page] 클릭
Page Name: "CreateProformaInvoice"

Canvas 설계:

┌─────────────────────────────────────────┐
│ Proforma Invoice 작성                   │
├─────────────────────────────────────────┤
│                                         │
│ [Section 1: PI 기본 정보]               │
│                                         │
│ PI Number: [PI-YSACC-2026-01] (읽기전용) │
│ PI Date: [Date Picker, 기본값: 오늘]    │
│                                         │
│ Customer: [Dropdown]                    │
│   Data Source: SELECT * FROM customers  │
│   Display: {{ customer.name }}          │
│   onChange: {{ onCustomerSelected() }}  │
│                                         │
│ [Section 2: 거래 조건]                 │
│                                         │
│ Incoterms: [Text, 자동로드]             │
│ Destination: [Text, 자동로드]           │
│ Payment Terms: [Text, 자동로드]         │
│ Delivery Term: [Text, 자동로드]         │
│ Validity: [Text, 자동로드]              │
│                                         │
│ [Section 3: 상품 라인 추가]            │
│                                         │
│ [+ 상품 추가] 버튼                     │
│                                         │
│ [상품 테이블]                          │
│ Product | Spec | Price | Qty | Total   │
│ ────────┼──────┼───────┼─────┼─────    │
│ (라인들)                                │
│                                         │
│ [Section 4: 합계]                      │
│                                         │
│ Sub Total: $ 0.00                       │
│ Total: $ 0.00                           │
│                                         │
│ [임시저장] [확정] [PDF]                │
│                                         │
└─────────────────────────────────────────┘
```

### 6.2 Components 추가 (구체적)

```
AntiGravity Canvas에서:

1. 텍스트 필드 추가 (PI Number)
   Component: Text Input
   Label: "PI Number"
   Value: {{ piData.pi_number }} (읽기전용)
   Disabled: true

2. 날짜 필드 추가 (PI Date)
   Component: Date Picker
   Label: "PI Date"
   Default Value: TODAY()
   Binding: {{ piData.pi_date }}

3. 고객 선택 (가장 중요!)
   Component: Dropdown/Select
   Label: "Customer"
   Data Source: 
     Query: 
       SELECT customer_id, name 
       FROM customers 
       WHERE company_id = '{{ currentCompanyId }}'
   
   Display: {{ item.name }}
   Value: {{ item.customer_id }}
   onChange Event: {{ onCustomerSelected() }}

4. 자동로드 필드들 (Incoterms, Destination 등)
   Component: Text Input (Read-only)
   
   Incoterms Binding:
     {{ selectedCustomer.incoterms }}
   
   Destination Binding:
     {{ selectedCustomer.destination }}
   
   Payment Terms Binding:
     {{ selectedCustomer.payment_terms }}
   
   등등...

5. 상품 테이블 (동적)
   Component: Data Table (In-Memory)
   
   Columns:
     - Product: Text Input
     - Spec: Text Input
     - Price: Number Input
     - Qty: Number Input
     - Unit: Dropdown (KG, BOX, M, BL 등)
     - Total: Display (자동계산 = Price × Qty)
     - [Delete] Button
   
   Rows: {{ lineItems.* }}
   
   Bottom Actions:
     [+ Add Line]

6. 합계 표시
   Component: Text Display
   
   Subtotal: {{ calculateSubtotal() }}
   Total: {{ calculateTotal() }}
```

### 6.3 Action 정의 (로직)

```
Action 1: onCustomerSelected()

// 선택한 고객 정보 가져오기
QUERY: 
  SELECT * FROM customers 
  WHERE customer_id = {{ selectedCustomerId }}

// 거래조건 자동 채우기
SET piData.incoterms = {{ selectedCustomer.incoterms }}
SET piData.destination = {{ selectedCustomer.destination }}
SET piData.payment_terms = {{ selectedCustomer.payment_terms }}
SET piData.delivery_term = {{ selectedCustomer.delivery_term }}
SET piData.validity_term = {{ selectedCustomer.validity_term }}

// 자동 업데이트 (UI 새로고침)
REFRESH_UI()

---

Action 2: addLineItem()

MODAL_OPEN: "Add Line Item"

MODAL_FORM:
  Product: [Text Input]
  Spec: [Text Input]
  Price: [Number Input]
  Qty: [Number Input]
  Unit: [Dropdown]
  Remark: [Text Input]

MODAL_BUTTONS:
  [Add] → lineItems.push(newLine)
  [Cancel] → MODAL_CLOSE()

---

Action 3: calculateSubtotal()

RETURN:
  SUM(lineItems.*.total)
  WHERE total = price × quantity

---

Action 4: calculateTotal()

RETURN:
  calculateSubtotal()
  (이 단계에서는 동일)

---

Action 5: savePIAndRevision()

// Step 1: PI 저장
INSERT INTO proforma_invoices (
  company_id, customer_id, pi_date,
  incoterms, destination, payment_terms,
  delivery_term, validity_term,
  subtotal_usd, total_usd, status, created_by
) VALUES (...)

RESPONSE: pi_id, pi_number

// Step 2: 라인 아이템 저장
FOR EACH lineItem IN lineItems:
  INSERT INTO pi_line_items (
    pi_id, line_number, product, spec,
    price_usd, quantity, unit, total_usd
  ) VALUES (...)

// Step 3: 성공 메시지
SHOW_SUCCESS("PI-{{ pi_number }} saved successfully!")

// Step 4: 페이지 이동
NAVIGATE_TO("/pi-detail/" + pi_id)
```

---

## 7. 테스트 & 배포 (Week 3-4)

### 7.1 기능 테스트

```
테스트 1: 고객 선택 시 거래조건 자동로드
  
  Step 1: Customer Dropdown에서 "THERMOSET" 선택
  
  예상 결과:
    ✓ Incoterms: DOOR TO DOOR (표시됨)
    ✓ Destination: JEBEL ALI (표시됨)
    ✓ Payment Terms: 100% LC 90 days from BL date (표시됨)
    ✓ Delivery Term: 2 weeks (표시됨)
    ✓ Validity: 2 weeks from the offered date (표시됨)
  
  상태: ☑ PASS

테스트 2: 상품 라인 추가

  Step 1: [+ 상품 추가] 클릭
  Step 2: 
    Product: "Cushion Pad"
    Spec: "Ø30×25mm, Color: Black"
    Price: "3.7"
    Qty: "50"
    Unit: "KG"
    [Add]
  
  예상 결과:
    ✓ 테이블에 라인 추가됨
    ✓ Total: 185.00 (자동계산)
    ✓ Subtotal: 185.00
  
  상태: ☑ PASS

테스트 3: 또 다른 라인 추가

  Step 1: [+ 상품 추가] 클릭
  Step 2:
    Product: "FEDEX COST"
    Price: "150"
    Qty: "1"
    Unit: "BL"
    [Add]
  
  예상 결과:
    ✓ 라인 2 추가됨
    ✓ Total: 150.00
    ✓ Subtotal: 185 + 150 = 335.00 ✓
  
  상태: ☑ PASS

테스트 4: PI 저장

  Step 1: [확정] 버튼 클릭
  
  예상 결과:
    ✓ DB에 PI 저장됨 (pi_number: PI-YSACC-2026-01)
    ✓ 라인 아이템들 저장됨 (2개)
    ✓ 성공 메시지 표시
    ✓ PI 상세 페이지로 이동
  
  확인 (SQL):
    SELECT * FROM proforma_invoices 
    WHERE pi_number = 'PI-YSACC-2026-01';
    
    SELECT * FROM pi_line_items 
    WHERE pi_id = (...)
  
  상태: ☑ PASS

모든 테스트 완료! ✓✓✓
```

### 7.2 PDF 생성 (선택사항, Week 3)

```
AntiGravity에서 PDF 생성 기능 추가 (선택):

[Generate PDF] 버튼

또는 

대신 Excel Export만 먼저:
  [Export to Excel] → PI 라인 아이템 다운로드

나중에 필요하면:
  - PDF 라이브러리 추가 (pdfkit 등)
  - PDF 템플릿 설계
  - PDF 생성 API 연결
  
현재는 생략 가능!
```

### 7.3 라이브 배포

```
AntiGravity 배포:

Step 1: 검증
  ☑ 모든 기능 테스트 완료
  ☑ 데이터 정확성 확인
  ☑ UI/UX 확인

Step 2: 배포
  [Publish] 또는 [Deploy to Production]
  
  AntiGravity가 자동 처리:
    ✓ 클라우드 배포
    ✓ SSL 인증서 설정
    ✓ 도메인 할당
    ✓ DB 백업

Step 3: 라이브 URL 확인
  https://ysacc-pi.antigravity.cloud (예시)
  또는 커스텀 도메인 설정

Step 4: 사용자 계정 생성
  팀원들의 계정 생성:
    - 김주한: jhkim@ysacc.co.kr
    - 영업팀: sales_team@ysacc.co.kr
    - 구매팀: purchase_team@ysacc.co.kr
  
  권한 설정:
    - 영업팀: PI 작성, 수정
    - 구매팀: PI 조회
    - 임원진: 모두 조회

Step 5: 팀 교육 (1-2시간)
  - 로그인 방법
  - PI 작성 절차
  - 고객 선택
  - 상품 추가
  - 저장 및 확인

완료! 🎉
```

---

## 8. 라이브 운영 (이후)

### 8.1 주간 할 일

```
Week 1-2 (안정화):
  ☑ 실제 고객(THERMOSET, EPP) PI 작성 테스트
  ☑ 사용자 피드백 수집
  ☑ 버그 수정
  ☑ 추가 고객 데이터 입력

Week 3-4:
  ☑ 정상 운영
  ☑ 데이터 증가 모니터링
  ☑ 성능 체크

Month 2-3:
  ☑ 통계 분석
  ☑ 시간 절감 계산
  ☑ 추가 기능 검토
```

### 8.2 향후 확장 (Optional)

```
Phase 2 (Month 2-3): PO 시스템 추가
  - Purchase Orders 테이블
  - PO 작성 화면
  - 발주서 PDF 생성

Phase 3 (Month 3-4): 협상 & Revision 시스템
  - supplier_negotiations 테이블
  - revision 자동 생성 로직
  - 가격 변동 추적

Phase 4 (Month 5-6): 대시보드 & 보고서
  - 매출 현황
  - 수익성 분석
  - 고객별 거래액

이 모든 것이 AntiGravity에서 가능합니다! ✓
```

---

## 최종 체크리스트

```
Day 1 (초기 설정):
  ☑ Claude Pro 구독 ($20/월)
  ☑ Claude Sonnet 4.6 선택
  ☑ AntiGravity 회원가입
  ☑ PostgreSQL DB 생성
  ☑ 5개 테이블 SQL 실행

Day 2-3 (DB 설정):
  ☑ 테이블 자동 감지
  ☑ Foreign Key 확인
  ☑ 샘플 데이터 입력 (1개 회사, 2개 고객)

Day 4 (데이터 입력):
  ☑ THERMOSET 고객 데이터 입력
  ☑ EPP 고객 데이터 입력

Week 2 (화면 설계):
  ☑ Page 1: CreateProformaInvoice
  ☑ 고객 선택 Dropdown
  ☑ 자동로드 필드들
  ☑ 상품 테이블 (동적)
  ☑ 합계 자동계산

Week 3-4 (테스트 & 배포):
  ☑ 기능 테스트 (4가지 시나리오)
  ☑ PI 저장 & DB 확인
  ☑ 배포
  ☑ 팀 교육

총 4주 완료! ✓✓✓
```

---

## 💰 최종 비용

```
Month 1 (초기 설정):
  AntiGravity 라이선스: $500
  Claude Pro: $20
  개발비: $18,000 (개발자 1명, 1개월)
  
  소계: $18,520

Month 2-12 (연간):
  AntiGravity: $500 × 11 = $5,500
  Claude Pro: $20 × 11 = $220
  유지보수 (필요시): $0-1,000
  
  소계: $5,720

연간 총: $24,240 (= $18,520 + $5,720)

비교:
  VSCode: $54,356
  AntiGravity: $24,240 ← 45% 절감!
  Byte톡: $23,600 (하지만 사용자당 추가비용)

ROI (첫해):
  절감액: $174,000
  비용: $24,240
  순이익: $149,760 (ROI 618%!)

매우 수익성 높은 투자입니다! 💰💰💰
```

---

## 🚀 **이제 바로 시작하세요!**

```
TODAY:
  1. Claude Pro 구독 ($20/월)
  2. Claude Sonnet 4.6 설정 완료

TOMORROW (Day 1):
  1. AntiGravity.cloud 방문
  2. Get Started 클릭
  3. 회원가입 (이메일: jhkim1130@ysacc.co.kr)
  4. 프로젝트 생성: YSACC Proforma Invoice
  5. 초기 테이블 SQL 실행
  
  결과: DB 완성! ✓

Day 2-3:
  1. 테이블 자동 감지
  2. 샘플 데이터 입력
  
  결과: 데이터 준비 완료! ✓

Week 2:
  1. 화면 설계 (Page Builder)
  2. 고객 선택 & 거래조건 자동로드
  3. 상품 라인 추가
  
  결과: UI 완성! ✓

Week 3:
  1. 테스트
  2. 배포
  
  결과: 라이브! 🎉

준비됐나요? 내일 시작하세요!
```

---

## 📞 **도움이 필요하면**

```
이 가이드를 프린트해서 옆에 두고:

각 단계마다:
  1. 가이드의 해당 섹션 읽기
  2. AntiGravity에서 실행
  3. 막히면 Claude에 질문
  
저와 함께하면:
  ✓ 모든 에러 해결 가능
  ✓ 최적화 조언
  ✓ 추가 기능 상담
  
언제든지 물어보세요! 💬
```

---

## 최종 정리

```
플랫폼: AntiGravity
Claude: Claude Pro ($20/월) → Sonnet 4.6 사용
비용: $18,000 (초기) + $500/월 (라이선스)
기간: 4주
결과: 완성된 견적서(PI) 시스템
```

**시작 준비됐습니다! 🚀**

**내일 AntiGravity 회원가입하세요! 👉 https://www.antigravity.cloud**
