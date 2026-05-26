import type { ProformaInvoice, PIItem } from '../types/pi';

/**
 * Generates a PDF-ready print view of a Proforma Invoice
 * using a new browser window and window.print() (Save as PDF).
 * This avoids heavy dependencies like jspdf/canvg that cause Vite build issues.
 */
export const generatePIPdf = (piData: ProformaInvoice, items: PIItem[]) => {
  const issuerName = piData.issuingCompany === 'YS' ? 'YS ACC' : 'YSACC CO., LTD.';

  const itemRows = items.map((item, index) => `
    <tr>
      <td style="text-align:center; padding:7px 6px; border:1px solid #d1d5db;">${index + 1}</td>
      <td style="padding:7px 6px; border:1px solid #d1d5db;">${item.description}</td>
      <td style="text-align:right; padding:7px 6px; border:1px solid #d1d5db;">${item.quantity}</td>
      <td style="text-align:center; padding:7px 6px; border:1px solid #d1d5db;">${item.unit}</td>
      <td style="text-align:right; padding:7px 6px; border:1px solid #d1d5db;">$${(item.salePriceUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td style="text-align:right; padding:7px 6px; border:1px solid #d1d5db; font-weight:600;">$${(item.lineTotalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td style="padding:7px 6px; border:1px solid #d1d5db; font-size:11px; color:#6b7280;">${item.remarks || ''}</td>
    </tr>
  `).join('');

  const freightRows = (piData.freightCharges || []).map(f => `
    <tr><td style="text-align:right; padding:3px 0; color:#475569;">${f.name}:</td><td style="text-align:right; padding:3px 8px;">$${(f.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
  `).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${piData.piNumber || 'Proforma Invoice'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1f2937; padding: 30px 40px; }
    @media print {
      body { padding: 15px 25px; }
      .no-print { display: none !important; }
      @page { size: A4; margin: 12mm 10mm; }
    }
    .header { text-align: center; margin-bottom: 20px; }
    .header h1 { font-size: 26px; color: #1f4e78; letter-spacing: 2px; margin-bottom: 4px; }
    .header-line { height: 2px; background: linear-gradient(90deg, transparent, #1f4e78, transparent); margin: 8px 0 16px; }
    .info-grid { display: flex; justify-content: space-between; margin-bottom: 16px; }
    .info-left, .info-right { width: 48%; }
    .info-right { text-align: right; }
    .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #1f4e78; font-weight: 700; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .detail-row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
    .detail-label { color: #6b7280; }
    .detail-value { font-weight: 500; }
    .terms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
    th { background: #1f4e78; color: #fff; padding: 8px 6px; text-align: center; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .totals { margin-left: auto; width: 280px; }
    .totals table { border: none; }
    .totals td { padding: 4px 8px; border: none; }
    .grand-total { font-size: 16px; font-weight: 700; color: #059669; border-top: 2px solid #1f4e78; padding-top: 6px; }
    .remarks-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 16px; margin-top: 12px; font-size: 12px; }
    .footer { text-align: center; margin-top: 30px; font-size: 10px; color: #9ca3af; }
    .print-btn { position: fixed; bottom: 20px; right: 20px; padding: 12px 28px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,0.3); z-index: 999; }
    .print-btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>

  <div class="header">
    <h1>PROFORMA INVOICE</h1>
    <div class="header-line"></div>
  </div>

  <div class="info-grid">
    <div class="info-left">
      <div style="font-size:16px; font-weight:700; color:#1f4e78; margin-bottom:10px;">${issuerName}</div>
      <div class="section-title">TO</div>
      <div style="font-size:14px; font-weight:600; margin-bottom:3px;">${piData.customerName || '-'}</div>
      <div style="font-size:12px; color:#475569;">Attn: ${piData.contactPerson || '-'}</div>
      <div style="font-size:12px; color:#475569;">Email: ${piData.email || '-'}</div>
    </div>
    <div class="info-right">
      <div class="detail-row"><span class="detail-label">Date:</span> <span class="detail-value">${piData.piDate}</span></div>
      <div class="detail-row"><span class="detail-label">Invoice No:</span> <span class="detail-value" style="color:#1f4e78; font-weight:700;">${piData.piNumber}</span></div>
      <div class="detail-row"><span class="detail-label">Valid Until:</span> <span class="detail-value">${piData.validUntilDate}</span></div>
      <div class="detail-row"><span class="detail-label">Revision:</span> <span class="detail-value">v${piData.currentVersion || 1}</span></div>
      <div class="detail-row"><span class="detail-label">Status:</span> <span class="detail-value" style="text-transform:uppercase;">${piData.status}</span></div>
    </div>
  </div>

  <div class="section-title" style="margin-top:12px;">Trade Terms</div>
  <div class="terms-grid">
    <div class="detail-row"><span class="detail-label">Incoterms:</span> <span class="detail-value">${piData.incoterms || '-'}</span></div>
    <div class="detail-row"><span class="detail-label">Destination Port:</span> <span class="detail-value">${piData.destinationPort || '-'}</span></div>
    <div class="detail-row"><span class="detail-label">Departure Port:</span> <span class="detail-value">${piData.departurePort || '-'}</span></div>
    <div class="detail-row"><span class="detail-label">Shipping Method:</span> <span class="detail-value">${piData.shippingMethod || '-'}</span></div>
    <div class="detail-row"><span class="detail-label">Payment Terms:</span> <span class="detail-value">${piData.paymentTerms || '-'}</span></div>
    <div class="detail-row"><span class="detail-label">Packaging Spec.:</span> <span class="detail-value">${piData.packagingSpec || '-'}</span></div>
  </div>

  <div class="section-title">Line Items</div>
  <table>
    <thead>
      <tr>
        <th style="width:35px;">No</th>
        <th>Description</th>
        <th style="width:60px;">Qty</th>
        <th style="width:50px;">Unit</th>
        <th style="width:90px;">Unit Price ($)</th>
        <th style="width:90px;">Total ($)</th>
        <th style="width:100px;">Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || '<tr><td colspan="7" style="text-align:center; padding:20px; color:#9ca3af;">No items</td></tr>'}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td style="text-align:right; color:#475569;">Subtotal (USD):</td><td style="text-align:right; font-weight:600;">$${(piData.subtotalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
      ${freightRows}
      <tr><td style="text-align:right; color:#475569;">Extras (USD):</td><td style="text-align:right; font-weight:600;">$${(piData.extrasUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
      <tr class="grand-total"><td style="text-align:right;">GRAND TOTAL (USD):</td><td style="text-align:right;">$${(piData.totalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
    </table>
  </div>

  ${piData.remarks ? `
  <div class="remarks-box">
    <strong style="color:#6b7280;">REMARKS:</strong><br/>
    <span>${piData.remarks}</span>
  </div>
  ` : ''}

  <div class="footer">
    This is a computer-generated document. No signature is required.
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
