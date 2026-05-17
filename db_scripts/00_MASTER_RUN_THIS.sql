-- ================================================================
-- YSACC TMS 마스터 SQL 실행 파일
-- AntiGravity SQL Editor에서 이 파일 하나만 순서대로 실행하세요.
-- 실행 순서: 위에서 아래로 순차 실행 (절대 순서 바꾸지 마세요!)
-- ================================================================


-- ================================================================
-- STEP 1. 기본 회사 테이블
-- ================================================================
CREATE TABLE companies (
  company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_code VARCHAR(50) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL UNIQUE,
  company_type VARCHAR(50),
  business_number VARCHAR(20),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ================================================================
-- STEP 2. 사용자 테이블
-- ================================================================
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


-- ================================================================
-- STEP 3. 공급업체 테이블
-- ================================================================
CREATE TABLE suppliers (
  supplier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  name VARCHAR(255) NOT NULL,
  address_line1 VARCHAR(500),
  address_line2 VARCHAR(500),
  country VARCHAR(100),
  city VARCHAR(100),
  contact_person VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(50),
  incoterms VARCHAR(50),
  payment_terms VARCHAR(255),
  lead_time VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ================================================================
-- STEP 4. 고객 테이블
-- ================================================================
CREATE TABLE customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  name VARCHAR(255) NOT NULL,
  business_number VARCHAR(20),
  country VARCHAR(100) NOT NULL,
  city VARCHAR(100),
  address VARCHAR(500),
  zip_code VARCHAR(20),
  contact_person VARCHAR(100),
  contact_title VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(20),
  fax VARCHAR(20),
  payment_terms VARCHAR(100),
  preferred_incoterms VARCHAR(50),
  preferred_port VARCHAR(255),
  preferred_shipping_method VARCHAR(50),
  credit_limit DECIMAL(15,2),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_company ON customers(company_id);
CREATE INDEX idx_customer_country ON customers(country);


-- ================================================================
-- STEP 5. Proforma Invoice (PI) 헤더 테이블
-- ================================================================
CREATE TABLE proforma_invoices (
  pi_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_number VARCHAR(100) NOT NULL,
  pi_date DATE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(customer_id),
  incoterms VARCHAR(50) NOT NULL,
  destination_port VARCHAR(255) NOT NULL,
  destination_country VARCHAR(100),
  payment_terms VARCHAR(100) NOT NULL,
  shipping_method VARCHAR(50),
  exchange_rate DECIMAL(10,4) NOT NULL,
  default_profit_margin DECIMAL(5,2),
  validity_days INT DEFAULT 30,
  valid_until_date DATE,
  current_version VARCHAR(10) DEFAULT 'A',
  status VARCHAR(50) DEFAULT 'draft',
  remarks TEXT,
  handling_charges DECIMAL(12,2) DEFAULT 0,
  freight_charges DECIMAL(12,2) DEFAULT 0,
  insurance_charges DECIMAL(12,2) DEFAULT 0,
  subtotal_usd DECIMAL(15,4),
  total_usd DECIMAL(15,4),
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP,
  sent_by UUID,
  confirmed_at TIMESTAMP,
  CONSTRAINT unique_pi_number UNIQUE(company_id, pi_number)
);

CREATE INDEX idx_pi_company   ON proforma_invoices(company_id);
CREATE INDEX idx_pi_customer  ON proforma_invoices(customer_id);
CREATE INDEX idx_pi_status    ON proforma_invoices(status);
CREATE INDEX idx_pi_incoterms ON proforma_invoices(incoterms);


-- ================================================================
-- STEP 6. PI Number 자동생성 트리거
-- ================================================================
CREATE SEQUENCE IF NOT EXISTS pi_number_seq START WITH 1;

CREATE OR REPLACE FUNCTION generate_pi_number()
RETURNS TRIGGER AS $$
DECLARE
  v_company_code VARCHAR(50);
BEGIN
  SELECT company_code INTO v_company_code
  FROM companies WHERE company_id = NEW.company_id;

  IF NEW.pi_number IS NULL OR NEW.pi_number = '' THEN
    NEW.pi_number := 'PI-' || v_company_code || '-'
                     || TO_CHAR(NEW.pi_date, 'YYYY') || '-'
                     || LPAD(nextval('pi_number_seq')::text, 2, '0');
  END IF;

  NEW.valid_until_date := NEW.pi_date + (NEW.validity_days || ' days')::INTERVAL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pi_number
BEFORE INSERT ON proforma_invoices
FOR EACH ROW EXECUTE FUNCTION generate_pi_number();


-- ================================================================
-- STEP 7. PI Revisions 테이블
-- ================================================================
CREATE TABLE pi_revisions (
  pr_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_id UUID NOT NULL REFERENCES proforma_invoices(pi_id) ON DELETE CASCADE,
  version VARCHAR(10) NOT NULL,
  revision_number INT,
  incoterms VARCHAR(50),
  destination_port VARCHAR(255),
  payment_terms VARCHAR(100),
  validity_days INT,
  exchange_rate DECIMAL(10,4),
  revision_reason VARCHAR(500),
  related_negotiation_id UUID,
  status VARCHAR(50) DEFAULT 'draft',
  customer_feedback TEXT,
  feedback_received_at TIMESTAMP,
  subtotal_usd DECIMAL(15,4),
  total_usd DECIMAL(15,4),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  sent_at TIMESTAMP,
  CONSTRAINT unique_pi_version UNIQUE(pi_id, version)
);

CREATE INDEX idx_pr_company ON pi_revisions(company_id);
CREATE INDEX idx_pr_pi      ON pi_revisions(pi_id);


-- ================================================================
-- STEP 8. PI Revision Line Items 테이블
-- ================================================================
CREATE TABLE pi_revision_line_items (
  pril_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_revision_id UUID NOT NULL REFERENCES pi_revisions(pr_id) ON DELETE CASCADE,
  product_id UUID,
  description VARCHAR(500),
  cost_master_id UUID,
  cost_krw DECIMAL(12,2) NOT NULL,
  supplier_id UUID,
  quantity DECIMAL(10,2) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  exchange_rate DECIMAL(10,4) NOT NULL,
  profit_margin DECIMAL(5,2) NOT NULL,
  cost_usd DECIMAL(12,4),
  sale_price_usd DECIMAL(12,4) NOT NULL,
  line_total_usd DECIMAL(15,4) NOT NULL,
  change_reason TEXT,
  previous_sale_price_usd DECIMAL(12,4),
  price_change_percent DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pril_company  ON pi_revision_line_items(company_id);
CREATE INDEX idx_pril_revision ON pi_revision_line_items(pi_revision_id);


-- ================================================================
-- STEP 9. Purchase Orders (발주서) 테이블
-- ================================================================
CREATE TABLE purchase_orders (
  po_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  po_number VARCHAR(100) NOT NULL UNIQUE,
  po_date DATE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(supplier_id),
  related_pi_id UUID REFERENCES proforma_invoices(pi_id),
  incoterms VARCHAR(50),
  destination VARCHAR(100),
  payment_terms VARCHAR(255),
  delivery_date DATE,
  subtotal_amount DECIMAL(15,4),
  total_amount DECIMAL(15,4),
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(50) DEFAULT 'draft',
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE po_line_items (
  poli_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
  line_number INT,
  product VARCHAR(255) NOT NULL,
  spec VARCHAR(500),
  unit_price DECIMAL(12,4) NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  total_price DECIMAL(15,4),
  remark TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ================================================================
-- STEP 10. Negotiations (협상 이력) 테이블
-- ================================================================
CREATE TABLE negotiations (
  negotiation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_id UUID NOT NULL REFERENCES proforma_invoices(pi_id),
  negotiation_type VARCHAR(50) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  subject VARCHAR(255),
  customer_request TEXT,
  our_response TEXT,
  result VARCHAR(50),
  agreed_value VARCHAR(255),
  source_revision VARCHAR(10),
  target_revision VARCHAR(10),
  negotiated_by UUID,
  negotiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP
);

CREATE INDEX idx_negotiation_pi      ON negotiations(pi_id);
CREATE INDEX idx_negotiation_company ON negotiations(company_id);


-- ================================================================
-- STEP 11. 대시보드용 집계 뷰 (View)
-- ================================================================

-- PI 현황 종합 뷰
CREATE OR REPLACE VIEW v_pi_summary AS
SELECT
  pi.pi_id, pi.pi_number, pi.pi_date, pi.status, pi.current_version,
  c.name AS customer_name, c.country AS customer_country,
  pi.incoterms, pi.destination_port, pi.payment_terms,
  pi.total_usd,
  pi.total_usd * pi.exchange_rate AS total_krw,
  pi.exchange_rate, pi.valid_until_date,
  CASE
    WHEN CURRENT_DATE > pi.valid_until_date AND pi.status != 'confirmed' THEN 'expired'
    WHEN CURRENT_DATE >= pi.valid_until_date - INTERVAL '7 days' THEN 'expiring_soon'
    ELSE 'valid'
  END AS validity_status,
  pi.created_at, pi.sent_at, pi.confirmed_at
FROM proforma_invoices pi
LEFT JOIN customers c ON pi.customer_id = c.customer_id;

-- 고객별 매출 뷰
CREATE OR REPLACE VIEW v_sales_by_customer AS
SELECT
  c.name AS customer_name, c.country,
  COUNT(pi.pi_id) AS total_pi_count,
  COUNT(CASE WHEN pi.status = 'confirmed' THEN 1 END) AS confirmed_count,
  SUM(CASE WHEN pi.status = 'confirmed' THEN pi.total_usd ELSE 0 END) AS confirmed_revenue_usd,
  SUM(pi.total_usd) AS total_quoted_usd,
  ROUND(COUNT(CASE WHEN pi.status = 'confirmed' THEN 1 END) * 100.0 / NULLIF(COUNT(pi.pi_id), 0), 1) AS win_rate_pct
FROM customers c
LEFT JOIN proforma_invoices pi ON c.customer_id = pi.customer_id
GROUP BY c.customer_id, c.name, c.country;

-- 월별 매출 뷰
CREATE OR REPLACE VIEW v_monthly_sales AS
SELECT
  TO_CHAR(pi.pi_date, 'YYYY-MM') AS year_month,
  COUNT(pi.pi_id) AS pi_count,
  COUNT(CASE WHEN pi.status = 'confirmed' THEN 1 END) AS confirmed_count,
  SUM(CASE WHEN pi.status = 'confirmed' THEN pi.total_usd ELSE 0 END) AS revenue_usd,
  SUM(CASE WHEN pi.status = 'confirmed' THEN pi.total_usd * pi.exchange_rate ELSE 0 END) AS revenue_krw
FROM proforma_invoices pi
GROUP BY TO_CHAR(pi.pi_date, 'YYYY-MM')
ORDER BY year_month DESC;


-- ================================================================
-- STEP 12. 초기 데이터 삽입
-- ================================================================

-- 회사 데이터
INSERT INTO companies (company_code, company_name, company_type, business_number)
VALUES ('YSACC', '(주)와이에스에이씨씨', 'corporation', '2022-12345678');

-- 관리자 계정
INSERT INTO users (company_id, username, email, password, name, role)
VALUES (
  (SELECT company_id FROM companies WHERE company_code = 'YSACC'),
  'jhkim', 'jhkim1130@ysacc.co.kr', 'change_this_password', 'Ju Han Kim', 'admin'
);

-- 고객 1: THERMOSET
INSERT INTO customers (
  company_id, name, country, city, address,
  contact_person, email, phone,
  payment_terms, preferred_incoterms, preferred_port, preferred_shipping_method
) VALUES (
  (SELECT company_id FROM companies WHERE company_code = 'YSACC'),
  'THERMOSET TECHNOLOGIES MIDDLE EAST L.L.C',
  'UAE', 'DUBAI',
  'P.O BOX 118157, 37 STREET, DUBAI INVESTMENT PARK - 1 -, DUBAI, UAE',
  'Contact Name', 'contact@thermoset.ae', '+971 4 885228',
  '100% LC 90 days from BL date', 'DOOR TO DOOR', 'JEBEL ALI', 'Sea Freight'
);

-- 고객 2: EPP
INSERT INTO customers (
  company_id, name, country, city, address,
  payment_terms, preferred_incoterms, preferred_port, preferred_shipping_method
) VALUES (
  (SELECT company_id FROM companies WHERE company_code = 'YSACC'),
  'EPP COMPOSITES PVT. LTD.',
  'INDIA', 'Rajkot',
  'Plot No. 2646, GIDC Lodhika',
  'TT in advance', 'EXW', 'NHAVA SHEVA', 'Sea Freight'
);

-- 공급업체 1
INSERT INTO suppliers (
  company_id, name, country, city,
  contact_person, email, phone,
  incoterms, payment_terms, lead_time
) VALUES (
  (SELECT company_id FROM companies WHERE company_code = 'YSACC'),
  'GUANGDONG MANUFACTURING CO., LTD.',
  'CHINA', 'Shenzhen',
  'Mr. Wang', 'sales@gd-mfg.cn', '+86 755 1234 5678',
  'FOB SHENZHEN', '30% TT in advance, 70% before shipment', '3 weeks'
);


-- ================================================================
-- ✅ 실행 완료 확인 쿼리
-- ================================================================
SELECT 'companies'             AS table_name, COUNT(*) AS row_count FROM companies
UNION ALL
SELECT 'users',                               COUNT(*) FROM users
UNION ALL
SELECT 'customers',                           COUNT(*) FROM customers
UNION ALL
SELECT 'suppliers',                           COUNT(*) FROM suppliers
UNION ALL
SELECT 'proforma_invoices',                   COUNT(*) FROM proforma_invoices
UNION ALL
SELECT 'pi_revisions',                        COUNT(*) FROM pi_revisions
UNION ALL
SELECT 'pi_revision_line_items',              COUNT(*) FROM pi_revision_line_items
UNION ALL
SELECT 'purchase_orders',                     COUNT(*) FROM purchase_orders
UNION ALL
SELECT 'negotiations',                        COUNT(*) FROM negotiations;
