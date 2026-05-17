-- Phase 3: 협상(Negotiation) & Revision 추적 시스템

-- 1. Negotiations (협상 이력) 테이블
CREATE TABLE negotiations (
  negotiation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(company_id),
  pi_id UUID NOT NULL REFERENCES proforma_invoices(pi_id),
  
  -- 협상 유형
  negotiation_type VARCHAR(50) NOT NULL,  -- 'price', 'terms', 'delivery', 'quantity'
  direction VARCHAR(10) NOT NULL,          -- 'inbound' (고객요청), 'outbound' (우리제안)
  
  -- 협상 내용
  subject VARCHAR(255),                    -- "가격 인하 요청", "결제조건 변경 요청"
  customer_request TEXT,                   -- "Please reduce the price by 5%"
  our_response TEXT,                       -- "We can offer 3% discount"
  
  -- 결과
  result VARCHAR(50),                      -- 'accepted', 'rejected', 'counter_proposed', 'pending'
  agreed_value VARCHAR(255),               -- 합의된 값 (예: "3.65 USD", "60 days LC")
  
  -- 연결
  source_revision VARCHAR(10),             -- 어떤 Revision에서 시작되었는지 (A, B, C...)
  target_revision VARCHAR(10),             -- 이 협상으로 어떤 Revision이 만들어졌는지
  
  -- 추적
  negotiated_by UUID,                      -- REFERENCES users(user_id)
  negotiated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP
);

CREATE INDEX idx_negotiation_pi ON negotiations(pi_id);
CREATE INDEX idx_negotiation_company ON negotiations(company_id);

-- 2. PI Revision 자동 생성 함수 (협상 합의 후 새 Revision 만들기)
CREATE OR REPLACE FUNCTION create_next_revision(
  p_pi_id UUID,
  p_company_id UUID,
  p_reason VARCHAR(500),
  p_negotiation_id UUID DEFAULT NULL
)
RETURNS TABLE(new_revision_id UUID, new_version VARCHAR(10)) AS $$
DECLARE
  v_last_version VARCHAR(10);
  v_next_version VARCHAR(10);
  v_last_revision pi_revisions%ROWTYPE;
BEGIN
  -- 현재 마지막 revision version 조회 (A → B → C 순서)
  SELECT version INTO v_last_version
  FROM pi_revisions
  WHERE pi_id = p_pi_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- 다음 버전 알파벳 계산
  v_next_version := CHR(ASCII(v_last_version) + 1);

  -- 마지막 revision의 내용을 기반으로 새 revision 생성
  SELECT * INTO v_last_revision
  FROM pi_revisions
  WHERE pi_id = p_pi_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- 새 Revision 삽입
  INSERT INTO pi_revisions (
    company_id, pi_id, version, revision_number,
    incoterms, destination_port, payment_terms, validity_days, exchange_rate,
    revision_reason, related_negotiation_id, status,
    subtotal_usd, total_usd
  ) VALUES (
    p_company_id, p_pi_id, v_next_version,
    (v_last_revision.revision_number + 1),
    v_last_revision.incoterms, v_last_revision.destination_port,
    v_last_revision.payment_terms, v_last_revision.validity_days, v_last_revision.exchange_rate,
    p_reason, p_negotiation_id, 'draft',
    v_last_revision.subtotal_usd, v_last_revision.total_usd
  )
  RETURNING pr_id, version INTO new_revision_id, new_version;

  -- 마지막 revision의 라인 아이템을 새 revision에 복사
  INSERT INTO pi_revision_line_items (
    company_id, pi_revision_id, product_id, description,
    cost_krw, quantity, unit,
    exchange_rate, profit_margin, cost_usd, sale_price_usd, line_total_usd
  )
  SELECT
    company_id, new_revision_id, product_id, description,
    cost_krw, quantity, unit,
    exchange_rate, profit_margin, cost_usd, sale_price_usd, line_total_usd
  FROM pi_revision_line_items
  WHERE pi_revision_id = v_last_revision.pr_id;

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
