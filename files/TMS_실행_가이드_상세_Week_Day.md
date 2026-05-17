# TMS 프로젝트 실행 가이드
## 주(Week)/일(Day) 단위 구체적 실행 계획

**선택 플랫폼**: AntiGravity (권장)  
**총 개발 기간**: 4주  
**팀 구성**: 개발자 1명 (또는 분석가 가능)

---

## 📋 목차
1. [Quick Start (이번 주)](#1-quick-start-이번-주)
2. [Week 1: 데이터베이스 & 인증](#2-week-1-데이터베이스--인증)
3. [Week 2: 회사 관리 & 기본 기능](#3-week-2-회사-관리--기본-기능)
4. [Week 3: PI & Revision](#4-week-3-pi--revision)
5. [Week 4: 배포 & 마무리](#5-week-4-배포--마무리)
6. [테스트 & 검증](#6-테스트--검증)
7. [트러블슈팅](#7-트러블슈팅)

---

## 1. Quick Start (이번 주)

### 🎯 목표
- AntiGravity 계정 생성
- PostgreSQL 설정
- 환경 준비

### Day 1: 환경 구성 (Monday)

#### Task 1.1: AntiGravity 가입

```
1. https://www.antigravity.cloud 접속
2. "Get Started" 클릭
3. 이메일 입력: your_email@company.com
4. 비밀번호 설정 (최소 8자, 대문자+숫자+특수문자)
5. 회사명: "YSACC Trade System"
6. 이메일 인증 (메일함 확인)
7. 로그인

소요 시간: 15분
완료 조건: AntiGravity 대시보드 진입 가능
```

#### Task 1.2: PostgreSQL 설치 (로컬 개발용)

**Windows 사용자:**
```bash
# Option 1: Docker 사용 (권장)
# Docker Desktop 설치 후 다음 명령어 실행

docker run --name postgres_tms \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=trade_system \
  -p 5432:5432 \
  -d postgres:14

# PostgreSQL 실행 확인
docker ps | grep postgres_tms

# Option 2: PostgreSQL 직접 설치
# https://www.postgresql.org/download/windows/ 에서 다운로드
# 설치 중 포트 5432, 암호 설정

소요 시간: 20분
완료 조건: PostgreSQL 서비스 실행 중
```

**Mac 사용자:**
```bash
# Homebrew 사용
brew install postgresql

# PostgreSQL 시작
brew services start postgresql

# 연결 확인
psql -U postgres -c "SELECT version();"

소요 시간: 15분
```

**Linux (Ubuntu) 사용자:**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# PostgreSQL 시작
sudo systemctl start postgresql

# 상태 확인
sudo systemctl status postgresql

소요 시간: 10분
```

#### Task 1.3: DB 생성

```bash
# PostgreSQL 연결
psql -U postgres -h localhost

# 데이터베이스 생성
CREATE DATABASE trade_system;

# 사용자 생성
CREATE USER tms_user WITH PASSWORD 'tms_secure_password';

# 권한 부여
GRANT ALL PRIVILEGES ON DATABASE trade_system TO tms_user;

# 연결 확인
psql -U tms_user -h localhost -d trade_system -c "SELECT 1;"

소요 시간: 5분
완료 조건: trade_system 데이터베이스 생성됨
```

#### Task 1.4: AntiGravity에서 DB 연결

```
AntiGravity 대시보드:
  1. 왼쪽 메뉴 → "Data Sources"
  2. "+ Add Data Source" 클릭
  3. PostgreSQL 선택
  
  Connection 설정:
    - Host: localhost (또는 your_server_ip)
    - Port: 5432
    - Database: trade_system
    - Username: tms_user
    - Password: tms_secure_password
  
  4. "Test Connection" 클릭
     → "Successfully connected" 메시지 확인
  5. "Save" 클릭

소요 시간: 10분
완료 조건: Data Source 연결 완료
```

### Day 2: DB 스키마 생성 (Tuesday)

#### Task 2.1: SQL 파일 생성

```
파일명: schema_01_companies.sql

내용:

-- 회사 테이블
CREATE TABLE companies (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code VARCHAR(50) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL UNIQUE,
  company_type VARCHAR(50),
  business_number VARCHAR(20),
  ceo_name VARCHAR(100),
  address VARCHAR(500),
  phone VARCHAR(20),
  email VARCHAR(100),
  website VARCHAR(255),
  logo_url VARCHAR(500),
  timezone VARCHAR(50) DEFAULT 'Asia/Seoul',
  currency VARCHAR(3) DEFAULT 'KRW',
  language VARCHAR(10) DEFAULT 'ko',
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100)
);

-- 인덱스
CREATE INDEX idx_company_code ON companies(company_code);
CREATE INDEX idx_company_status ON companies(status);

-- 초기 데이터
INSERT INTO companies VALUES (
  'ysacc_uuid_001',
  'YSACC',
  '(주)와이에스에이씨씨',
  'corporation',
  '2022-12345678',
  '이사장',
  '청주시 주소',
  '043-1234-5678',
  'contact@ysacc.co.kr',
  'www.ysacc.co.kr',
  NULL,
  'Asia/Seoul',
  'KRW',
  'ko',
  'active',
  NOW(),
  NOW(),
  'admin'
);

INSERT INTO companies VALUES (
  'youngsung_uuid_001',
  'YS',
  '영성ACC',
  'individual',
  '0000-00-00000',
  '소유자명',
  '주소',
  '010-xxxx-xxxx',
  'contact@youngsung.co.kr',
  'youngsung.co.kr',
  NULL,
  'Asia/Seoul',
  'KRW',
  'ko',
  'active',
  NOW(),
  NOW(),
  'admin'
);

소요 시간: 20분
```

#### Task 2.2: SQL 실행

```bash
# SQL 파일 실행
psql -U tms_user -h localhost -d trade_system < schema_01_companies.sql

# 확인
psql -U tms_user -h localhost -d trade_system -c "SELECT * FROM companies;"

결과:
company_id | company_code | company_name | status
-----------|--------------|--------------|--------
ysacc_... | YSACC | (주)와이에스에이씨씨 | active
youngsung_... | YS | 영성ACC | active

소요 시간: 5분
완료 조건: 두 회사 데이터 삽입됨
```

### Day 3-4: 나머지 DB 테이블 (Wednesday-Thursday)

#### Task 3.1: 마스터 테이블 생성

```sql
파일: schema_02_master.sql

-- Teams
CREATE TABLE teams (
  team_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users
CREATE TABLE users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  username VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  team_id UUID REFERENCES teams(team_id),
  phone VARCHAR(20),
  status VARCHAR(50) DEFAULT 'active',
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products
CREATE TABLE products (
  product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  name VARCHAR(255) NOT NULL,
  specification VARCHAR(255),
  unit VARCHAR(50) NOT NULL,
  category VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Suppliers
CREATE TABLE suppliers (
  supplier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  name VARCHAR(255) NOT NULL,
  address VARCHAR(500),
  contact_person VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  payment_terms VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers
CREATE TABLE customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  name VARCHAR(255) NOT NULL,
  country VARCHAR(100),
  city VARCHAR(100),
  address VARCHAR(500),
  contact_person VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(20),
  payment_terms VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX idx_team_company ON teams(company_id);
CREATE INDEX idx_user_company ON users(company_id);
CREATE INDEX idx_product_company ON products(company_id);
CREATE INDEX idx_supplier_company ON suppliers(company_id);
CREATE INDEX idx_customer_company ON customers(company_id);

실행:
psql -U tms_user -h localhost -d trade_system < schema_02_master.sql

소요 시간: 30분
```

#### Task 3.2: 샘플 데이터 입력

```sql
파일: seed_01_master.sql

-- YSACC 팀
INSERT INTO teams (team_id, company_id, name) VALUES
  ('ysacc_sales_team', 'ysacc_uuid_001', '영업팀'),
  ('ysacc_purchasing_team', 'ysacc_uuid_001', '구매팀'),
  ('ysacc_logistics_team', 'ysacc_uuid_001', '로지스틱팀');

-- 샘플 상품
INSERT INTO products (company_id, name, unit, category) VALUES
  ('ysacc_uuid_001', 'Cushion Pad', 'KG', 'Materials'),
  ('ysacc_uuid_001', 'EPOSHEET', 'BOX', 'Materials'),
  ('ysacc_uuid_001', 'Corner Protector', 'PCS', 'Components');

-- 샘플 공급사
INSERT INTO suppliers (company_id, name, email, payment_terms) VALUES
  ('ysacc_uuid_001', '폴린트', 'contact@polint.com', '선금'),
  ('ysacc_uuid_001', '공급처 B', 'info@supplier-b.com', '외상 30일');

-- 샘플 고객
INSERT INTO customers (company_id, name, country, city, payment_terms) VALUES
  ('ysacc_uuid_001', 'UNION', 'UAE', 'Dubai', 'LC 90 days'),
  ('ysacc_uuid_001', 'THERMOSET', 'UAE', 'JEBEL ALI', 'LC 90 days');

실행:
psql -U tms_user -h localhost -d trade_system < seed_01_master.sql

소요 시간: 20분
완료 조건: 마스터 데이터 입력 완료
```

### Day 5: 확인 & 정리 (Friday)

#### Checklist

```
☐ AntiGravity 계정 생성
☐ PostgreSQL 설치 & 실행 중
☐ Database 'trade_system' 생성
☐ companies 테이블 생성 & 데이터 입력 (2개 회사)
☐ master 테이블 생성 (teams, users, products, suppliers, customers)
☐ 샘플 데이터 입력
☐ AntiGravity에서 DB 연결 확인
☐ 샘플 데이터 조회 확인

모두 ☑ 이면 Week 1 진행 가능!
```

---

## 2. Week 1: 데이터베이스 & 인증

### 목표
- 모든 테이블 생성
- 로그인 시스템 구현
- 회사 선택 기능

### Day 1 (Mon): 테이블 생성 - PO & Cost Master

#### Task 1.1: PO 테이블 생성

```sql
파일: schema_03_po.sql

-- Purchase Orders
CREATE TABLE purchase_orders (
  po_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  po_number VARCHAR(100) NOT NULL,
  po_date DATE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(supplier_id),
  reference_person VARCHAR(100),
  delivery_date DATE,
  total_amount DECIMAL(15,2),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_po_number UNIQUE(company_id, po_number)
);

-- PO Line Items
CREATE TABLE po_line_items (
  poli_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(product_id),
  specification VARCHAR(255),
  quantity DECIMAL(10,2) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'KRW',
  total_amount DECIMAL(15,2),
  delivery_date DATE,
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX idx_po_company ON purchase_orders(company_id);
CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_poli_po ON po_line_items(po_id);

-- 시퀀스
CREATE SEQUENCE po_number_seq START WITH 1;

-- 트리거: PO 번호 자동 생성
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TRIGGER AS $$
DECLARE
  v_company_code VARCHAR(50);
BEGIN
  SELECT company_code INTO v_company_code
  FROM companies WHERE company_id = NEW.company_id;
  
  IF NEW.po_number IS NULL THEN
    NEW.po_number := 'PO-' || v_company_code || '-' 
                     || TO_CHAR(NEW.po_date, 'YYYY') || '-'
                     || LPAD(nextval('po_number_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_po_number
BEFORE INSERT ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION generate_po_number();

-- 트리거: 합계 자동 계산
CREATE OR REPLACE FUNCTION calculate_po_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE purchase_orders
  SET total_amount = (
    SELECT COALESCE(SUM(total_amount), 0)
    FROM po_line_items
    WHERE po_id = NEW.po_id
  )
  WHERE po_id = NEW.po_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_po_total
AFTER INSERT OR UPDATE OR DELETE ON po_line_items
FOR EACH ROW
EXECUTE FUNCTION calculate_po_total();

실행:
psql -U tms_user -h localhost -d trade_system < schema_03_po.sql

소요 시간: 30분
```

#### Task 1.2: Cost Master 테이블

```sql
파일: schema_04_cost.sql

-- Cost Master (매입가 마스터)
CREATE TABLE cost_master (
  cm_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  product_id UUID NOT NULL REFERENCES products(product_id),
  supplier_id UUID NOT NULL REFERENCES suppliers(supplier_id),
  po_id UUID REFERENCES purchase_orders(po_id),
  po_line_item_id UUID REFERENCES po_line_items(poli_id),
  po_number VARCHAR(100),
  unit_price DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'KRW',
  unit VARCHAR(50) NOT NULL,
  effective_date DATE NOT NULL,
  is_latest BOOLEAN DEFAULT TRUE,
  version INT DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  
  CONSTRAINT unique_cost_version UNIQUE(company_id, product_id, supplier_id, version)
);

-- 인덱스
CREATE INDEX idx_cost_company ON cost_master(company_id);
CREATE INDEX idx_cost_latest ON cost_master(company_id, product_id, is_latest, effective_date DESC);
CREATE INDEX idx_cost_supplier ON cost_master(company_id, supplier_id, is_latest);

-- 트리거: PO 저장 시 매입가 자동 저장
CREATE OR REPLACE FUNCTION save_cost_on_po_confirm()
RETURNS TRIGGER AS $$
DECLARE
  v_poli record;
  v_next_version INT;
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    -- PO의 모든 라인 아이템 조회
    FOR v_poli IN 
      SELECT * FROM po_line_items WHERE po_id = NEW.po_id
    LOOP
      -- 기존 최신 비용을 이전 버전으로 변경
      UPDATE cost_master
      SET is_latest = FALSE
      WHERE company_id = NEW.company_id
        AND product_id = v_poli.product_id
        AND supplier_id = NEW.supplier_id
        AND is_latest = TRUE;
      
      -- 다음 버전 번호 계산
      SELECT COALESCE(MAX(version), 0) + 1 
      INTO v_next_version
      FROM cost_master
      WHERE company_id = NEW.company_id
        AND product_id = v_poli.product_id
        AND supplier_id = NEW.supplier_id;
      
      -- 새 매입가 저장
      INSERT INTO cost_master (
        cm_id, company_id, product_id, supplier_id,
        po_id, po_line_item_id, po_number,
        unit_price, currency, unit, effective_date,
        is_latest, version, created_by
      ) VALUES (
        gen_random_uuid(), NEW.company_id, v_poli.product_id, NEW.supplier_id,
        NEW.po_id, v_poli.poli_id, NEW.po_number,
        v_poli.unit_price, v_poli.currency, v_poli.unit, NEW.po_date,
        TRUE, v_next_version, NEW.created_by
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_save_cost_on_po_confirm
AFTER UPDATE ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION save_cost_on_po_confirm();

실행:
psql -U tms_user -h localhost -d trade_system < schema_04_cost.sql

소요 시간: 30분
완료 조건: PO 및 Cost Master 테이블 생성
```

### Day 2 (Tue): 테이블 생성 - PI & Revision

#### Task 2.1: PI 테이블

```sql
파일: schema_05_pi.sql

-- Proforma Invoices
CREATE TABLE proforma_invoices (
  pi_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_number VARCHAR(100) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(customer_id),
  pi_date DATE NOT NULL,
  payment_terms VARCHAR(100),
  incoterms VARCHAR(50),
  destination VARCHAR(255),
  exchange_rate DECIMAL(10,4) NOT NULL,
  validity_days INT DEFAULT 30,
  current_version VARCHAR(10) DEFAULT 'A',
  status VARCHAR(50) DEFAULT 'draft',
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_pi_number UNIQUE(company_id, pi_number)
);

-- PI Revisions
CREATE TABLE pi_revisions (
  pr_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_id UUID NOT NULL REFERENCES proforma_invoices(pi_id) ON DELETE CASCADE,
  version VARCHAR(10) NOT NULL,
  revision_number INT,
  exchange_rate DECIMAL(10,4) NOT NULL,
  payment_terms VARCHAR(100),
  incoterms VARCHAR(50),
  destination VARCHAR(255),
  validity_days INT,
  revision_reason VARCHAR(500),
  related_negotiation_id UUID,
  status VARCHAR(50) DEFAULT 'draft',
  customer_feedback TEXT,
  feedback_received_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  
  CONSTRAINT unique_pi_version UNIQUE(pi_id, version)
);

-- PI Revision Line Items
CREATE TABLE pi_revision_line_items (
  pril_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_revision_id UUID NOT NULL REFERENCES pi_revisions(pr_id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(product_id),
  cost_master_id UUID REFERENCES cost_master(cm_id),
  cost_krw DECIMAL(12,2) NOT NULL,
  supplier_id UUID REFERENCES suppliers(supplier_id),
  quantity DECIMAL(10,2) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  exchange_rate DECIMAL(10,4) NOT NULL,
  profit_margin DECIMAL(5,2) NOT NULL,
  sale_price_usd DECIMAL(12,4) NOT NULL,
  total_usd DECIMAL(15,4) NOT NULL,
  change_reason TEXT,
  previous_sale_price_usd DECIMAL(12,4),
  price_change_percent DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX idx_pi_company ON proforma_invoices(company_id);
CREATE INDEX idx_pi_customer ON proforma_invoices(customer_id);
CREATE INDEX idx_pr_company ON pi_revisions(company_id);
CREATE INDEX idx_pril_company ON pi_revision_line_items(company_id);

-- 시퀀스
CREATE SEQUENCE pi_number_seq START WITH 1;

-- 트리거: PI 번호 자동 생성
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pi_number
BEFORE INSERT ON proforma_invoices
FOR EACH ROW
EXECUTE FUNCTION generate_pi_number();

실행:
psql -U tms_user -h localhost -d trade_system < schema_05_pi.sql

소요 시간: 30분
```

#### Task 2.2: 협상 & 로깅 테이블

```sql
파일: schema_06_negotiation.sql

-- Supplier Negotiations
CREATE TABLE supplier_negotiations (
  neg_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  supplier_id UUID NOT NULL REFERENCES suppliers(supplier_id),
  product_id UUID NOT NULL REFERENCES products(product_id),
  negotiation_number VARCHAR(100) NOT NULL,
  negotiation_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'proposed',
  current_cost_krw DECIMAL(12,2) NOT NULL,
  proposed_cost_krw DECIMAL(12,2) NOT NULL,
  change_type VARCHAR(20) NOT NULL,
  change_percent DECIMAL(5,2),
  reason TEXT NOT NULL,
  our_response TEXT,
  our_counter_offer_krw DECIMAL(12,2),
  final_agreed_cost_krw DECIMAL(12,2),
  agreed_at TIMESTAMP,
  affected_pi_count INT,
  will_trigger_new_revision BOOLEAN DEFAULT FALSE,
  initiated_by_supplier BOOLEAN DEFAULT TRUE,
  sales_person_id UUID REFERENCES users(user_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_neg_number UNIQUE(company_id, negotiation_number)
);

-- Cost Change Log
CREATE TABLE cost_change_log (
  ccl_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_id UUID REFERENCES proforma_invoices(pi_id),
  pi_version VARCHAR(10),
  product_id UUID NOT NULL REFERENCES products(product_id),
  supplier_id UUID REFERENCES suppliers(supplier_id),
  old_cost_krw DECIMAL(12,2),
  new_cost_krw DECIMAL(12,2),
  change_percent DECIMAL(5,2),
  old_sale_price_usd DECIMAL(12,4),
  new_sale_price_usd DECIMAL(12,4),
  sale_price_impact DECIMAL(12,4),
  triggered_revision_id UUID REFERENCES pi_revisions(pr_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100)
);

-- Audit Log
CREATE TABLE audit_log (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  operation VARCHAR(50) NOT NULL,
  field_name VARCHAR(100),
  old_value TEXT,
  new_value TEXT,
  changed_by VARCHAR(100),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스
CREATE INDEX idx_neg_company ON supplier_negotiations(company_id);
CREATE INDEX idx_ccl_company ON cost_change_log(company_id);
CREATE INDEX idx_audit_company ON audit_log(company_id);

-- 시퀀스
CREATE SEQUENCE neg_number_seq START WITH 1;

-- 트리거: 협상 번호 자동 생성
CREATE OR REPLACE FUNCTION generate_neg_number()
RETURNS TRIGGER AS $$
DECLARE
  v_company_code VARCHAR(50);
BEGIN
  SELECT company_code INTO v_company_code
  FROM companies WHERE company_id = NEW.company_id;
  
  IF NEW.negotiation_number IS NULL THEN
    NEW.negotiation_number := 'NEG-' || v_company_code || '-'
                              || TO_CHAR(NEW.negotiation_date, 'YYYY') || '-'
                              || LPAD(nextval('neg_number_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_neg_number
BEFORE INSERT ON supplier_negotiations
FOR EACH ROW
EXECUTE FUNCTION generate_neg_number();

실행:
psql -U tms_user -h localhost -d trade_system < schema_06_negotiation.sql

소요 시간: 30분
완료 조건: 모든 테이블 생성 완료
```

### Day 3 (Wed): AntiGravity에 테이블 임포트

#### Task 3.1: AntiGravity에서 스키마 동기화

```
AntiGravity Studio:
  1. 왼쪽 메뉴 → "Database"
  2. PostgreSQL Data Source 선택
  3. "Sync Schema" 또는 "Refresh" 버튼 클릭
  4. 모든 테이블이 표시되는지 확인
  
  확인할 테이블:
    ☐ companies
    ☐ teams
    ☐ users
    ☐ products
    ☐ suppliers
    ☐ customers
    ☐ purchase_orders
    ☐ po_line_items
    ☐ cost_master
    ☐ proforma_invoices
    ☐ pi_revisions
    ☐ pi_revision_line_items
    ☐ supplier_negotiations
    ☐ cost_change_log
    ☐ audit_log

소요 시간: 15분
완료 조건: 모든 테이블이 AntiGravity에서 보임
```

#### Task 3.2: CRUD API 자동 생성 확인

```
AntiGravity:
  1. "API" 메뉴 확인
  2. 각 테이블별 API가 자동 생성되었는지 확인
  
  자동 생성된 API:
    GET    /api/companies
    GET    /api/companies/:id
    POST   /api/companies
    PUT    /api/companies/:id
    DELETE /api/companies/:id
    
    GET    /api/purchase-orders
    POST   /api/purchase-orders
    ...
    
    등등

소요 시간: 10분
완료 조건: 모든 테이블의 CRUD API 확인
```

### Day 4-5 (Thu-Fri): 로그인 & 회사 선택 화면

#### Task 4.1: 로그인 화면 구현

```
AntiGravity Page Builder:
  
1. 페이지 생성
   Menu → Pages → New Page
   페이지명: "LoginPage"

2. 화면 디자인
   Component: Form Container
     - Field 1: Username
       Type: Text Input
       Placeholder: "사용자명"
       Required: Yes
       Binding: {{ loginForm.username }}
     
     - Field 2: Password
       Type: Password Input
       Placeholder: "비밀번호"
       Required: Yes
       Binding: {{ loginForm.password }}
     
     - Button: 로그인
       Text: "로그인"
       onClick: {{ handleLogin() }}
     
     - Link: 비밀번호 재설정
       Text: "비밀번호 재설정"
       onClick: {{ navigateTo('/forgot-password') }}

3. 로직 구현
   Action: handleLogin()
   
   // Step 1: 유효성 검사
   IF username is empty OR password is empty:
     showError("사용자명과 비밀번호를 입력하세요")
     return
   
   // Step 2: API 호출
   API: POST /api/auth/login
   Body: { username, password }
   
   // Step 3: 결과 처리
   IF success:
     saveToken(token)
     navigateTo('/company-select')
   ELSE:
     showError(response.message)

소요 시간: 1시간
완료 조건: 로그인 페이지 구현 및 테스트 완료
```

#### Task 4.2: 회사 선택 화면

```
AntiGravity Page Builder:

1. 페이지 생성
   페이지명: "CompanySelectPage"

2. 화면 디자인
   Component: Text Display
     Content: "안녕하세요, {{ currentUser.name }}님!"
   
   Component: Data Table
     Data Source: API /api/users/companies
     Columns:
       - company_name
       - role
       - is_primary
     
     Action: Select Company
       onClick: {{ selectCompany(row.company_id) }}

3. 로직
   Action: selectCompany(company_id)
   
   // Step 1: 회사 선택 API 호출
   API: POST /api/auth/select-company
   Body: { company_id }
   
   // Step 2: 새 토큰 저장
   saveToken(response.token)
   saveCompanyInfo(response.company)
   
   // Step 3: 대시보드로 이동
   navigateTo('/dashboard')

소요 시간: 1시간
완료 조건: 회사 선택 페이지 구현 및 테스트 완료
```

#### Task 4.3: 테스트

```
테스트 케이스:

1. 로그인 테스트
   ☐ 사용자명 미입력 → 오류 메시지
   ☐ 비밀번호 미입력 → 오류 메시지
   ☐ 잘못된 자격증명 → 오류 메시지
   ☐ 올바른 자격증명 → 회사 선택 페이지로 이동
   
2. 회사 선택 테스트
   ☐ 회사 목록 표시 (2개)
   ☐ YSACC 선택 → 대시보드 (YSACC 데이터)
   ☐ 영성ACC 선택 → 대시보드 (영성ACC 데이터)

소요 시간: 1시간
완료 조건: 모든 테스트 통과
```

#### Week 1 Checklist

```
☐ 모든 DB 테이블 생성 완료
☐ 샘플 데이터 입력 완료
☐ AntiGravity에 스키마 임포트 완료
☐ 자동 API 생성 확인
☐ 로그인 페이지 구현 & 테스트
☐ 회사 선택 페이지 구현 & 테스트
☐ 로그인 → 회사 선택 → 대시보드 흐름 동작 확인

다음: Week 2 마스터 관리 및 PO 시스템
```

---

## 3. Week 2: 회사 관리 & 기본 기능

### 목표
- 마스터 데이터 관리 화면
- 발주서(PO) 시스템 구현
- 매입가 자동 저장 검증

### Day 1 (Mon): 마스터 관리 - 상품, 공급사, 고객

#### Task 1.1: 상품 관리 화면

```
AntiGravity Page Builder:

1. 페이지: ProductManagementPage

2. 화면 구성
   
   Section: Search & Filter
     - Search by name: {{ searchText }}
     - Status filter: [Active/Inactive]
     - Button: [검색]
   
   Section: Product List (Table)
     Data Source: GET /api/products
     Columns:
       - name
       - specification
       - unit
       - category
       - status
       - actions
     
     Action Buttons:
       - [수정] → Edit Modal
       - [삭제] → Confirm & Delete
   
   Section: Add Product Button
     - [+ 상품 추가] → Add Modal

3. Add/Edit Modal
   Fields:
     - Product Name (required)
     - Specification
     - Unit (dropdown): KG, BOX, PCS, M, EA
     - Category (dropdown): Materials, Components, etc.
     - Status (dropdown): active, inactive
   
   Buttons: [저장] [취소]

소요 시간: 1.5시간
```

#### Task 1.2: 공급사 & 고객 관리

```
동일한 방식으로 구현:

SupplierManagementPage:
  Fields:
    - Supplier Name
    - Address
    - Contact Person
    - Phone
    - Email
    - Payment Terms
    - Status

CustomerManagementPage:
  Fields:
    - Customer Name
    - Country
    - City
    - Address
    - Contact Person
    - Email
    - Phone
    - Payment Terms
    - Status

소요 시간: 2시간
완료 조건: 마스터 데이터 관리 화면 완성
```

### Day 2 (Tue): 발주서(PO) 시스템

#### Task 2.1: PO 작성 화면

```
AntiGravity Page Builder:

1. 페이지: PurchaseOrderPage

2. 기본 정보 섹션
   - PO Number: [자동, 읽기전용]
   - PO Date: [date picker, 기본값: 오늘]
   - Supplier: [dropdown, 필수]
   - Reference Person: [text input]
   - Delivery Date: [date picker]

3. 상품 라인 섹션
   Component: Data Table (in-memory)
     Columns:
       - Product: [dropdown]
       - Specification: [text]
       - Qty: [number]
       - Unit: [dropdown]
       - Unit Price (KRW): [number] ★
       - Total: [계산, 읽기전용]
       - [삭제] button
     
     Bottom Actions:
       - [+ 상품 추가]

4. 합계 섹션
   - Total Amount: [자동 계산, 읽기전용]

5. 버튼
   - [임시저장]
   - [확정]
   - [삭제]
   - [PDF 생성]

구현 로직:
  
  Action: addProduct()
    Modal Open: Product 선택
    Modal Input:
      - Product: [dropdown] → onChange: 규격 자동 제시
      - Qty: [number]
      - Unit: [dropdown]
      - Unit Price: [number, 필수]
    Modal Buttons: [추가] [취소]
    
    On Add:
      - 테이블에 행 추가
      - Total = Qty × Unit Price 자동 계산
      - PO 합계 재계산
  
  Action: confirmPO()
    ☐ 공급사 선택 확인
    ☐ 상품 라인 1개 이상 확인
    ☐ 모든 단가 입력 확인
    IF 검증 실패:
      showError("필수 정보를 입력하세요")
      return
    
    // API: PO 저장
    API: POST /api/purchase-orders
    Body: {
      supplier_id, po_date, reference_person,
      delivery_date, notes,
      line_items: [{ product_id, qty, unit, unit_price }]
    }
    
    Response:
      { po_id, po_number, status: "confirmed", ... }
    
    showSuccess("PO가 저장되었습니다: PO-{{ po_number }}")
    navigateTo('/po-detail/' + po_id)

소요 시간: 2시간
```

#### Task 2.2: PO 목록 & 상세 화면

```
PurchaseOrderListPage:
  - 검색 & 필터: supplier, date, status
  - 테이블: PO Number, Supplier, Date, Status, Total Amount
  - 클릭: PO 상세 페이지로 이동

PurchaseOrderDetailPage:
  - PO 기본정보 (읽기전용)
  - 상품 라인 테이블 (수정 불가)
  - cost_master 자동 저장 확인 로그
  - [뒤로가기] 버튼

소요 시간: 1.5시간
```

### Day 3 (Wed): 매입가 자동 저장 검증

#### Task 3.1: 매입가 조회 API 테스트

```
테스트 시나리오:

1. PO 생성 및 확정
   - PO: Cushion Pad 50KG @ 5,000 KRW
   - Supplier: 폴린트
   - Status: confirmed
   
2. cost_master 확인
   Query:
   SELECT * FROM cost_master
   WHERE product_id = 'cushion_id'
     AND supplier_id = 'polint_id'
     AND is_latest = TRUE
   
   결과:
   cm_id | product_id | supplier_id | unit_price | is_latest
   ------|------------|-------------|----------- |-----------
   new_uuid | cushion_id | polint_id | 5000 | TRUE
   
   ☑ 매입가가 자동으로 저장됨!

3. 매입가 이력 확인
   Query:
   SELECT * FROM cost_master
   WHERE product_id = 'cushion_id'
     AND supplier_id = 'polint_id'
   ORDER BY effective_date DESC
   
   결과:
   - NEW: 5,000 KRW (PO-YSACC-2026-001) is_latest=TRUE
   - OLD: (이전 버전들) is_latest=FALSE

소요 시간: 1시간
```

#### Task 3.2: 매입가 조회 화면

```
AntiGravity Page Builder:

CostMasterPage:
  
Section: 최신 매입가
  Component: Data Table
  Data Source: GET /api/cost-master/latest
  Filter: company_id (현재 회사)
  
  Columns:
    - Product Name
    - Supplier Name
    - Unit Price (KRW)
    - PO Number
    - Effective Date
    - Version

Section: 매입가 이력
  Component: Chart (Line Graph)
  X-axis: Date
  Y-axis: Unit Price
  Data: Cost History by Product
  
  또는
  
  Component: Data Table
  Data Source: GET /api/cost-master/history/:productId
  Filter: 선택한 상품의 이력
  
  Columns:
    - PO Number
    - Supplier
    - Unit Price
    - Date
    - Status (Latest/Historical)

소요 시간: 1.5시간
```

### Day 4 (Thu): 메뉴 & 네비게이션

#### Task 4.1: 메인 메뉴 구성

```
네비게이션 메뉴:

TopBar:
  [로고] TMS | 회사: YSACC ▼ | [사용자명▼]

SideBar:
  📊 Dashboard
  📝 Purchase Orders
  📋 Master Data
     ├─ Products
     ├─ Suppliers
     └─ Customers
  💰 Cost Master
  📄 Proforma Invoices
  🤝 Negotiations
  ⚙️ Settings
  🚪 Logout

구현:
  - 각 메뉴 항목이 해당 페이지로 네비게이션
  - 현재 페이지 하이라이트
  - 회사 전환 버튼: 회사 선택 페이지로

소요 시간: 1시간
```

#### Task 4.2: 회사 전환 기능

```
회사 전환 시:
  1. 현재 토큰 폐기
  2. 새 토큰 발급 (다른 company_id)
  3. 대시보드 리로드 (새 회사의 데이터)
  4. 사이드바 메뉴도 새 회사 기준으로 업데이트

구현:
  TopBar의 "회사" 드롭다운:
    YSACC (현재) ✓
    영성ACC
    
  영성ACC 클릭:
    API: POST /api/auth/select-company
    Body: { company_id: "youngsung_uuid" }
    
    Response: { token, company_info, ... }
    
    localStorage 업데이트
    Page 리로드 또는 대시보드로 리다이렉트

소요 시간: 1시간
완료 조건: 회사 전환 완벽하게 동작
```

### Day 5 (Fri): 테스트 & 정리

#### Task 5.1: 통합 테스트

```
테스트 케이스:

1. 로그인 → 회사 선택 → 대시보드
   ☑ YSACC 선택 → YSACC 데이터만 표시
   ☑ 영성ACC로 전환 → 영성ACC 데이터만 표시

2. PO 생성 및 확정
   ☑ YSACC로: PO-YSACC-2026-001 생성
   ☑ 영성ACC로: PO-YS-2026-001 생성
   ☑ 두 PO가 섞이지 않음

3. 매입가 자동 저장
   ☑ PO 확정 시 cost_master에 자동 저장
   ☑ 다음 PO에서 같은 상품 선택 시 이전 버전은 is_latest=FALSE

4. 마스터 데이터 관리
   ☑ 상품 추가/수정/삭제
   ☑ 공급사 추가/수정/삭제
   ☑ 고객 추가/수정/삭제

소요 시간: 2시간
```

#### Week 2 Checklist

```
☐ 마스터 관리 화면 완성 (상품, 공급사, 고객)
☐ PO 작성 화면 완성
☐ PO 목록 & 상세 화면 완성
☐ 매입가 조회 화면 완성
☐ PO 확정 시 cost_master 자동 저장 검증
☐ 네비게이션 메뉴 완성
☐ 회사 전환 완벽 동작
☐ 통합 테스트 완료

다음: Week 3 PI & Revision 시스템
```

---

## 4. Week 3: PI & Revision

### 목표
- 견적서(PI) 시스템 구현
- 판매가 자동 계산
- Revision 자동 생성

### Day 1 (Mon): PI 작성 화면 ★★★

#### Task 1.1: PI 기본 형식

```
AntiGravity Page Builder:

ProformaInvoicePage:

Section 1: PI 기본정보
  - PI Number: [자동, 읽기전용]
  - PI Date: [date picker, 기본: 오늘]
  - Customer: [dropdown, 필수] ★
  - Payment Terms: [dropdown, 자동 로드]
  - Incoterms: [dropdown]
  - Destination: [text]
  - Validity: [number] days

Section 2: 환율 & 이익률
  - Exchange Rate: [숫자입력] ★★
    예: 1468.96
    [환율 업데이트 버튼]
  - Default Profit Margin: [숫자, %] ★★
    예: 10 (→ 0.10)

Section 3: 상품 라인 ★★★
  Table (In-Memory):
    Columns:
      - Product: [dropdown] ★★★
        onChange: loadCostMaster()
      - Qty: [number]
      - Unit: [dropdown]
      - Cost KRW: [읽기전용, 자동로드]
      - Profit Margin: [number, %]
      - Sale Price USD: [읽기전용, 자동계산]
      - Total USD: [계산]
      - [삭제]
    
    Bottom: [+ 상품 추가]

Section 4: 합계
  - Subtotal: [계산, 읽기전용]
  - Grand Total: [계산, 읽기전용]

Section 5: 버튼
  - [임시저장] [확정] [PDF] [Excel] [이메일]

소요 시간: 2시간
```

#### Task 1.2: 핵심 동작 - 판매가 자동 계산

```
동작 흐름:

1️⃣ Product 선택
   onChange: {{ onProductSelected(productId) }}
   
   Action: loadCostMaster()
     API: GET /api/cost-master/latest/{{ productId }}
     
     Response:
     {
       cost_master_id: "...",
       cost_krw: 5000,
       supplier_id: "polint_uuid",
       unit: "KG",
       ...
     }
     
     // 테이블 행에 자동 채우기
     line.costKRW = 5000
     line.costMasterId = "..."
     
     // 계산 트리거
     calculateSalePrice()

2️⃣ Profit Margin 변경
   onChange: {{ onMarginChanged() }}
   
   Action: calculateSalePrice()
     costUSD = costKRW / exchangeRate
             = 5000 / 1468.96
             = 3.40 USD
     
     salePriceUSD = costUSD / (1 - profitMargin)
                  = 3.40 / (1 - 0.10)
                  = 3.40 / 0.9
                  = 3.7777... USD
                  ≈ 3.78 USD
     
     line.salePriceUSD = 3.78
     line.totalUSD = 3.78 × qty = 189 (qty=50일 때)
     
     // 전체 합계 재계산
     calculateTotals()

3️⃣ Exchange Rate 변경
   onChange: {{ onExchangeRateChanged() }}
   
   Action: recalculateAll()
     // 모든 라인의 판매가 재계산
     FOR EACH line:
       calculateSalePrice(line)
     
     calculateTotals()

4️⃣ 수량 변경
   onChange: {{ onQtyChanged() }}
   
   Action: calculateTotals()
     total = salePriceUSD × qty
     subtotal = sum(all total)

구현 코드 (AntiGravity Custom Action):

calculateSalePrice() {
  FOR EACH row IN lineItems:
    const costUSD = row.costKRW / currentExchangeRate
    const margin = row.profitMargin / 100  // 10 → 0.10
    const salePrice = costUSD / (1 - margin)
    
    row.salePriceUSD = ROUND(salePrice, 4)
    row.totalUSD = ROUND(salePrice × row.qty, 4)
}

calculateTotals() {
  const subtotal = SUM(lineItems.*.totalUSD)
  this.grandTotal = subtotal
}

소요 시간: 2시간
완료 조건: 판매가 자동 계산 완벽하게 동작
```

### Day 2 (Tue): PI 저장 & 라인 아이템

#### Task 2.1: PI 저장 로직

```
Action: savePI()
  
  // Step 1: 유효성 검사
  IF NOT customer_id:
    showError("고객사를 선택하세요")
    return
  
  IF NOT exchange_rate OR exchange_rate <= 0:
    showError("환율을 입력하세요")
    return
  
  IF lineItems.length === 0:
    showError("상품을 1개 이상 추가하세요")
    return
  
  // Step 2: 모든 라인 검증
  FOR EACH line IN lineItems:
    IF NOT line.costKRW:
      showError("상품: " + line.productName + " 매입가 로드 실패")
      return
    IF NOT line.salePriceUSD:
      showError("상품: " + line.productName + " 판매가 계산 실패")
      return
  
  // Step 3: PI 저장 (헤더)
  API: POST /api/proforma-invoices
  Body: {
    customer_id,
    pi_date,
    payment_terms,
    incoterms,
    destination,
    exchange_rate,
    validity_days,
    default_profit_margin,
    current_version: "A",
    status: "draft"
  }
  
  Response: { pi_id, pi_number, ... }
  
  // Step 4: Revision 생성 (A 버전)
  API: POST /api/proforma-invoices/{{ pi_id }}/revisions
  Body: {
    version: "A",
    exchange_rate,
    payment_terms,
    incoterms,
    line_items: [
      {
        product_id,
        cost_master_id,
        cost_krw,
        supplier_id,
        quantity,
        unit,
        exchange_rate,
        profit_margin,
        sale_price_usd,
        total_usd
      },
      ...
    ]
  }
  
  Response: { pr_id, version: "A", ... }
  
  // Step 5: 성공 메시지
  showSuccess("PI가 저장되었습니다: PI-{{ pi_number }}-{{ version }}")
  navigateTo('/pi-detail/' + pi_id)

소요 시간: 1.5시간
```

#### Task 2.2: PI 목록 & 상세

```
ProformaInvoiceListPage:
  - 검색: customer, status, date range
  - 테이블: PI Number, Customer, Status, Version, Total USD
  - 클릭: PI 상세 페이지

ProformaInvoiceDetailPage:
  - PI 기본정보 (읽기전용)
  - 현재 Revision 내용
  - Revision 타임라인 (클릭 → 해당 Revision 상세보기)
  - [수정] [Revision 생성] [확정] [PDF] [Excel] [이메일]

소요 시간: 1.5시간
```

### Day 3 (Wed): Revision 관리

#### Task 3.1: Revision 자동 생성 기능

```
버튼: [+ 새 Revision]

Modal: 새 Revision 생성
  
  Fields:
    - 현재 버전: A (읽기전용)
    - 새 버전: B (자동, 읽기전용)
    - 사유: [텍스트, 필수]
      옵션:
        - 공급처 가격 변경
        - 고객 요청
        - 환율 변경
        - 기타
    - 라인 아이템:
      A 버전의 라인들을 표시
      수정 가능 필드:
        - Cost KRW (공급처 변경 시)
        - Profit Margin
      읽기전용:
        - Product
        - Qty
  
  Action: 생성
    // 새 Revision 저장 및 비교 화면 표시

소요 시간: 1.5시간
```

#### Task 3.2: Revision 비교 화면

```
RevisionComparisonPage:

Header:
  PI-YSACC-2026-01
  Rev. A (Original) | Rev. B (New) | [비교 보기]

Content:

┌─────────────────────────────────────────┐
│ Rev. A (2026-01-15)                    │
├─────────────────────────────────────────┤
│ Product | Qty | Cost KRW | Sale USD|   │
│ Cushion | 50  | 5000     | 3.78   |   │
│ EPOSHEET| 10  | 28000    | 213.79 |   │
├─────────────────────────────────────────┤
│ Total: 189 USD                          │
└─────────────────────────────────────────┘

vs

┌─────────────────────────────────────────┐
│ Rev. B (2026-01-16)                    │
├─────────────────────────────────────────┤
│ Product | Qty | Cost KRW | Sale USD| Δ │
│ Cushion | 50  | 5100 ↑   | 3.86 ↑ |+8 │
│ EPOSHEET| 10  | 28000    | 213.79 |   │
├─────────────────────────────────────────┤
│ Total: 197 USD (+8 USD, +4%)            │
└─────────────────────────────────────────┘

Δ (변경량):
  빨강: 증가
  초록: 감소
  검은색: 변경 없음

소요 시간: 1시간
```

### Day 4 (Thu): 협상 & 자동 Revision

#### Task 4.1: 협상 관리 화면

```
SupplierNegotiationPage:

Section 1: 새 협상 등록
  - Supplier: [dropdown]
  - Product: [dropdown]
  - Current Price (KRW): [읽기전용, 자동로드]
  - Proposed Price (KRW): [입력]
  - Change %: [계산, 읽기전용]
  - Reason: [텍스트]
  Button: [제안]

Section 2: 진행 중인 협상 (테이블)
  Status: proposed
  Columns:
    - Negotiation #
    - Supplier
    - Product
    - Current → Proposed
    - Change %
    - Status
    - [상세보기] [메시지] [합의] [거절]

Section 3: 완료된 협상 (테이블)
  Status: agreed
  Columns:
    - 위와 동일

소요 시간: 1.5시간
```

#### Task 4.2: 협상 합의 → 자동 Revision 생성

```
협상 상세 페이지에서 [합의] 버튼 클릭:

Modal: 최종 합의 확인
  
  현재가: 5,000 KRW
  제안가: 5,200 KRW
  
  우리 제안: [5,100 KRW 입력]
  
  [합의] [더 협상] [거절]

[합의] 클릭:
  
  API: PUT /api/supplier-negotiations/{{ neg_id }}/agree
  Body: {
    final_agreed_cost_krw: 5100,
    agreement_date: NOW()
  }
  
  백엔드 처리:
    1. 협상 상태 = "agreed"
    2. 이 공급처를 사용한 PI 찾기 (draft/sent)
    3. 각 PI마다:
       - 새 Revision 생성 (B, C, D...)
       - 해당 공급처 라인의 cost_krw 업데이트
       - sale_price_usd 재계산
       - cost_change_log 기록
    4. 이메일 알림 발송
  
  Response:
  {
    negotiation_status: "agreed",
    created_revisions: [
      { pi_number: "PI-YSACC-2026-01", new_version: "B", ... }
    ]
  }
  
  Frontend:
    showSuccess("협상이 합의되었습니다. 다음 Revision이 생성되었습니다:")
    // created_revisions 목록 표시
    // 각 PI로 이동 가능

소요 시간: 2시간
완료 조건: 협상 합의 시 자동으로 Revision 생성 확인
```

### Day 5 (Fri): 테스트 & 정리

#### Task 5.1: PI & Revision 통합 테스트

```
테스트 시나리오 1: PI 생성 및 판매가 자동 계산

1. PI 작성 페이지 열기
2. Customer: UNION 선택
   → Payment Terms, Incoterms 자동 로드
3. Exchange Rate: 1468.96 입력
4. Default Margin: 10 입력
5. 상품 추가: Cushion Pad
   → cost_krw: 5000 자동로드
   → cost_usd: 3.40 계산
   → sale_price_usd: 3.78 계산 (3.40 / 0.9)
   → total_usd: 189 (3.78 × 50)
6. 상품 추가: EPOSHEET
   → 유사하게 계산
7. [확정] 클릭
   → PI-YSACC-2026-01 생성
   → Version A 생성
   → DB 확인:
      SELECT * FROM proforma_invoices 
      WHERE pi_number = 'PI-YSACC-2026-01'
      → current_version = A ✓
      
      SELECT * FROM pi_revisions
      WHERE pi_id = ... AND version = 'A'
      → 데이터 저장됨 ✓

테스트 결과: ☑ PASS

테스트 시나리오 2: Revision 자동 생성

1. 협상 생성: 폴린트 가격 5000 → 5100 KRW
2. 협상 합의
3. 확인:
   SELECT * FROM supplier_negotiations
   WHERE negotiation_number = 'NEG-YSACC-2026-001'
   → status = 'agreed' ✓
   
   SELECT * FROM proforma_invoices
   WHERE pi_number = 'PI-YSACC-2026-01'
   → current_version = 'B' ✓ (자동 업데이트)
   
   SELECT * FROM pi_revisions
   WHERE pi_id = ...
   → version A, B 모두 존재 ✓
   
   SELECT * FROM pi_revision_line_items
   WHERE pi_revision_id = ... AND version = 'B'
   → Cushion Pad: cost_krw = 5100 (변경됨) ✓
   → sale_price_usd = 3.86 (재계산됨) ✓

테스트 결과: ☑ PASS

소요 시간: 2시간
```

#### Week 3 Checklist

```
☐ PI 작성 화면 완성
☐ Product 선택 시 cost_master 자동로드
☐ 판매가 자동 계산 (이익률 기반)
☐ PI 저장 & Revision A 생성
☐ PI 목록 & 상세 화면
☐ Revision 비교 화면
☐ 협상 관리 화면
☐ 협상 합의 시 자동 Revision 생성 ★
☐ 모든 계산 로직 검증
☐ 통합 테스트 완료

다음: Week 4 배포 & 마무리
```

---

## 5. Week 4: 배포 & 마무리

### 목표
- PDF/Excel 생성
- 대시보드 구현
- 라이브 배포

(시간 관계상 개요만 제시)

### Day 1-2: PDF & Excel 생성

```
PDF 생성:
  - PO PDF 템플릿
  - PI PDF 템플릿
  - Revision 비교 PDF

Excel 생성:
  - PI 라인 아이템 Export
  - 비용 분석 Export

소요 시간: 4시간
```

### Day 3: 대시보드

```
대시보드 구성:
  - 현황 카드 (진행중, 완료, 지연)
  - 최근 활동
  - 수익성 분석 (그래프)

소요 시간: 2시간
```

### Day 4-5: 테스트 & 배포

```
최종 테스트:
  ☐ 모든 API 테스트
  ☐ 모든 화면 테스트
  ☐ 계산 검증
  ☐ 권한 검증
  ☐ 다중 회사 격리 검증

배포:
  ☐ AntiGravity 라이브 배포
  ☐ DB 백업
  ☐ 사용자 매뉴얼
  ☐ 운영팀 교육

소요 시간: 8시간
```

---

## 6. 테스트 & 검증

### 6.1 기능 테스트 체크리스트

```
┌─ 인증 & 권한
│  ☐ 로그인 (정상/오류)
│  ☐ 회사 선택
│  ☐ 회사 전환
│  ☐ 로그아웃
│  ☐ 권한 검증 (PO 생성, PI 확정 등)
│
├─ 다중 회사
│  ☐ YSACC 데이터 격리
│  ☐ 영성ACC 데이터 격리
│  ☐ 번호 생성 (회사별)
│    ├─ YSACC: PO-YSACC-2026-001
│    └─ YS: PO-YS-2026-001
│
├─ PO 시스템
│  ☐ PO 생성
│  ☐ PO 수정 (draft)
│  ☐ PO 확정
│  ☐ cost_master 자동 저장
│  ☐ PO 삭제 (soft delete)
│
├─ PI 시스템 ★★★
│  ☐ PI 작성
│  ☐ Product 선택 → cost_master 자동로드
│  ☐ 판매가 자동 계산
│    ├─ 10% 마진: 3.40 / 0.9 = 3.78 USD ✓
│    ├─ 15% 마진: 3.40 / 0.85 = 4.00 USD ✓
│  ☐ 환율 변경 → 모든 가격 재계산
│  ☐ PI 저장 & Revision A 생성
│  ☐ PI 확정
│
├─ Revision ★★★
│  ☐ Revision 생성 (B, C, D...)
│  ☐ Revision 비교
│  ☐ Revision 타임라인
│  ☐ 협상 합의 → 자동 Revision 생성
│
├─ 협상
│  ☐ 협상 생성
│  ☐ 협상 응답
│  ☐ 협상 합의
│  ☐ 자동 Revision 생성
│
└─ 보고서
   ☐ PDF 생성 (PO, PI)
   ☐ Excel Export
   ☐ 회사별 필터링
```

### 6.2 성능 테스트

```
기준:
  - API 응답 시간: < 500ms
  - 페이지 로딩 시간: < 2초
  - 대시보드 렌더링: < 1초

테스트:
  ☐ 1000개 주문 조회: < 500ms
  ☐ 100개 라인 아이템: < 100ms
  ☐ 동시 사용자 5명: 안정적
```

### 6.3 보안 테스트

```
테스트:
  ☐ SQL Injection 방어
  ☐ XSS 방어
  ☐ CSRF 방어
  ☐ 회사 데이터 격리
  ☐ 권한 검증
  ☐ 감사 로그 기록
```

---

## 7. 트러블슈팅

### 7.1 일반적인 문제 & 해결

```
문제 1: PostgreSQL 연결 실패
  원인: 
    - PostgreSQL 실행 안 됨
    - 포트 5432 사용 중
    - 비밀번호 오류
  
  해결:
    docker ps | grep postgres_tms  # 실행 확인
    psql -U tms_user -h localhost -d trade_system
    \dt  # 테이블 확인

문제 2: PO 확정 시 cost_master가 저장 안 됨
  원인:
    - 트리거 오류
    - 제약조건 위반
  
  해결:
    SELECT * FROM cost_master
    WHERE company_id = '...'
    
    -- 트리거 확인
    SELECT * FROM information_schema.triggers
    WHERE trigger_name = 'trg_save_cost_on_po_confirm'
    
    -- 로그 확인
    SELECT * FROM audit_log
    ORDER BY changed_at DESC

문제 3: PI의 판매가가 계산되지 않음
  원인:
    - JavaScript 계산 오류
    - 필드 바인딩 오류
  
  해결:
    // 브라우저 콘솔에서 계산 확인
    const costKRW = 5000;
    const exchangeRate = 1468.96;
    const margin = 0.10;
    const costUSD = costKRW / exchangeRate;  // 3.40
    const salePrice = costUSD / (1 - margin);  // 3.78
    console.log(salePrice);  // 3.777...
    
    // AntiGravity에서 공식 확인
    = costKRW / exchangeRate / (1 - profitMargin)
    또는
    = ROUND(costKRW / exchangeRate / (1 - profitMargin), 4)

문제 4: 협상 합의 시 Revision이 생성 안 됨
  원인:
    - 영향받는 PI가 없음 (status가 draft/sent가 아님)
    - API 오류
  
  해결:
    -- PI의 상태 확인
    SELECT pi_number, status FROM proforma_invoices
    WHERE supplier_id IN (
      SELECT supplier_id FROM supplier_negotiations
      WHERE negotiation_number = 'NEG-YSACC-2026-001'
    )
    
    -- draft 또는 sent 상태의 PI만 Revision 생성됨

문제 5: 회사 전환 후 데이터가 섞임
  원인:
    - API에서 company_id 필터 누락
    - 토큰이 제대로 저장 안 됨
  
  해결:
    -- 토큰 확인 (브라우저 DevTools → Application → localStorage)
    localStorage.getItem('token')
    
    -- JWT 디코드 (https://jwt.io/)
    payload.company_id 확인
    
    -- API 호출 확인 (Network 탭)
    GET /api/purchase-orders?company_id=YSACC_uuid
```

### 7.2 DB 쿼리 검증

```
매입가가 제대로 저장되었는지 확인:

-- Step 1: PO 확인
SELECT po_id, po_number, company_id, status
FROM purchase_orders
WHERE po_number LIKE 'PO-YSACC-2026-%'
ORDER BY created_at DESC;

-- Step 2: PO Line Item 확인
SELECT * FROM po_line_items
WHERE po_id = 'po_uuid'

-- Step 3: cost_master 확인 (자동 저장된 매입가)
SELECT cm_id, product_id, unit_price, is_latest, version
FROM cost_master
WHERE po_id = 'po_uuid'
ORDER BY version DESC;

-- 예상 결과:
cm_id | product_id | unit_price | is_latest | version
------|------------|-----------|-----------|--------
uuid1 | cushion_id | 5000      | TRUE      | 1
uuid2 | cushion_id | 4900      | FALSE     | (previous)

-- Step 4: PI에서 자동 로드되는지 확인
SELECT pril_id, cost_krw, sale_price_usd
FROM pi_revision_line_items
WHERE product_id = 'cushion_id'
ORDER BY created_at DESC;

-- 예상 결과:
cost_krw = 5000, sale_price_usd = 3.78 (margin 10%)
```

---

## 최종 체크리스트

### ✅ 완료 기준

```
☐ Week 1 완료
  ├─ DB 모든 테이블 생성
  ├─ 로그인 & 회사 선택
  └─ 마스터 데이터 조회 가능

☐ Week 2 완료
  ├─ PO 생성 & 확정
  ├─ cost_master 자동 저장 검증
  └─ 마스터 데이터 관리 UI 완성

☐ Week 3 완료
  ├─ PI 생성 (판매가 자동 계산)
  ├─ Revision 자동 생성
  ├─ 협상 → 자동 Revision
  └─ 모든 계산 로직 검증

☐ Week 4 완료
  ├─ PDF/Excel 생성
  ├─ 대시보드 완성
  ├─ 최종 테스트
  └─ 라이브 배포

모두 ☑이면 프로젝트 완료! 🎉
```

### 📊 주간 진행률

```
Week 1: 25% (기초)
Week 2: 50% (기본 기능)
Week 3: 85% (핵심 기능)
Week 4: 100% (배포)
```

---

## 🎯 성공의 핵심

```
1. 매일 한 Task만 집중
   ├─ 오버헤드 최소화
   └─ 품질 유지

2. 테스트 먼저, 코드는 나중
   ├─ 요구사항 명확히
   └─ 동작 검증 먼저

3. 단계별 마이크로 커밋
   ├─ 매일 "동작하는" 상태 유지
   └─ 롤백 가능하도록

4. 문서 & 코드 동시 작성
   ├─ SQL 스크립트 정리
   ├─ 화면 설정 캡처
   └─ 커맨드 기록

5. 문제 발생 시 즉시 대응
   ├─ 스택오버플로우 검색
   ├─ AntiGravity 포럼
   └─ 필요시 플랫폼 전환 검토
```

---

## 📞 지원

```
각 주별로 최대한 상세하게 제시했습니다.

질문사항:
  - "Day 3의 Task가 명확하지 않습니다"
  - "이 Error가 나왔어요"
  - "다음 단계가 뭔가요?"

언제든 물어보세요! 💬

저는 여기 있습니다. ✋
```

---

## 이제 시작하세요! 🚀

```
Monday에 시작하면:
  Week 1 End: 기초 완성 ✓
  Week 2 End: PO 시스템 완성 ✓
  Week 3 End: PI & Revision 완성 ✓
  Week 4 End: 라이브! 🎉

4주 후 당신은:
  ✓ 완벽한 무역 관리 시스템 소유
  ✓ 영성ACC + YSACC 통합 운영
  ✓ 자동화된 협상 & Revision 관리
  ✓ 확장 가능한 플랫폼 구축

성공을 응원합니다! 💪
```
