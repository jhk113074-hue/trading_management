-- 1. Suppliers (공급업체) 테이블
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
  
  -- 기본 거래조건 (공급업체별)
  incoterms VARCHAR(50),
  payment_terms VARCHAR(255),
  lead_time VARCHAR(100),
  
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Purchase Orders (발주서) 테이블
CREATE TABLE purchase_orders (
  po_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  po_number VARCHAR(100) NOT NULL UNIQUE,
  po_date DATE NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(supplier_id),
  
  -- 관련된 PI (선택사항, 특정 PI를 위해 발주하는 경우)
  related_pi_id UUID REFERENCES proforma_invoices(pi_id),
  
  -- 거래조건
  incoterms VARCHAR(50),
  destination VARCHAR(100),
  payment_terms VARCHAR(255),
  shipping_mark VARCHAR(255),
  delivery_date DATE,
  
  -- 금액
  subtotal_amount DECIMAL(15,4),
  total_amount DECIMAL(15,4),
  currency VARCHAR(10) DEFAULT 'USD',
  
  -- 상태
  status VARCHAR(50) DEFAULT 'draft', -- draft, sent, confirmed, completed, cancelled
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. PO Line Items (발주 상품) 테이블
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
