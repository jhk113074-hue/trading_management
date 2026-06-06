import type { ProformaInvoice, PIItem } from '../types/pi';

/**
 * Generates a PDF-ready print view of a Proforma Invoice
 * using a new browser window and window.print() (Save as PDF).
 * This matches the professional Excel sheet layout exactly.
 */
export const generatePIPdf = (piData: ProformaInvoice, items: PIItem[]) => {
  const issuerName = piData.issuingCompany === 'YS' ? 'YS ACC' : 'YSACC CO., LTD.';
  const logoVersion = Date.now();

  const isYS = piData.issuingCompany === 'YS';
  const bankName = "INDUSTRIAL BANK OF KOREA, SEOUL,KOREA";
  const bankAddress = "50, ULCHIRO 2-GA, CHUNG-GU, SEOUL, 100-758, SOUTH KOREA";
  const beneficiary = isYS ? "YS ACC" : "YSACC Co.,LTD";
  const bankAccountNo = isYS ? "940-013901-56-00011" : "143-129260-56-00012";
  const swiftCode = isYS ? "IBKOKRSE" : "IBKOKRSEXXX";
  const beneficiaryAddress = isYS 
    ? "111-201, 76, Wolmyeong-ro, Heungdeok-gu, Cheongju-si, Chungcheongbuk-do, 28589, Korea" 
    : "201-1HO, 1251, GAROSU-RO, HEUNGDEOK-GU, CHEONGJU-SI, CHUNGCHEONGBUK-DO, 28420, SOUTH KOREA";

  const itemRows = items.map((item, index) => `
    <tr>
      <td style="text-align:center; padding:4px 6px; border:1px solid #cbd5e1; background:#f8fafc; color:#64748b; font-weight:500;">${index + 1}</td>
      <td style="padding:4px 8px; border:1px solid #cbd5e1; font-weight:600; color:#1e293b;">${item.description}</td>
      <td style="text-align:right; padding:4px 8px; border:1px solid #cbd5e1; color:#0f172a; font-weight:500;">${(item.quantity || 0).toLocaleString('en-US')}</td>
      <td style="text-align:center; padding:4px 6px; border:1px solid #cbd5e1; color:#475569;">${item.unit}</td>
      <td style="text-align:right; padding:4px 8px; border:1px solid #cbd5e1; color:#0f172a; font-weight:500;">$${(item.salePriceUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td style="text-align:right; padding:4px 8px; border:1px solid #cbd5e1; font-weight:700; color:#0f172a;">$${(item.lineTotalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      <td style="padding:4px 8px; border:1px solid #cbd5e1; font-style:italic; font-size:11px; color:#64748b; text-align:right;">${item.remarks || ''}</td>
    </tr>
  `).join('');

  const freightTable = (piData.freightCharges && piData.freightCharges.length > 0) ? `
  <div style="margin-top: 10px;">
    <div class="section-title color-red">FREIGHT CHARGES</div>
    <table class="items-table" style="margin-bottom: 5px;">
      <thead>
        <tr>
          <th style="width:120px;">Container Type</th>
          <th style="width:60px;">Qty</th>
          <th style="width:80px;">Unit Price</th>
          <th style="width:95px;">Total (USD)</th>
          <th>Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${piData.freightCharges.map(fc => `
          <tr>
            <td style="text-align:center; padding:4px 10px; border:1px solid #cbd5e1; font-weight:600; color:#1e293b;">${fc.type || '-'}</td>
            <td style="text-align:center; padding:4px 8px; border:1px solid #cbd5e1; color:#0f172a; font-weight:500;">${(fc.qty || 0).toLocaleString('en-US')}</td>
            <td style="text-align:right; padding:4px 8px; border:1px solid #cbd5e1; color:#0f172a; font-weight:500;">$${(fc.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td style="text-align:right; padding:4px 8px; border:1px solid #cbd5e1; font-weight:700; color:#0f172a;">$${((fc.qty || 0) * (fc.price || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            <td style="padding:4px 10px; border:1px solid #cbd5e1; font-style:italic; font-size:11px; color:#64748b;">${fc.remarks || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${piData.piNumber || 'Proforma Invoice'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1f2937; background: #f3f4f6; display: flex; justify-content: center; padding: 25px 0; }
    .page-container {
      background: #ffffff;
      width: 210mm;
      min-height: 297mm;
      padding: 10mm 10mm 0 10mm;
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
      @page { size: A4; margin: 6mm 6mm; }
    }

    /* Metadata Table Style */
    .metadata-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .metadata-table th { background: #f8fafc; color: #475569; padding: 4px 8px; text-align: center; font-size: 10px; font-weight: 700; border: 1px solid #cbd5e1; text-transform: uppercase; letter-spacing: 0.5px; }
    .metadata-table td { padding: 5px 8px; text-align: center; font-size: 12px; font-weight: 700; border: 1px solid #cbd5e1; color: #1e293b; }
    .status-cell { font-weight: 700 !important; }
    .status-draft { color: #b45309; background: #fffbeb; }
    .status-confirmed { color: #15803d; background: #f0fdf4; }

    /* Titles */
    .section-title { font-size: 10.5px; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 4px; text-transform: uppercase; }
    .color-red { color: #991b1b; }
    .color-gold { color: #b45309; }

    /* Bill To Content */
    .bill-to-box { margin-bottom: 12px; }
    .customer-name { font-size: 15.5px; font-weight: 800; color: #0f172a; margin-bottom: 3px; }
    .customer-detail { font-size: 11px; color: #334155; line-height: 1.35; }

    /* Trade Terms Table */
    .terms-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border: 1px solid #cbd5e1; }
    .terms-label { background: #f8fafc; color: #475569; width: 16%; font-size: 11px; padding: 4px 8px; font-weight: 600; border: 1px solid #cbd5e1; }
    .terms-value { color: #0f172a; font-weight: 700; font-size: 11.5px; padding: 4px 8px; border: 1px solid #cbd5e1; width: 34%; }

    /* Line Items Table */
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11.5px; }
    .items-table th { background: #1f4e78; color: #ffffff; padding: 5px 6px; text-align: center; font-weight: 700; border: 1px solid #1f4e78; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; }

    /* Totals Box */
    .totals-section { margin-left: auto; width: 320px; margin-bottom: 8px; }
    .totals-table { width: 100%; border-collapse: collapse; border: none; }
    .totals-table td { border: none; }
    .grand-total-row td { border-top: 2px solid #1f4e78 !important; border-bottom: 2px solid #1f4e78 !important; }
    .grand-total-label { font-size: 13.5px; font-weight: 800; color: #1e293b; padding: 5px 8px; text-align: right; }
    .grand-total-val { font-size: 16px; font-weight: 800; color: #991b1b; padding: 5px 8px; text-align: right; }

    /* Remarks Box */
    .remarks-box { border: 1px solid #fca5a5; background: #fff8f8; border-radius: 6px; padding: 8px 12px; margin-top: 4px; margin-bottom: 15px; font-size: 11px; line-height: 1.45; color: #334155; }
    .remarks-line { margin-bottom: 2px; font-weight: 500; }
    .remarks-line:last-child { margin-bottom: 0; }

    /* Bottom Footer Bar */
    .footer-bar {
      margin-top: auto;
      background: #0f172a;
      color: #ffffff;
      font-size: 10px;
      font-weight: 600;
      text-align: center;
      padding: 6px 15px;
      letter-spacing: 0.5px;
      margin-left: -10mm;
      margin-right: -10mm;
    }
    @media print {
      .footer-bar {
        margin-left: -6mm;
        margin-right: -6mm;
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

  <!-- Bill To & Metadata Row -->
  <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 20px;">
    <!-- Bill To Section (Left) -->
    <div class="bill-to-box" style="flex: 1; margin-bottom: 0;">
      <div class="section-title color-red">BILL TO</div>
      <div class="customer-name">${piData.customerName || '-'}</div>
      <div class="customer-detail">
        <div>Address: ${(piData as any).customerAddress || '-'}</div>
        <div>Attn: ${piData.contactPerson || '-'}</div>
        <div>Email: ${piData.email || '-'}</div>
        ${(piData as any).customerPhone ? `<div>Tel: ${(piData as any).customerPhone}</div>` : ''}
      </div>
    </div>

    <!-- Metadata Table (Right) -->
    <div style="width: 290px; margin-top: 15px;">
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #cbd5e1;">
        <tr>
          <td style="background: #f8fafc; color: #475569; font-weight: 700; padding: 4px 8px; border: 1px solid #cbd5e1; width: 35%; text-align: center; font-size: 9.5px; text-transform: uppercase;">INVOICE NO.</td>
          <td style="color: #1f4e78; font-weight: 800; padding: 4px 8px; border: 1px solid #cbd5e1; text-align: center; font-size: 11.5px; white-space: nowrap;">
            ${piData.piNumber || '-'}${piData.currentVersion && piData.currentVersion > 1 ? `<span style="color: #b45309; font-weight: 700; font-size: 10px; margin-left: 2px;">R${piData.currentVersion - 1}</span>` : ''}
          </td>
        </tr>
        <tr>
          <td style="background: #f8fafc; color: #475569; font-weight: 700; padding: 4px 8px; border: 1px solid #cbd5e1; text-align: center; font-size: 9.5px; text-transform: uppercase;">YOUR REF.</td>
          <td style="color: #0f172a; font-weight: 700; padding: 4px 8px; border: 1px solid #cbd5e1; text-align: center;">${piData.yourRef || '-'}</td>
        </tr>
        <tr>
          <td style="background: #f8fafc; color: #475569; font-weight: 700; padding: 4px 8px; border: 1px solid #cbd5e1; text-align: center; font-size: 9.5px; text-transform: uppercase;">DATE</td>
          <td style="color: #0f172a; font-weight: 700; padding: 4px 8px; border: 1px solid #cbd5e1; text-align: center;">${piData.piDate || '-'}</td>
        </tr>
        <tr>
          <td style="background: #f8fafc; color: #475569; font-weight: 700; padding: 4px 8px; border: 1px solid #cbd5e1; text-align: center; font-size: 9.5px; text-transform: uppercase;">VALID UNTIL</td>
          <td style="color: #0f172a; font-weight: 700; padding: 4px 8px; border: 1px solid #cbd5e1; text-align: center;">${piData.validUntilDate || '-'}</td>
        </tr>

      </table>
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
      <tr>
        <td class="terms-label">Delivery Term</td>
        <td class="terms-value">${piData.deliveryTerm || '-'}</td>
        <td class="terms-label">Origin</td>
        <td class="terms-value">${piData.origin || '-'}</td>
      </tr>
    </table>
  </div>

  <!-- Line Items Section -->
  <div>
    <div class="section-title color-red">LINE ITEMS</div>
    <table class="items-table">
      <thead>
        <tr>
          <th style="width:30px; text-align:center;">No</th>
          <th>Description</th>
          <th style="width:60px; text-align:right;">Qty</th>
          <th style="width:40px; text-align:center;">Unit</th>
          <th style="width:70px; text-align:right;">Unit Price</th>
          <th style="width:95px; text-align:right;">Total (USD)</th>
          <th style="width:80px; text-align:right;">Remarks</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td colspan="7" style="text-align:center; padding:20px; color:#9ca3af;">No items</td></tr>'}
      </tbody>
    </table>
  </div>

  ${freightTable}

  <!-- Totals Section -->
  <div class="totals-section">
    <table class="totals-table">
      <tr>
        <td style="text-align:right; padding:5px 12px; color:#64748b; font-size:12px; border:none;">Subtotal (USD):</td>
        <td style="text-align:right; padding:5px 12px; font-weight:600; color:#1e293b; font-size:12px; border:none; width:120px;">$${(piData.subtotalUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
      ${piData.freightCharges && piData.freightCharges.length > 0 ? `
      <tr>
        <td style="text-align:right; padding:5px 12px; color:#64748b; font-size:12px; border:none;">Freight Total (USD):</td>
        <td style="text-align:right; padding:5px 12px; font-weight:600; color:#1e293b; font-size:12px; border:none; width:120px;">$${(piData.freightCharges || []).reduce((s, f) => s + ((f.qty || 0) * (f.price || 0)), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
      ` : ''}
      ${piData.insurance ? `
      <tr>
        <td style="text-align:right; padding:5px 12px; color:#64748b; font-size:12px; border:none;">Insurance (USD):</td>
        <td style="text-align:right; padding:5px 12px; font-weight:600; color:#1e293b; font-size:12px; border:none; width:120px;">$${(piData.insurance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
      ` : ''}
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
      ${(piData.remarks !== undefined && piData.remarks !== null) ? piData.remarks.split('\n').map((line) => `
        <div class="remarks-line">${line}</div>
      `).join('') : `
        <div class="remarks-line">① This is a basic price. Prices are subject to change based on your additional requests.</div>
        <div class="remarks-line">② Shipping cost may vary monthly depending on the carrier's current conditions.</div>
      `}
    </div>
  </div>

  <!-- Bank Details & Signatures side-by-side section -->
  <div style="display: flex; justify-content: space-between; margin-top: 5px; margin-bottom: 12px; gap: 20px;">
    <!-- Bank Details (Left) -->
    <div style="flex: 0.65;">
      <div class="section-title color-gold" style="margin-bottom: 3px;">BANK DETAILS</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 9.5px; border: 1px solid #cbd5e1;">
        <tr>
          <td style="background:#f8fafc; color:#475569; font-weight:600; padding:2px 5px; border:1px solid #cbd5e1; width:28%;">Bank Name</td>
          <td style="color:#0f172a; font-weight:700; padding:2px 5px; border:1px solid #cbd5e1;">${bankName}</td>
        </tr>
        <tr>
          <td style="background:#f8fafc; color:#475569; font-weight:600; padding:2px 5px; border:1px solid #cbd5e1;">Bank Address</td>
          <td style="color:#0f172a; font-weight:700; padding:2px 5px; border:1px solid #cbd5e1; font-size: 8px; line-height: 1.2;">${bankAddress}</td>
        </tr>
        <tr>
          <td style="background:#f8fafc; color:#475569; font-weight:600; padding:2px 5px; border:1px solid #cbd5e1;">Beneficiary</td>
          <td style="color:#0f172a; font-weight:700; padding:2px 5px; border:1px solid #cbd5e1;">${beneficiary}</td>
        </tr>
        <tr>
          <td style="background:#f8fafc; color:#475569; font-weight:600; padding:2px 5px; border:1px solid #cbd5e1;">Beneficiary Addr</td>
          <td style="color:#0f172a; font-weight:700; padding:2px 5px; border:1px solid #cbd5e1; font-size: 8px; line-height: 1.2;">${beneficiaryAddress}</td>
        </tr>
        <tr>
          <td style="background:#f8fafc; color:#475569; font-weight:600; padding:2px 5px; border:1px solid #cbd5e1;">Account No.</td>
          <td style="color:#0f172a; font-weight:700; padding:2px 5px; border:1px solid #cbd5e1;">${bankAccountNo}</td>
        </tr>
        <tr>
          <td style="background:#f8fafc; color:#475569; font-weight:600; padding:2px 5px; border:1px solid #cbd5e1;">SWIFT Code</td>
          <td style="color:#0f172a; font-weight:700; padding:2px 5px; border:1px solid #cbd5e1;">${swiftCode}</td>
        </tr>
      </table>
    </div>
    
    <!-- Signatures (Right) -->
    <div style="flex: 1.35;">
      <div class="section-title color-red" style="margin-bottom: 3px; text-align: right;">SIGNATURES</div>
      <div style="display: flex; gap: 8px; height: 100px; font-size: 9.5px;">
        <!-- Buyer Sign -->
        <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; display: flex; flex-direction: column; justify-content: space-between; padding: 5px; text-align: center; background: #fff8f8;">
          <div style="font-weight: 700; color: #475569; border-bottom: 1px solid #fca5a5; padding-bottom: 2px; text-transform: uppercase; font-size: 8.5px; line-height: 1.2; word-break: break-word;">
            ${piData.customerName || ''} (BUYER)
          </div>
          <div style="height: 70px; display: flex; justify-content: center; align-items: center;">
            <!-- Empty space for signature -->
          </div>
          <div style="border-top: 1px dashed #cbd5e1; margin-top: 2px; font-weight: 700; font-size: 8.5px; color: #475569;">Authorized Signature</div>
        </div>
        <!-- Seller Sign -->
        <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 4px; display: flex; flex-direction: column; justify-content: space-between; padding: 5px; text-align: center; background: #eff6ff; position: relative;">
          <div style="font-weight: 700; color: #1f4e78; border-bottom: 1px solid #dbeafe; padding-bottom: 2px; z-index: 10;">${piData.issuingCompany === 'YS' ? 'YS ACC' : 'YSACC'} (SELLER)</div>
          <div style="height: 70px; display: flex; justify-content: center; align-items: center; position: relative;">
            <img src="/signature.png?v=${logoVersion}" style="height: 80px; width: auto; object-fit: contain; position: absolute; top: -5px; z-index: 5;" />
          </div>
          <div style="border-top: 1px dashed #cbd5e1; margin-top: 2px; font-weight: 700; font-size: 8.5px; color: #475569; z-index: 10;">Authorized Signature</div>
        </div>
      </div>
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

  const printWindow = window.open('', '_blank', 'width=900,height=950,scrollbars=yes,resizable=yes');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    alert('팝업이 차단되었습니다. 팝업 차단을 해제해 주세요.');
  }
};
