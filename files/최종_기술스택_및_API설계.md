# 무역 관리 시스템 최종 설계
## 기술 스택 & 백엔드 API 설계

---

## 📚 목차
1. [추천 기술 스택](#1-추천-기술-스택)
2. [시스템 아키텍처](#2-시스템-아키텍처)
3. [백엔드 API 상세 설계](#3-백엔드-api-상세-설계)
4. [이익률 계산 로직](#4-이익률-계산-로직-핵심)
5. [개발 일정](#5-개발-일정)
6. [배포 계획](#6-배포-계획)

---

## 1. 추천 기술 스택

### 1.1 Frontend (웹 브라우저)

**선택: React + TypeScript + Vite**

```
├─ React 18+
│  ├─ 상태 관리: Redux Toolkit 또는 Zustand
│  ├─ API 통신: React Query (TanStack Query)
│  ├─ 폼 관리: React Hook Form
│  └─ 유효성 검사: Zod 또는 Yup
│
├─ UI 라이브러리: Ant Design Pro 또는 Material-UI
│  ├─ 테이블: DataGrid Pro (복잡한 다층 데이터)
│  ├─ 폼 컴포넌트: Input, Select, DatePicker
│  └─ 차트: Recharts (수익성 대시보드)
│
├─ 유틸리티
│  ├─ HTTP: Axios
│  ├─ 날짜: Day.js 또는 date-fns
│  ├─ 숫자 포맷: dinero.js 또는 numeral.js
│  └─ 실시간: Socket.io-client (향후)
│
├─ 빌드: Vite (빠른 개발)
└─ 테스트: Vitest + React Testing Library
```

**설치 명령어:**
```bash
npm create vite@latest trade-system -- --template react
cd trade-system
npm install react-query axios react-hook-form zod
npm install antd recharts dayjs
npm install -D vitest @testing-library/react
```

### 1.2 Backend (서버)

**선택: Node.js + Express + TypeScript**

```
├─ Runtime: Node.js 18+ LTS
├─ 프레임워크: Express.js 4.x
├─ 언어: TypeScript
│
├─ 데이터베이스
│  ├─ PostgreSQL 14+ (관계형 데이터 저장)
│  └─ ORM: Prisma (type-safe)
│
├─ 인증 & 권한
│  ├─ JWT (jsonwebtoken)
│  ├─ bcrypt (비밀번호 암호화)
│  └─ Role-based Access Control (RBAC)
│
├─ 문서 생성
│  ├─ PDF: pdfkit 또는 puppeteer
│  ├─ Excel: xlsx (SheetJS)
│  └─ 템플릿: EJS 또는 Handlebars
│
├─ 환율 & 외부 API
│  ├─ axios (HTTP 요청)
│  ├─ 환율 API: Naver/은행 공식 API
│  └─ 스케줄링: node-cron (매일 환율 동기화)
│
├─ 실시간 협업 (향후)
│  ├─ Socket.io
│  └─ Redis (메시지 브로커)
│
├─ 로깅 & 모니터링
│  ├─ Winston (구조화된 로깅)
│  └─ Morgan (HTTP 로깅)
│
└─ 테스트: Jest + Supertest
```

**설치 명령어:**
```bash
mkdir trade-api && cd trade-api
npm init -y
npm install express typescript tsx
npm install prisma @prisma/client
npm install jsonwebtoken bcrypt
npm install axios pdfkit xlsx
npm install node-cron
npm install -D @types/node jest supertest ts-jest
```

### 1.3 데이터베이스

**PostgreSQL 14+**

```sql
-- 주요 테이블
1. products (상품 마스터)
2. suppliers (공급사 마스터)
3. customers (고객사 마스터)
4. users (사용자 & 팀)

5. purchase_orders (발주서)
6. po_line_items (발주서 라인)
7. cost_master (매입가 마스터) ★ 핵심

8. proforma_invoices (견적서)
9. pi_line_items (견적서 라인)
10. pi_versions (버전 관리: Rev. A/B/C)

11. invoices (실제 인보이스)
12. packing_lists (패킹리스트)
13. shipping_documents (선적 서류)

14. audit_log (감시 로그)
```

**연결 문자열:**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/trade_system
```

### 1.4 배포 환경

**클라우드: AWS 또는 Azure**

```
┌─────────────────────────────────────┐
│     Client (React SPA)              │
│  ├─ CloudFront (CDN)                │
│  └─ S3 (정적 호스팅)                 │
└──────────────┬──────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────┐
│   Application Load Balancer (ALB)   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   Backend API (Node.js on EC2)      │
│   또는 ECS/Fargate (컨테이너)        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   RDS PostgreSQL (관리형 DB)        │
│   + S3 (PDF/Excel 파일 저장)        │
└──────────────────────────────────────┘
```

---

## 2. 시스템 아키텍처

### 2.1 전체 흐름도

```
┌─────────────────────────────────────────────────────────┐
│                    웹 브라우저 (React)                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │ UI 컴포넌트                                       │  │
│  │ ├─ 대시보드                                       │  │
│  │ ├─ 발주서(PO) 작성                                │  │
│  │ ├─ Proforma Invoice(PI) 작성                     │  │
│  │ └─ 수익성 분석                                    │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────┬────────────────────────────────┘
                          │ HTTP/JSON + WebSocket
                          ▼
┌─────────────────────────────────────────────────────────┐
│            Backend API (Node.js + Express)              │
│  ┌───────────────────────────────────────────────────┐  │
│  │ REST API 엔드포인트                               │  │
│  │ ├─ /api/purchase-orders                          │  │
│  │ ├─ /api/proforma-invoices                        │  │
│  │ ├─ /api/cost-master                              │  │
│  │ └─ /api/invoices                                 │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 비즈니스 로직                                     │  │
│  │ ├─ 이익률 계산 (매입가/(1-이익률))               │  │
│  │ ├─ 환율 변환                                      │  │
│  │ ├─ 버전 관리 (Rev. A/B/C)                        │  │
│  │ └─ 권한 검증                                      │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │ 문서 생성                                         │  │
│  │ ├─ PDF 생성 (pdfkit)                             │  │
│  │ ├─ Excel 생성 (xlsx)                             │  │
│  │ └─ S3 업로드                                      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────┬────────────────────────────────┘
                          │ SQL
                          ▼
┌─────────────────────────────────────────────────────────┐
│          PostgreSQL Database (RDS)                      │
│  ├─ cost_master (매입가 마스터)                         │
│  ├─ proforma_invoices (견적서)                         │
│  ├─ pi_versions (버전 관리)                            │
│  └─ audit_log (모든 변경사항 기록)                      │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│          AWS S3 (PDF/Excel 파일 저장)                   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 인증 & 권한 구조

```
JWT Token 기반 인증:

1. 로그인
   └─ username + password
        ↓
   사용자 검증 → JWT 토큰 생성
        ↓
   { token, refreshToken }

2. 요청 시 인증
   └─ Authorization: Bearer <JWT>
        ↓
   토큰 검증 → 사용자 ID 추출
        ↓
   권한 확인 (팀/역할)

팀별 권한:
├─ 영업팀 (sales_team)
│  ├─ PI 작성 (create, read, update)
│  ├─ 수익성 보기
│  └─ 고객 정보 수정
│
├─ 구매팀 (purchasing_team)
│  ├─ PO 작성 (create, read, update)
│  ├─ 매입가 입력
│  └─ 공급사 정보 관리
│
├─ 로지스틱팀 (logistics_team)
│  ├─ 패킹리스트 작성
│  ├─ 선적 서류 생성
│  └─ ETD/ETA 수정
│
└─ 임원진 (executive)
   └─ 전체 조회만 (read-only)
```

---

## 3. 백엔드 API 상세 설계

### 3.1 인증 API

```
POST /api/auth/login
입력:
  {
    username: "kim_sales",
    password: "****"
  }
응답:
  {
    token: "eyJhbGc...",
    refreshToken: "eyJhbGc...",
    user: {
      id: "user_001",
      name: "김영업",
      team: "sales_team",
      email: "kim@ysacc.co.kr"
    }
  }

POST /api/auth/refresh
입력:
  {
    refreshToken: "eyJhbGc..."
  }
응답:
  {
    token: "eyJhbGc..."
  }

POST /api/auth/logout
응답:
  { message: "로그아웃 완료" }
```

### 3.2 발주서(PO) API

```
▶ 발주서 생성
POST /api/purchase-orders
입력:
  {
    supplier_id: "supplier_001",     // 폴린트
    po_date: "2026-01-15",
    delivery_date: "2026-02-28",
    reference_person: "조형은",
    notes: "우선 처리 요망",
    line_items: [
      {
        product_id: "product_cushion",
        specification: "Ø30×25mm",
        quantity: 50,
        unit: "KG",
        unit_price: 5000,             // ★ 매입가 (KRW)
        currency: "KRW"
      }
    ]
  }
응답:
  {
    id: "po_001",
    po_number: "PO-2026-001",         // 자동 생성
    supplier_name: "폴린트",
    total_amount: 250000,
    line_items: [...],
    created_at: "2026-01-15T10:30:00Z"
  }

▶ 발주서 조회
GET /api/purchase-orders/:poId
응답:
  {
    id: "po_001",
    po_number: "PO-2026-001",
    supplier: {...},
    line_items: [
      {
        product_id: "product_cushion",
        quantity: 50,
        unit_price: 5000,
        cost_master_id: "cm_001"      // 매입가 DB ID
      }
    ]
  }

▶ 발주서 목록
GET /api/purchase-orders?supplier_id=supplier_001&status=confirmed
응답:
  {
    data: [
      { id: "po_001", po_number: "PO-2026-001", ... },
      { id: "po_002", po_number: "PO-2026-002", ... }
    ],
    total: 2,
    page: 1,
    limit: 10
  }

▶ 발주서 수정
PUT /api/purchase-orders/:poId
입력:
  {
    line_items: [
      {
        id: "poli_001",
        unit_price: 5200           // 가격 인상
      }
    ]
  }
응답:
  { message: "업데이트 완료", po_number: "PO-2026-001" }

▶ 발주서 PDF 생성
GET /api/purchase-orders/:poId/pdf
응답:
  { 
    pdf_url: "https://s3.amazonaws.com/trade-docs/PO-2026-001.pdf"
  }
```

### 3.3 매입가 마스터(Cost Master) API

```
▶ 최신 매입가 조회 (가장 중요!)
GET /api/cost-master/latest/:productId
응답:
  {
    id: "cm_001",
    product_id: "product_cushion",
    supplier_name: "폴린트",
    unit_price: 5000,
    currency: "KRW",
    unit: "KG",
    po_number: "PO-2026-001",
    effective_date: "2026-01-15",
    is_latest: true
  }

▶ 상품별 가격 이력 조회
GET /api/cost-master/history/:productId
응답:
  {
    product_name: "Cushion Pad",
    history: [
      {
        po_number: "PO-2026-001",
        supplier_name: "폴린트",
        unit_price: 5000,
        effective_date: "2026-01-15",
        is_latest: true
      },
      {
        po_number: "PO-2025-045",
        supplier_name: "폴린트",
        unit_price: 4900,
        effective_date: "2025-12-20",
        is_latest: false
      }
    ]
  }

▶ 매입가 비교 (공급사별)
GET /api/cost-master/compare/:productId
응답:
  {
    product_name: "Cushion Pad",
    suppliers: [
      { name: "폴린트", price: 5000, po_number: "PO-2026-001" },
      { name: "다른사", price: 5200, po_number: "PO-2025-020" }
    ]
  }
```

### 3.4 Proforma Invoice(PI) API

```
▶ 견적서 생성
POST /api/proforma-invoices
입력:
  {
    customer_id: "customer_union",
    pi_date: "2026-01-15",
    payment_terms: "LC 90 days",
    incoterms: "CIF",
    destination: "JEBEL ALI",
    exchange_rate: 1468.96,           // 환율
    validity_days: 30,
    line_items: [
      {
        product_id: "product_cushion",
        quantity: 50,
        unit: "KG",
        profit_margin: 0.10,           // 10% 이익 (소수점)
        notes: "Export standard packaging"
      }
    ]
  }

응답:
  {
    id: "pi_001",
    pi_number: "PI-TMS-2026-01",       // 자동 생성
    version: "A",                      // Rev. A (첫 버전)
    customer_name: "UNION",
    pi_date: "2026-01-15",
    line_items: [
      {
        product_name: "Cushion Pad",
        quantity: 50,
        unit: "KG",
        
        // 자동 로드 & 계산
        cost_krw: 5000,                // cost_master에서 로드
        profit_margin: 0.10,           // 10% 입력
        
        // 계산 결과
        cost_usd: 3.40,                // 5000 / 1468.96
        sale_price_usd: 3.78,          // 3.40 / (1-0.10) = 3.40 / 0.9 ★ 핵심
        total_usd: 189                 // 3.78 × 50
      }
    ],
    subtotal_usd: 189,
    created_at: "2026-01-15T10:30:00Z"
  }

계산식 설명:
  이익률 = 10% (0.10)
  매입가 USD = 5000 KRW / 1468.96 = 3.40 USD
  판매가 USD = 3.40 / (1 - 0.10)
             = 3.40 / 0.9
             = 3.7777... USD ≈ 3.78 USD
  
  검증:
  이익 = 3.78 - 3.40 = 0.38 USD
  이익률 = 0.38 / 3.78 = 10.05% ✓ (반올림 오차)

▶ 견적서 조회
GET /api/proforma-invoices/:piId
응답:
  {
    id: "pi_001",
    pi_number: "PI-TMS-2026-01",
    version: "A",
    customer_name: "UNION",
    line_items: [...],
    versions: [                        // 버전 이력
      { version: "A", created_at: "2026-01-15", status: "draft" },
      { version: "B", created_at: "2026-01-16", status: "sent" },
      { version: "C", created_at: "2026-01-17", status: "confirmed" }
    ]
  }

▶ 견적서 수정 (새 버전 생성)
PUT /api/proforma-invoices/:piId
입력:
  {
    action: "create_revision",
    revision_reason: "고객 협상",
    line_items: [
      {
        product_id: "product_cushion",
        quantity: 50,
        profit_margin: 0.08            // 10% → 8% 인하
      }
    ]
  }
응답:
  {
    id: "pi_001",
    pi_number: "PI-TMS-2026-01",
    version: "B",                      // Rev. B 생성
    status: "draft",
    line_items: [...]
  }

▶ 견적서 확정
PUT /api/proforma-invoices/:piId/confirm
입력:
  {
    version: "B"
  }
응답:
  {
    message: "PI-TMS-2026-01 Rev. B 확정",
    pi_number: "PI-TMS-2026-01",
    version: "B",
    status: "confirmed"
  }

▶ 견적서 PDF 생성
GET /api/proforma-invoices/:piId/pdf?version=B
응답:
  {
    pdf_url: "https://s3.amazonaws.com/trade-docs/PI-TMS-2026-01-B.pdf"
  }

▶ 견적서 Excel 생성
GET /api/proforma-invoices/:piId/excel?version=B
응답:
  {
    excel_url: "https://s3.amazonaws.com/trade-docs/PI-TMS-2026-01-B.xlsx"
  }

▶ 견적서 이메일 발송
POST /api/proforma-invoices/:piId/send-email
입력:
  {
    version: "B",
    recipient_email: "contact@thermoset.ae",
    message: "이 견적을 검토해주세요."
  }
응답:
  {
    message: "이메일 발송 완료",
    sent_at: "2026-01-16T14:30:00Z"
  }
```

### 3.5 수익성 분석 API

```
▶ 월별 수익성 요약
GET /api/profitability/summary?month=2026-01
응답:
  {
    month: "2026-01",
    total_revenue_usd: 45230,
    total_cost_usd: 36900,
    total_profit_usd: 8330,
    profit_margin_percent: 18.41,
    order_count: 12,
    avg_profit_margin: 17.8
  }

▶ 고객별 수익성
GET /api/profitability/by-customer?month=2026-01
응답:
  {
    data: [
      {
        customer_name: "UNION",
        revenue_usd: 28500,
        cost_usd: 23300,
        profit_usd: 5200,
        margin_percent: 18.2
      },
      {
        customer_name: "THERMOSET",
        revenue_usd: 16730,
        cost_usd: 13900,
        profit_usd: 2830,
        margin_percent: 16.9
      }
    ]
  }

▶ 상품별 원가 변동
GET /api/profitability/cost-trend/:productId
응답:
  {
    product_name: "Cushion Pad",
    trend: [
      { date: "2025-11-10", cost_krw: 4850 },
      { date: "2025-12-20", cost_krw: 4900 },
      { date: "2026-01-15", cost_krw: 5000 }
    ]
  }
```

### 3.6 인보이스(Invoice) API

```
▶ 인보이스 생성 (PI 기반)
POST /api/invoices
입력:
  {
    pi_id: "pi_001",
    pi_version: "C",                  // 확정된 PI 버전 사용
    invoice_date: "2026-01-20",
    actual_quantity: 50               // 배송된 수량
  }
응답:
  {
    id: "inv_001",
    invoice_number: "INV-2026-0001",  // 자동 생성
    pi_number: "PI-TMS-2026-01",
    customer_name: "UNION",
    line_items: [                     // PI에서 상속
      {
        product_name: "Cushion Pad",
        quantity: 50,
        unit_price_usd: 3.78,
        total_usd: 189
      }
    ],
    total_usd: 189,
    created_at: "2026-01-20T09:00:00Z"
  }

▶ 인보이스 PDF (정식 송장)
GET /api/invoices/:invoiceId/pdf
응답:
  {
    pdf_url: "https://s3.amazonaws.com/invoices/INV-2026-0001.pdf"
  }
```

---

## 4. 이익률 계산 로직 (핵심)

### 4.1 이익률 공식

```
사용자 입력: 10% 이익을 원한다
↓
판매가 계산:
  판매가 = 매입가 / (1 - 이익률)
  판매가 = 매입가 / (1 - 0.10)
  판매가 = 매입가 / 0.9

예시:
  매입가: 1,000 KRW
  이익률: 10%
  판매가: 1,000 / 0.9 = 1,111.11 KRW
  
  검증:
  이익 = 1,111.11 - 1,000 = 111.11 KRW
  이익률 = 111.11 / 1,111.11 = 10% ✓
```

### 4.2 다단계 계산 (실제)

```
Step 1: 발주서에서 매입가 입력
  unit_price_krw = 5,000 (공급사 폴린트)
  quantity = 50 KG
  total_cost_krw = 5,000 × 50 = 250,000 KRW

Step 2: Proforma Invoice 작성
  환율: 1,468.96 (KRW → USD)
  이익률: 10%
  
  cost_usd = 250,000 / 50 / 1,468.96
           = 5,000 / 1,468.96
           = 3.40 USD (단가)
  
  sale_price_usd = 3.40 / (1 - 0.10)
                 = 3.40 / 0.9
                 = 3.7777... USD
                 ≈ 3.78 USD (반올림)
  
  total_usd = 3.78 × 50 = 189 USD

Step 3: 수익성 검증
  revenue_usd = 189
  cost_usd = 250,000 / 1,468.96 = 170.20 USD
  profit_usd = 189 - 170.20 = 18.80 USD
  profit_margin = 18.80 / 189 = 9.95% ≈ 10% ✓
```

### 4.3 TypeScript 구현

```typescript
// 이익률 기반 판매가 계산
function calculateSalePrice(
  costKRW: number,
  exchangeRate: number,
  profitMargin: number  // 0.10 (10%)
): number {
  const costUSD = costKRW / exchangeRate;
  const salePrice = costUSD / (1 - profitMargin);
  return parseFloat(salePrice.toFixed(4));
}

// 사용 예
const costKRW = 5000;
const exchangeRate = 1468.96;
const profitMargin = 0.10;

const salePrice = calculateSalePrice(costKRW, exchangeRate, profitMargin);
console.log(salePrice); // 3.7778 USD

// 검증
const profit = salePrice - (costKRW / exchangeRate);
const actualMargin = profit / salePrice;
console.log(actualMargin); // 0.10 (10%)
```

---

## 5. 개발 일정

### 5.1 Phase 1: MVP 핵심 (4주)

```
Week 1: 환경 설정 & DB 구축
  ├─ 개발 환경 세팅 (Node.js, React, PostgreSQL)
  ├─ DB 스키마 설계 & 마이그레이션
  ├─ Prisma ORM 설정
  └─ API 기본 틀 (Express 라우터)
  예상: 40시간

Week 2: 인증 & PO 기능
  ├─ JWT 인증 시스템 구현
  ├─ 발주서(PO) REST API
  ├─ PO 폼 UI (React)
  ├─ 매입가 DB 자동 저장
  └─ PO PDF 생성
  예상: 45시간

Week 3: Proforma Invoice 핵심
  ├─ PI REST API
  ├─ 최신 매입가 자동 로드 API
  ├─ 이익률 계산 로직 (매입가/(1-이익률))
  ├─ PI 폼 UI
  ├─ 버전 관리 (Rev. A/B/C)
  ├─ PI PDF/Excel 생성
  └─ 이메일 발송
  예상: 50시간

Week 4: 대시보드 & 통합 테스트
  ├─ 대시보드 UI (조회 전용)
  ├─ 수익성 분석 API
  ├─ 권한 검증 미들웨어
  ├─ E2E 테스트 (Cypress)
  ├─ 배포 준비
  └─ 문서화
  예상: 40시간

총 예상 시간: 175시간 (4주, 1주 44시간 기준)
팀 구성: 백엔드 1명 + 프론트엔드 1명 = 2명
```

### 5.2 Phase 2: 배포 & 고도화 (2주)

```
Week 5: 프로덕션 배포
  ├─ AWS/Azure 환경 설정
  ├─ 도메인 & SSL 인증서
  ├─ 데이터 마이그레이션 (시뮬레이션)
  ├─ 성능 최적화 (쿼리, 번들)
  ├─ 모니터링 설정 (CloudWatch)
  └─ 사용자 교육 자료 작성
  예상: 30시간

Week 6: 추가 기능 & 안정화
  ├─ 자동 환율 동기화 (API + 크론)
  ├─ 실시간 협업 (Socket.io)
  ├─ 고급 리포팅
  ├─ 성능 튜닝
  └─ 버그 수정
  예상: 35시간

총 예상 시간: 65시간
```

### 5.3 총 개발 일정

```
Timeline:
├─ Week 1: DB & 환경 설정
├─ Week 2: 인증 & PO
├─ Week 3: PI & 계산 엔진 ★ 핵심
├─ Week 4: 대시보드 & 테스트
├─ Week 5: 프로덕션 배포
└─ Week 6: 추가 기능 & 안정화

총 6주 (1.5개월)
팀: 2명 (백엔드 1 + 프론트엔드 1)
예상 비용: $15,000 ~ $25,000 (개발자 급여 기준)
```

---

## 6. 배포 계획

### 6.1 로컬 개발 환경

```bash
# 1. 리포지토리 클론
git clone <repo-url>
cd trade-system

# 2. 백엔드 설정
cd backend
npm install
cp .env.example .env
npx prisma migrate dev    # DB 마이그레이션

# 3. 프론트엔드 설정
cd ../frontend
npm install
npm run dev               # http://localhost:5173

# 4. API 실행
cd ../backend
npm run dev               # http://localhost:3000
```

### 6.2 프로덕션 배포 (AWS)

```
┌─────────────────┐
│   GitHub Actions│  (CI/CD 파이프라인)
├─────────────────┤
│ 1. npm test     │
│ 2. npm build    │
│ 3. Docker build │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ECR (컨테이너) │  (또는 S3 + CloudFront)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  ECS / Fargate  │  (또는 EC2)
│  Backend API    │
└─────────────────┘

Frontend:
  S3 (정적 파일 호스팅)
  + CloudFront (CDN)
  + Route 53 (DNS)

Database:
  RDS PostgreSQL (관리형)
  + Automated Backups
  + Multi-AZ (고가용성)
```

### 6.3 배포 체크리스트

```
□ 도메인 구매
□ SSL 인증서 생성
□ AWS 계정 & IAM 설정
□ RDS PostgreSQL 인스턴스 생성
□ S3 버킷 생성 (문서 저장용)
□ ECR 리포지토리 생성
□ ECS 클러스터 생성
□ Application Load Balancer 설정
□ CloudWatch 로깅 설정
□ 환경 변수 설정 (.env.production)
□ 데이터베이스 마이그레이션
□ 테스트 실행 및 검증
□ 보안 감사 (OWASP Top 10)
□ 성능 테스트 (부하 테스트)
□ 사용자 교육
□ 라이브 배포
```

---

## 7. 예상 비용 분석

### 7.1 개발 비용

```
인력:
  ├─ 백엔드 개발자 (1명): $3,000 × 6주 = $18,000
  ├─ 프론트엔드 개발자 (1명): $2,500 × 6주 = $15,000
  ├─ QA 엔지니어 (1명, 파트타임): $1,500 × 6주 = $9,000
  └─ 총 인력 비용: $42,000

인프라:
  ├─ AWS RDS PostgreSQL: $50~150/월
  ├─ EC2 (또는 ECS): $100~200/월
  ├─ S3: $5~20/월
  └─ 기타 (CloudFront, Route 53): $50~100/월

라이선스:
  ├─ IDE/Tools: $200~500 (1회)
  └─ 기타: $100

초기 총 개발 비용: $42,500 ~ $43,500
월 운영 비용: $200~500
```

### 7.2 유지보수 비용

```
개발 후 유지보수 (Year 1):
  ├─ 버그 수정 & 패치: $500~1,000/월
  ├─ 기능 개선: $1,000~2,000/월
  ├─ 인프라 모니터링: $300~500/월
  └─ 보안 업데이트: $200~300/월

연간 유지보수: $30,000 ~ $45,000
```

---

## 8. 다음 단계

### 8.1 즉시 진행할 사항

1. **기술 스택 확정**
   - [ ] Node.js + Express + React 동의?
   - [ ] PostgreSQL 선택 동의?
   - [ ] AWS 배포 동의?

2. **개발팀 구성**
   - [ ] 백엔드 개발자 1명 (Node.js 경험)
   - [ ] 프론트엔드 개발자 1명 (React 경험)
   - [ ] QA (선택)

3. **인프라 준비**
   - [ ] AWS 계정 생성
   - [ ] 개발 서버 (EC2) 구성
   - [ ] RDS PostgreSQL 인스턴스 생성

4. **개발 시작**
   - [ ] 리포지토리 생성
   - [ ] 개발 환경 설정
   - [ ] Week 1부터 시작

### 8.2 상세 문서 요청

필요한 문서:
- [ ] Figma 화면 목업 (UI/UX)
- [ ] OpenAPI 스펙 (Swagger)
- [ ] 사용자 매뉴얼
- [ ] 시스템 아키텍처 다이어그램

---

## 부록: 이익률 계산 검증

### 예시 1: 10% 이익

```
매입가: 1,000 KRW
이익률 요구: 10%
환율: 1,000 KRW = 1 USD (단순화)

계산:
  매입가 (USD) = 1,000 / 1,000 = 1 USD
  판매가 (USD) = 1 / (1 - 0.10) = 1 / 0.9 = 1.1111 USD
  
검증:
  실제 이익 = 1.1111 - 1 = 0.1111 USD
  이익률 = 0.1111 / 1.1111 = 10% ✓
```

### 예시 2: 20% 이익

```
매입가: 5,000 KRW
이익률 요구: 20%
환율: 1,468.96

계산:
  매입가 (USD) = 5,000 / 1,468.96 = 3.40 USD
  판매가 (USD) = 3.40 / (1 - 0.20) = 3.40 / 0.8 = 4.25 USD

검증:
  실제 이익 = 4.25 - 3.40 = 0.85 USD
  이익률 = 0.85 / 4.25 = 20% ✓
```

### 예시 3: 다양한 이익률

```
매입가: 1,000 USD

이익률 5%:   판매가 = 1,000 / 0.95 = 1,052.63 USD
이익률 10%:  판매가 = 1,000 / 0.90 = 1,111.11 USD
이익률 15%:  판매가 = 1,000 / 0.85 = 1,176.47 USD
이익률 20%:  판매가 = 1,000 / 0.80 = 1,250.00 USD
이익률 25%:  판매가 = 1,000 / 0.75 = 1,333.33 USD
이익률 30%:  판매가 = 1,000 / 0.70 = 1,428.57 USD
```

---

## 최종 요약

```
기술 스택:
  ├─ Frontend: React 18 + TypeScript + Vite
  ├─ Backend: Node.js + Express + TypeScript
  ├─ Database: PostgreSQL 14+
  └─ Deployment: AWS (EC2 + RDS + S3)

핵심 계산 엔진:
  판매가 = 매입가 / (1 - 이익률)
  예: 10% 이익 → 매입가 / 0.9

개발 일정:
  Total: 6주 (Phase 1: 4주 + Phase 2: 2주)
  Team: 백엔드 1 + 프론트엔드 1
  Cost: $42,500 ~ $43,500

핵심 기능:
  1. 발주서(PO) → 매입가 저장
  2. Proforma Invoice → 자동 로드 + 계산
  3. 버전 관리 (Rev. A/B/C)
  4. PDF/Excel 생성
  5. 수익성 분석 대시보드
```
