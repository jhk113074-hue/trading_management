-- [완벽 시스템 설계 v2] 통합 DB 스키마

-- 1. Customers 테이블 (고객 정보)
CREATE TABLE customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  
  -- 기본 정보
  name VARCHAR(255) NOT NULL,
  business_number VARCHAR(20),
  
  -- 주소 정보
  country VARCHAR(100) NOT NULL,
  city VARCHAR(100),
  address VARCHAR(500),
  zip_code VARCHAR(20),
  
  -- 연락처
  contact_person VARCHAR(100),
  contact_title VARCHAR(100),
  email VARCHAR(100),
  phone VARCHAR(20),
  fax VARCHAR(20),
  
  -- 거래 조건
  payment_terms VARCHAR(100),
  preferred_incoterms VARCHAR(50),
  preferred_port VARCHAR(255),
  preferred_shipping_method VARCHAR(50),
  credit_limit DECIMAL(15,2),
  
  -- 상태
  status VARCHAR(50) DEFAULT 'active',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_company ON customers(company_id);
CREATE INDEX idx_customer_country ON customers(country);

-- 2. Proforma Invoices (PI 헤더)
CREATE TABLE proforma_invoices (
  pi_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  
  pi_number VARCHAR(100) NOT NULL UNIQUE,
  pi_date DATE NOT NULL,
  
  customer_id UUID NOT NULL REFERENCES customers(customer_id),
  
  -- 거래 조건
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
  
  -- 특수 사항
  remarks TEXT,
  handling_charges DECIMAL(12,2) DEFAULT 0,
  freight_charges DECIMAL(12,2) DEFAULT 0,
  insurance_charges DECIMAL(12,2) DEFAULT 0,
  
  -- 금액 (자동 계산)
  subtotal_usd DECIMAL(15,4),
  total_usd DECIMAL(15,4),
  
  -- 추적
  created_by UUID NOT NULL, -- references users(user_id) 생략 (초기화 편의성)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sent_at TIMESTAMP,
  sent_by UUID,
  confirmed_at TIMESTAMP,
  
  CONSTRAINT unique_pi_number UNIQUE(company_id, pi_number)
);

CREATE INDEX idx_pi_company ON proforma_invoices(company_id);
CREATE INDEX idx_pi_customer ON proforma_invoices(customer_id);
CREATE INDEX idx_pi_status ON proforma_invoices(status);
CREATE INDEX idx_pi_incoterms ON proforma_invoices(incoterms);

-- PI Number 자동생성 트리거
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
FOR EACH ROW
EXECUTE FUNCTION generate_pi_number();

-- 3. PI Revisions (Revision 관리)
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
CREATE INDEX idx_pr_pi ON pi_revisions(pi_id);

-- 4. PI Revision Line Items (라인 아이템)
CREATE TABLE pi_revision_line_items (
  pril_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_revision_id UUID NOT NULL REFERENCES pi_revisions(pr_id) ON DELETE CASCADE,
  
  product_id UUID, -- 원래는 REFERENCES products(product_id)
  description VARCHAR(500),
  
  cost_master_id UUID,
  cost_krw DECIMAL(12,2) NOT NULL,
  supplier_id UUID, -- 원래는 REFERENCES suppliers(supplier_id)
  
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

CREATE INDEX idx_pril_company ON pi_revision_line_items(company_id);
CREATE INDEX idx_pril_revision ON pi_revision_line_items(pi_revision_id);
