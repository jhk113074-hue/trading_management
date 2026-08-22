const express = require('express');
const cors    = require('cors');
require('dotenv').config();
const pool = require('./db/pool');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('dashboard')); // dashboard/ 폴더를 정적 파일로 서빙
app.use('/files', express.static(path.join(__dirname, 'files')));

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
// API: Send Email (Brevo / SendGrid / REST API)
// ─────────────────────────────────────────
app.post('/api/email/send', async (req, res) => {
  try {
    const { to, cc, subject, text, html } = req.body;
    if (!to || !subject || !text) {
      return res.status(400).json({ error: 'to, subject, and text are required' });
    }

    const brevoApiKey = process.env.BREVO_API_KEY || process.env.VITE_BREVO_API_KEY;
    const sendgridApiKey = process.env.SENDGRID_API_KEY || process.env.VITE_SENDGRID_API_KEY;

    const ccList = Array.isArray(cc) ? cc.filter(Boolean) : (cc ? [cc] : []);

    // 1. Try Brevo API
    if (brevoApiKey) {
      const brevoPayload = {
        sender: { name: 'jhkim1130@ysacc.co.kr', email: 'jhkim1130@ysacc.co.kr' },
        to: [{ email: to }],
        ...(ccList.length > 0 ? { cc: ccList.map(e => ({ email: e })) } : {}),
        subject: subject,
        textContent: text,
        htmlContent: html || `<div style="font-family: sans-serif; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${text.replace(/\n/g, '<br/>')}</div>`
      };

      const bRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'accept': 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify(brevoPayload)
      });

      if (bRes.status >= 200 && bRes.status < 300) {
        const bData = await bRes.json();
        return res.json({ success: true, message: 'Brevo 이메일 서버에서 발주서가 즉시 전송되었습니다.', data: bData });
      }
    }

    // 2. Try SendGrid API
    if (sendgridApiKey) {
      const sgPayload = {
        personalizations: [
          {
            to: [{ email: to }],
            ...(ccList.length > 0 ? { cc: ccList.map(e => ({ email: e })) } : {})
          }
        ],
        from: { email: 'admin@ysacc.co.kr', name: 'YSACC 무역관리' },
        subject: subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html || `<div style="font-family: sans-serif; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${text.replace(/\n/g, '<br/>')}</div>` }
        ]
      };

      const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sgPayload)
      });

      if (sgRes.status >= 200 && sgRes.status < 300) {
        return res.json({ success: true, message: 'SendGrid 서버에서 발주서 이메일이 즉시 발송되었습니다.' });
      }
    }

    return res.status(503).json({ error: 'Email API Key is not configured on server.' });
  } catch (e) {
    console.error('Failed to send email:', e);
    res.status(500).json({ error: e.message });
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
// API: Purchase Orders (PO Issue)
// ─────────────────────────────────────────
app.post('/api/po/:poId/issue', async (req, res) => {
  const { poId } = req.params;
  const { htmlContent, poNumber, supplierName, totalAmount, issuedBy = 'System' } = req.body;

  try {
    // Determine new version
    const versionRes = await pool.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM po_issued_documents WHERE po_id = $1`,
      [poId]
    );
    const version = versionRes.rows[0].next_version;

    // Create filename & path
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    // Clean poNumber for path
    const safePoNumber = poNumber.replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
    const safeFileName = `${safePoNumber}_v${version}.pdf`;
    
    const relativeDir = path.join('po', String(year), month);
    const uploadDir = path.join(__dirname, 'files', relativeDir);
    
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, safeFileName);
    const fileUrl = `/files/${relativeDir.replace(/\\/g, '/')}/${safeFileName}`;

    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({ 
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    fs.writeFileSync(filePath, pdfBuffer);

    // Update DB
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Set previous versions to superseded
      await client.query(
        `UPDATE po_issued_documents SET status = 'superseded' WHERE po_id = $1`,
        [poId]
      );

      // Insert new document
      const docRes = await client.query(
        `INSERT INTO po_issued_documents 
         (po_id, po_number, supplier_name, version, file_name, file_path, file_size, issued_at, issued_by, total_amount, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, 'active')
         RETURNING id, issued_at`,
        [poId, poNumber, supplierName, version, safeFileName, fileUrl, pdfBuffer.length, issuedBy, totalAmount]
      );
      
      const newDocId = docRes.rows[0].id;
      const issuedAt = docRes.rows[0].issued_at;

      // Update PO status (ignoring error if migration not run yet)
      try {
        await client.query(
          `UPDATE purchase_orders SET issue_status = 'issued', latest_issue_id = $1 WHERE id = $2`,
          [newDocId, poId]
        );
      } catch (e) {
        console.warn("Could not update purchase_orders table. Check if migration ran:", e.message);
      }

      await client.query('COMMIT');

      res.status(200).json({
        success: true,
        documentId: newDocId,
        version,
        fileName: safeFileName,
        fileUrl,
        issuedAt
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("PDF Generation Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────
// API: Stateless PDF Generation (No DB/Storage)
// ─────────────────────────────────────────
app.post('/api/pdf/generate', async (req, res) => {
  const { htmlContent } = req.body;
  if (!htmlContent) return res.status(400).send('htmlContent is required');

  try {
    let browser;
    const args = ['--no-sandbox', '--disable-setuid-sandbox'];
    
    // Find the Chrome binary dynamically since different Docker setups put it in different places
    let dynamicPath = '';
    try {
      dynamicPath = require('child_process').execSync('find /home/pptruser/.cache/puppeteer -type f -name chrome | head -n 1').toString().trim();
    } catch(e) {}
    if (!dynamicPath) {
      try {
        dynamicPath = require('child_process').execSync('find / -type f -name chrome 2>/dev/null | grep puppeteer | head -n 1').toString().trim();
      } catch(e) {}
    }

    const pathsToTry = [
      dynamicPath,
      process.env.PUPPETEER_EXECUTABLE_PATH,
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser'
    ].filter(Boolean);

    let lastError;
    for (const p of pathsToTry) {
      try {
        console.log("Trying executablePath:", p);
        browser = await puppeteer.launch({ args, executablePath: p });
        break; // Success
      } catch (err) {
        lastError = err;
        console.warn(`Launch failed with path ${p}:`, err.message);
      }
    }

    if (!browser) {
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
      try {
        browser = await puppeteer.launch({ args });
      } catch (err) {
        throw new Error("All browser launch attempts failed. Searched paths: " + pathsToTry.join(', ') + " | Last error: " + lastError?.message);
      }
    }
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="document.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Stateless PDF Gen Error:", error);
    res.status(500).send('PDF Generation Failed: ' + error.message);
  }
});

app.get('/api/po/:poId/documents', async (req, res) => {
  const { poId } = req.params;
  try {
    const result = await pool.query(
      `SELECT id, version, file_name AS "fileName", file_path AS "fileUrl", 
              issued_at AS "issuedAt", issued_by AS "issuedBy", 
              total_amount AS "totalAmount", status
       FROM po_issued_documents 
       WHERE po_id = $1 
       ORDER BY version DESC`,
      [poId]
    );
    res.json({ documents: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
