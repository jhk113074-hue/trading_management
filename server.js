const express = require('express');
const cors    = require('cors');
require('dotenv').config();
const pool = require('./db/pool');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('dashboard')); // dashboard/ 폴더를 정적 파일로 서빙

// ─────────────────────────────────────────
// 공통 헬퍼
// ─────────────────────────────────────────
const companyId = async () => {
  const r = await pool.query(`SELECT company_id FROM companies WHERE company_code = $1`, [process.env.COMPANY_CODE || 'YSACC']);
  return r.rows[0]?.company_id;
};

// ─────────────────────────────────────────
// API: Health Check
// ─────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ─────────────────────────────────────────
// API: Customers
// ─────────────────────────────────────────
app.get('/api/customers', async (req, res) => {
  try {
    const cid = await companyId();
    const r = await pool.query(
      `SELECT customer_id, name, country, city, address,
              contact_person, email, phone,
              payment_terms, preferred_incoterms, preferred_port, preferred_shipping_method
       FROM customers
       WHERE company_id = $1 AND status = 'active'
       ORDER BY name`, [cid]
    );
    res.json({ data: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const cid = await companyId();
    const { name, country, city, address, contact_person, email, phone,
            payment_terms, preferred_incoterms, preferred_port } = req.body;
    const r = await pool.query(
      `INSERT INTO customers
         (company_id, name, country, city, address, contact_person, email, phone,
          payment_terms, preferred_incoterms, preferred_port)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [cid, name, country, city, address, contact_person, email, phone,
       payment_terms, preferred_incoterms, preferred_port]
    );
    res.status(201).json({ data: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────
// API: Proforma Invoices
// ─────────────────────────────────────────
app.get('/api/proforma-invoices', async (req, res) => {
  try {
    const cid = await companyId();
    const r = await pool.query(
      `SELECT pi.*, c.name AS customer_name, c.country AS customer_country
       FROM proforma_invoices pi
       LEFT JOIN customers c ON pi.customer_id = c.customer_id
       WHERE pi.company_id = $1
       ORDER BY pi.created_at DESC`, [cid]
    );
    res.json({ data: r.rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/proforma-invoices/:id', async (req, res) => {
  try {
    const piRes = await pool.query(
      `SELECT pi.*, c.name AS customer_name, c.address AS customer_address,
              c.contact_person, c.email AS customer_email
       FROM proforma_invoices pi
       LEFT JOIN customers c ON pi.customer_id = c.customer_id
       WHERE pi.pi_id = $1`, [req.params.id]
    );
    if (!piRes.rows.length) return res.status(404).json({ error: 'PI not found' });

    const revRes = await pool.query(
      `SELECT pr.*, json_agg(pril ORDER BY pril.created_at) AS line_items
       FROM pi_revisions pr
       LEFT JOIN pi_revision_line_items pril ON pr.pr_id = pril.pi_revision_id
       WHERE pr.pi_id = $1
       GROUP BY pr.pr_id ORDER BY pr.created_at`, [req.params.id]
    );
    res.json({ data: { ...piRes.rows[0], revisions: revRes.rows } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/proforma-invoices', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cid = await companyId();
    const {
      customer_id, pi_date, incoterms, destination_port, destination_country,
      payment_terms, shipping_method, exchange_rate, default_profit_margin,
      validity_days, remarks, handling_charges, freight_charges, insurance_charges,
      subtotal_usd, total_usd, line_items = []
    } = req.body;

    // PI 헤더 저장 (트리거가 pi_number, valid_until_date 자동생성)
    const piRes = await client.query(
      `INSERT INTO proforma_invoices
         (company_id, pi_number, pi_date, customer_id,
          incoterms, destination_port, destination_country,
          payment_terms, shipping_method, exchange_rate, default_profit_margin,
          validity_days, remarks, handling_charges, freight_charges, insurance_charges,
          subtotal_usd, total_usd, status)
       VALUES ($1,'',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'draft')
       RETURNING *`,
      [cid, pi_date, customer_id, incoterms, destination_port, destination_country,
       payment_terms, shipping_method, exchange_rate, default_profit_margin,
       validity_days, remarks, handling_charges||0, freight_charges||0, insurance_charges||0,
       subtotal_usd, total_usd]
    );
    const pi = piRes.rows[0];

    // Revision A 생성
    const revRes = await client.query(
      `INSERT INTO pi_revisions
         (company_id, pi_id, version, revision_number,
          incoterms, destination_port, payment_terms, validity_days, exchange_rate,
          subtotal_usd, total_usd, status)
       VALUES ($1,$2,'A',1,$3,$4,$5,$6,$7,$8,$9,'draft')
       RETURNING *`,
      [cid, pi.pi_id, incoterms, destination_port, payment_terms,
       validity_days, exchange_rate, subtotal_usd, total_usd]
    );
    const revision = revRes.rows[0];

    // 라인 아이템 저장
    for (let i = 0; i < line_items.length; i++) {
      const item = line_items[i];
      const costUsd = item.cost_krw / exchange_rate;
      const margin  = item.profit_margin / 100;
      const salePriceUsd = costUsd / (1 - margin);
      const lineTotalUsd = salePriceUsd * item.quantity;

      await client.query(
        `INSERT INTO pi_revision_line_items
           (company_id, pi_revision_id, description,
            cost_krw, quantity, unit, exchange_rate,
            profit_margin, cost_usd, sale_price_usd, line_total_usd)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [cid, revision.pr_id, item.description,
         item.cost_krw, item.quantity, item.unit, exchange_rate,
         margin, costUsd.toFixed(4), salePriceUsd.toFixed(4), lineTotalUsd.toFixed(4)]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      status: 'success',
      data: { ...pi, revision_id: revision.pr_id }
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────
// API: Dashboard Stats
// ─────────────────────────────────────────
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const cid = await companyId();
    const [monthly, byCustomer] = await Promise.all([
      pool.query(`SELECT * FROM v_monthly_sales LIMIT 6`),
      pool.query(`SELECT * FROM v_sales_by_customer WHERE customer_name IS NOT NULL`)
    ]);
    const summary = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE DATE_TRUNC('month', pi_date) = DATE_TRUNC('month', CURRENT_DATE)) AS this_month_count,
         COALESCE(SUM(total_usd) FILTER (WHERE status='confirmed' AND DATE_TRUNC('month', pi_date) = DATE_TRUNC('month', CURRENT_DATE)), 0) AS this_month_revenue,
         ROUND(COUNT(*) FILTER (WHERE status='confirmed') * 100.0 / NULLIF(COUNT(*),0), 1) AS win_rate
       FROM proforma_invoices WHERE company_id = $1`, [cid]
    );
    res.json({
      data: {
        summary: summary.rows[0],
        monthly_sales: monthly.rows,
        by_customer: byCustomer.rows
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────
// 서버 시작
// ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 YSACC TMS 서버 실행 중: http://localhost:${PORT}`);
  console.log(`📋 PI 작성 화면: http://localhost:${PORT}/create_pi.html`);
  console.log(`📊 대시보드:     http://localhost:${PORT}/index.html`);
});
