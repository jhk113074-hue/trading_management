-- 공급업체 데이터 (예시: 중국 제조사)
INSERT INTO suppliers (
  company_id, name, address_line1, address_line2,
  country, city, contact_person, email, phone,
  incoterms, payment_terms, lead_time
) VALUES (
  (SELECT company_id FROM companies WHERE company_code = 'YSACC'),
  'GUANGDONG MANUFACTURING CO., LTD.',
  '123 Industrial Road',
  'Baoan District',
  'CHINA',
  'Shenzhen',
  'Mr. Wang',
  'sales@gd-mfg.cn',
  '+86 755 1234 5678',
  'FOB SHENZHEN',
  '30% TT in advance, 70% before shipment',
  '3 weeks'
);
