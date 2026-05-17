-- Phase 4: 대시보드 & 보고서용 뷰(View) 정의

-- 1. PI 현황 종합 뷰 (대시보드 메인 카드용)
CREATE OR REPLACE VIEW v_pi_summary AS
SELECT
  pi.pi_id,
  pi.pi_number,
  pi.pi_date,
  pi.status,
  pi.current_version,
  
  -- 고객 정보
  c.name AS customer_name,
  c.country AS customer_country,
  
  -- 거래 조건
  pi.incoterms,
  pi.destination_port,
  pi.payment_terms,
  
  -- 금액
  pi.total_usd,
  pi.total_usd * pi.exchange_rate AS total_krw, -- 원화 환산
  pi.exchange_rate,
  
  -- 유효기간
  pi.valid_until_date,
  CASE
    WHEN CURRENT_DATE > pi.valid_until_date AND pi.status != 'confirmed' THEN 'expired'
    WHEN CURRENT_DATE >= pi.valid_until_date - INTERVAL '7 days' THEN 'expiring_soon'
    ELSE 'valid'
  END AS validity_status,
  
  -- 추적
  pi.created_at,
  pi.sent_at,
  pi.confirmed_at

FROM proforma_invoices pi
LEFT JOIN customers c ON pi.customer_id = c.customer_id;


-- 2. 수익성 분석 뷰 (라인 아이템별 마진 추적)
CREATE OR REPLACE VIEW v_profitability_analysis AS
SELECT
  pi.pi_number,
  pi.pi_date,
  c.name AS customer_name,
  
  -- 상품별 매출/원가/마진
  pril.description AS product_description,
  pril.quantity,
  pril.unit,
  pril.cost_usd,
  pril.sale_price_usd,
  pril.line_total_usd,
  (pril.sale_price_usd - pril.cost_usd) * pril.quantity AS gross_profit_usd, -- 상품별 이익
  pril.profit_margin * 100 AS margin_pct,
  
  -- 원화 환산
  pril.cost_krw,
  pril.exchange_rate

FROM pi_revision_line_items pril
JOIN pi_revisions pr ON pril.pi_revision_id = pr.pr_id
JOIN proforma_invoices pi ON pr.pi_id = pi.pi_id
JOIN customers c ON pi.customer_id = c.customer_id
WHERE pr.version = pi.current_version; -- 현재 유효한 버전만 포함


-- 3. 고객별 매출 현황 뷰
CREATE OR REPLACE VIEW v_sales_by_customer AS
SELECT
  c.name AS customer_name,
  c.country,
  COUNT(pi.pi_id) AS total_pi_count,
  COUNT(CASE WHEN pi.status = 'confirmed' THEN 1 END) AS confirmed_count,
  SUM(CASE WHEN pi.status = 'confirmed' THEN pi.total_usd ELSE 0 END) AS confirmed_revenue_usd,
  SUM(pi.total_usd) AS total_quoted_usd, -- 전체 견적 합산
  ROUND(
    COUNT(CASE WHEN pi.status = 'confirmed' THEN 1 END) * 100.0 / NULLIF(COUNT(pi.pi_id), 0), 1
  ) AS win_rate_pct -- 수주율 (%)
FROM customers c
LEFT JOIN proforma_invoices pi ON c.customer_id = pi.customer_id
GROUP BY c.customer_id, c.name, c.country;


-- 4. 월별 매출 현황 뷰
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
