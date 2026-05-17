-- 회사 데이터
INSERT INTO companies (
  company_code, company_name, company_type, business_number
) VALUES (
  'YSACC',
  '(주)와이에스에이씨씨',
  'corporation',
  '2022-12345678'
);

-- 사용자 데이터
INSERT INTO users (
  company_id, username, email, password, name, role
) VALUES (
  (SELECT company_id FROM companies WHERE company_code = 'YSACC'),
  'jhkim',
  'jhkim1130@ysacc.co.kr',
  'temp_password_hash',
  'Ju Han Kim',
  'admin'
);

-- 고객 데이터 1 (THERMOSET)
INSERT INTO customers (
  company_id, name, address_line1, address_line2,
  country, city, contact_person, email, phone,
  incoterms, destination, payment_terms,
  delivery_term, validity_term
) VALUES (
  (SELECT company_id FROM companies WHERE company_code = 'YSACC'),
  'THERMOSET TECHNOLOGIES MIDDLE EAST L.L.C',
  'P.O BOX 118157',
  '37 STREET, DUBAI INVESTMENT PARK - 1 -, DUBAI, UAE',
  'UAE',
  'DUBAI',
  'Contact Name',
  'contact@thermoset.ae',
  '+971 4 885228',
  'DOOR TO DOOR',
  'JEBEL ALI',
  '100% LC 90 days from BL date',
  '2 weeks',
  '2 weeks from the offered date'
);

-- 고객 데이터 2 (EPP)
INSERT INTO customers (
  company_id, name, address_line1, address_line2,
  country, city, incoterms, destination, payment_terms,
  delivery_term, validity_term
) VALUES (
  (SELECT company_id FROM companies WHERE company_code = 'YSACC'),
  'EPP COMPOSITES PVT. LTD.',
  'Plot No. 2646',
  'GIDC Lodhika',
  'INDIA',
  'Rajkot',
  'EXW',
  'INDIA',
  'TT in advance',
  '6 week',
  '4 weeks from the offered date'
);
