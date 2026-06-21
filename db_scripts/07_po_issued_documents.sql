-- 07_po_issued_documents.sql

-- 1. 발주서 발행 이력 테이블
CREATE TABLE IF NOT EXISTS po_issued_documents (
  id SERIAL PRIMARY KEY,
  po_id INT NOT NULL,
  po_number VARCHAR(50) NOT NULL,
  supplier_name VARCHAR(100) NOT NULL,
  version INT DEFAULT 1,
  file_name VARCHAR(200) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT,
  issued_at TIMESTAMP NOT NULL,
  issued_by VARCHAR(50) NOT NULL,
  total_amount NUMERIC(15,0),
  status VARCHAR(20) DEFAULT 'active', -- 'active' or 'superseded'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_po_issued_po_id ON po_issued_documents (po_id);
CREATE INDEX IF NOT EXISTS idx_po_issued_po_number ON po_issued_documents (po_number);

-- 2. purchase_orders 테이블에 컬럼 추가 (존재하지 않으면 추가)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_orders' AND column_name='issue_status') THEN
        ALTER TABLE purchase_orders ADD COLUMN issue_status VARCHAR(20) DEFAULT 'draft';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='purchase_orders' AND column_name='latest_issue_id') THEN
        ALTER TABLE purchase_orders ADD COLUMN latest_issue_id INT NULL;
    END IF;
END
$$;
