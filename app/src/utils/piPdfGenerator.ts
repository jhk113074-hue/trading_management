import type { ProformaInvoice, PIItem } from '../types/pi';

/**
 * Generates a PDF-ready print view of a Proforma Invoice
 * using a new browser window and window.print() (Save as PDF).
 * This matches the professional Excel sheet layout exactly.
 */
export const generatePIPdf = (piData: ProformaInvoice, items: PIItem[]) => {
  const issuerName = piData.issuingCompany === 'YS' ? 'YS ACC' : 'YSACC CO., LTD.';
  const logoVersion = Date.now();

  const itemRows = items.map((item, index) => `
    <tr>
      <td style="text-align:center; padding:8px 6px; border:1px solid #cbd5e1; background:#f8fafc; color:#64748b; font-weight:500;">${index + 1}</td>
      <td style="padding:8px 10px; border:1px solid #cbd5e1; font-weight:600; color:#1e293b;">${item.description}</td>
      <td style="text-align:right; padding:8px 10px; border:1px solid #cbd5e1; color:#0f172a; font-weight:500;">${(item.quantity || 0).toLocaleString('en-US')}</td>
      <td style="text-align:center; padding:8px 6px; border:1px solid #cbd5e1; color:#475569;">${item.unit}</td>
      <td style="text-align:right; padding:8px 10px; border:1px solid #cbd5e1; color:#0f172a; font-weight:500;">$${(item.salePriceUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td style="text-align:right; padding:8px 10px; border:1px solid #cbd5e1; font-weight:700; color:#0f172a;">$${(item.lineTotalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td style="padding:8px 10px; border:1px solid #cbd5e1; font-style:italic; font-size:11px; color:#64748b; text-align:right;">${item.remarks || ''}</td>
    </tr>
  `).join('');

  const freightRows = (piData.freightCharges || []).map(f => `
    <tr>
      <td style="text-align:right; padding:5px 12px; color:#64748b; font-size:12px; border:none;">${f.name} (USD):</td>
      <td style="text-align:right; padding:5px 12px; font-weight:600; color:#1e293b; font-size:12px; border:none; width:120px;">$${(f.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
    </tr>
  `).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${piData.piNumber || 'Proforma Invoice'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1f2937; background: #f3f4f6; display: flex; justify-content: center; padding: 40px 0; }
    .page-container {
      background: #ffffff;
      width: 210mm;
      min-height: 297mm;
      padding: 18mm 18mm 0 18mm;
      box-shadow: 0 10px 25px rgba(0,0,0,0.15);
      display: flex;
      flex-direction: column;
      position: relative;
    }
    @media print {
      body { background: #ffffff; padding: 0; display: block; }
      .page-container {
        width: 100%;
        min-height: 100%;
        padding: 0;
        box-shadow: none;
      }
      .no-print { display: none !important; }
      @page { size: A4; margin: 12mm 10mm; }
    }

    /* Metadata Table Style */
    .metadata-table { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
    .metadata-table th { background: #f8fafc; color: #475569; padding: 6px 12px; text-align: center; font-size: 10.5px; font-weight: 700; border: 1px solid #cbd5e1; text-transform: uppercase; letter-spacing: 0.5px; }
    .metadata-table td { padding: 8px 12px; text-align: center; font-size: 13px; font-weight: 700; border: 1px solid #cbd5e1; color: #1e293b; }
    .status-cell { font-weight: 700 !important; }
    .status-draft { color: #b45309; background: #fffbeb; }
    .status-confirmed { color: #15803d; background: #f0fdf4; }

    /* Titles */
    .section-title { font-size: 11px; font-weight: 800; letter-spacing: 1px; margin-bottom: 6px; text-transform: uppercase; }
    .color-red { color: #991b1b; }
    .color-gold { color: #b45309; }

    /* Bill To Content */
    .bill-to-box { margin-bottom: 20px; }
    .customer-name { font-size: 17px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
    .customer-detail { font-size: 12px; color: #334155; line-height: 1.4; }

    /* Trade Terms Table */
    .terms-table { width: 100%; border-collapse: collapse; margin-bottom: 22px; border: 1px solid #cbd5e1; }
    .terms-label { background: #f8fafc; color: #475569; width: 16%; font-size: 11.5px; padding: 7px 12px; font-weight: 600; border: 1px solid #cbd5e1; }
    .terms-value { color: #0f172a; font-weight: 700; font-size: 12.5px; padding: 7px 12px; border: 1px solid #cbd5e1; width: 34%; }

    /* Line Items Table */
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .items-table th { background: #1f4e78; color: #ffffff; padding: 9px 8px; text-align: center; font-weight: 700; border: 1px solid #1f4e78; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.5px; }

    /* Totals Box */
    .totals-section { margin-left: auto; width: 320px; margin-bottom: 15px; }
    .totals-table { width: 100%; border-collapse: collapse; border: none; }
    .totals-table td { border: none; }
    .grand-total-row td { border-top: 2px solid #1f4e78 !important; border-bottom: 2px solid #1f4e78 !important; }
    .grand-total-label { font-size: 14.5px; font-weight: 800; color: #1e293b; padding: 8px 12px; text-align: right; }
    .grand-total-val { font-size: 18px; font-weight: 800; color: #991b1b; padding: 8px 12px; text-align: right; }

    /* Remarks Box */
    .remarks-box { border: 1px solid #fca5a5; background: #fff8f8; border-radius: 6px; padding: 12px 16px; margin-top: 10px; margin-bottom: 30px; font-size: 12px; line-height: 1.5; color: #334155; }
    .remarks-line { margin-bottom: 4px; font-weight: 500; }
    .remarks-line:last-child { margin-bottom: 0; }

    /* Bottom Footer Bar */
    .footer-bar {
      margin-top: auto;
      background: #0f172a;
      color: #ffffff;
      font-size: 10.5px;
      font-weight: 600;
      text-align: center;
      padding: 8px 15px;
      letter-spacing: 0.5px;
      margin-left: -18mm;
      margin-right: -18mm;
    }
    @media print {
      .footer-bar {
        margin-left: -10mm;
        margin-right: -10mm;
      }
    }

    .print-btn { position: fixed; bottom: 20px; right: 20px; padding: 12px 28px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,0.3); z-index: 999; }
    .print-btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>

  <div class="page-container">

  <!-- Letterhead Area (Automatically shown if image exists in /public folder) -->
  <div id="letterhead-box" style="margin-bottom: 12px; display: none; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">
    <img src="${piData.issuingCompany === 'YS' ? `/letterhead_ys.png?v=${logoVersion}` : `/letterhead_ysacc.png?v=${logoVersion}`}" 
         style="width: 100%; height: auto; max-height: 120px; display: block; object-fit: contain;"
         onload="document.getElementById('letterhead-box').style.display='block'; const el = document.getElementById('issuer-name-text'); if(el) el.style.display='none';" />
  </div>

  <div id="issuer-name-text" style="font-size:18px; font-weight:800; color:#1f4e78; margin-bottom:12px; text-align:center;">${issuerName}</div>

  <!-- Metadata Table -->
  <table class="metadata-table">
    <thead>
      <tr>
        <th style="width: 25%;">INVOICE NO.</th>
        <th style="width: 20%;">DATE</th>
        <th style="width: 20%;">VALID UNTIL</th>
        <th style="width: 15%;">REVISION</th>
        <th style="width: 20%;">STATUS</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="color:#1f4e78;">${piData.piNumber || '-'}</td>
        <td>${piData.piDate || '-'}</td>
        <td>${piData.validUntilDate || '-'}</td>
        <td>v${piData.currentVersion || 1}</td>
        <td class="status-cell status-${(piData.status || 'draft').toLowerCase()}">${(piData.status || 'draft').toUpperCase()}</td>
      </tr>
    </tbody>
  </table>

  <!-- Bill To Section -->
  <div class="bill-to-box">
    <div class="section-title color-red">BILL TO</div>
    <div class="customer-name">${piData.customerName || '-'}</div>
    <div class="customer-detail">
      ${(piData as any).customerAddress ? `<div>Address: ${(piData as any).customerAddress}</div>` : ''}
      <div>Attn: ${piData.contactPerson || '-'}</div>
      <div>Email: ${piData.email || '-'}</div>
      ${(piData as any).customerPhone ? `<div>Tel: ${(piData as any).customerPhone}</div>` : ''}
    </div>
  </div>

  <!-- Trade Terms Section -->
  <div>
    <div class="section-title color-gold">TRADE TERMS</div>
    <table class="terms-table">
      <tr>
        <td class="terms-label">Incoterms</td>
        <td class="terms-value">${piData.incoterms || '-'}</td>
        <td class="terms-label">Destination</td>
        <td class="terms-value">${piData.destinationPort || '-'}</td>
      </tr>
      <tr>
        <td class="terms-label">Departure Port</td>
        <td class="terms-value">${piData.departurePort || '-'}</td>
        <td class="terms-label">Shipping</td>
        <td class="terms-value">${piData.shippingMethod || '-'}</td>
      </tr>
      <tr>
        <td class="terms-label">Payment Terms</td>
        <td class="terms-value">${piData.paymentTerms || '-'}</td>
        <td class="terms-label">Packaging</td>
        <td class="terms-value">${piData.packagingSpec || '-'}</td>
      </tr>
    </table>
  </div>

  <!-- Line Items Section -->
  <div>
    <div class="section-title color-red">LINE ITEMS</div>
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:40px; text-align:center;">No</th>
          <th>Description</th>
          <th style="width:75px; text-align:right;">Qty</th>
          <th style="width:60px; text-align:center;">Unit</th>
          <th style="width:105px; text-align:right;">Unit Price</th>
          <th style="width:115px; text-align:right;">Total (USD)</th>
          <th style="width:110px; text-align:right;">Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td colspan="7" style="text-align:center; padding:20px; color:#9ca3af;">No items</td></tr>'}
      </tbody>
    </table>
  </div>

  <!-- Totals Section -->
  <div class="totals-section">
    <table class="totals-table">
      <tr>
        <td style="text-align:right; padding:5px 12px; color:#64748b; font-size:12px; border:none;">Subtotal (USD):</td>
        <td style="text-align:right; padding:5px 12px; font-weight:600; color:#1e293b; font-size:12px; border:none; width:120px;">$${(piData.subtotalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
      ${freightRows}
      <tr>
        <td style="text-align:right; padding:5px 12px; color:#64748b; font-size:12px; border:none;">Extras (USD):</td>
        <td style="text-align:right; padding:5px 12px; font-weight:600; color:#1e293b; font-size:12px; border:none; width:120px;">$${(piData.extrasUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr class="grand-total-row">
        <td class="grand-total-label">GRAND TOTAL (USD)</td>
        <td class="grand-total-val">$${(piData.totalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
    </table>
  </div>

  <!-- Remarks Section -->
  <div>
    <div class="section-title color-red">REMARKS</div>
    <div class="remarks-box">
      ${piData.remarks ? piData.remarks.split('\n').map((line) => `
        <div class="remarks-line">${line}</div>
      `).join('') : `
        <div class="remarks-line">① This is a basic price. Prices are subject to change based on your additional requests.</div>
        <div class="remarks-line">② Shipping cost may vary monthly depending on the carrier's current conditions.</div>
      `}
    </div>
  </div>

  <!-- Footer Bar -->
  <div class="footer-bar">
    ${issuerName} &nbsp;·&nbsp; ${piData.issuingCompany === 'YS' ? 'www.ysacc.co.kr' : 'www.ysacc.co.kr'} &nbsp;·&nbsp; ${piData.piNumber || ''} &nbsp;·&nbsp; Page 1 of 1
  </div>

  </div>
</body>
</html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    alert('팝업이 차단되었습니다. 팝업 차단을 해제해 주세요.');
  }
};
