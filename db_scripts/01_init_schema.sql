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

-- 3. Customers 테이블
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
  
  -- 거래조건
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
  
  -- 내부 계산용
  cost_krw DECIMAL(12,2),
  exchange_rate DECIMAL(10,4),
  profit_margin DECIMAL(5,2),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
