import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface PreviewItem {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
  hsCode?: string;
  netWeight?: number;
  grossWeight?: number;
  cbm?: number;
  packageType?: string;
  packagesCount?: number;
  isFreight?: boolean;
}

export interface ContainerItemData {
  pkgNo?: string;
  description?: string;
  name?: string;
  qty?: number | string;
  netWeight?: number | string;
  grossWeight?: number | string;
  cbm?: number | string;
  packageType?: string;
  dimensions?: string;
  manufacturer?: string;
  _sharedWithPrev?: boolean;
  _isMergedMember?: boolean;
}

export interface ContainerData {
  containerNo?: string;
  sealNo?: string;
  items?: ContainerItemData[];
}

export const generateShippingMarkPngBase64 = (opts: {
  shape?: string;
  company?: string;
  port?: string;
  country?: string;
  palletNoText?: string;
  origin?: string;
}): string | null => {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3.5;

    const shape = opts.shape || 'diamond';
    const comp = opts.company || 'YSACC';

    // Draw shape (Maximized geometry)
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(120, 58, 52, 0, Math.PI * 2);
    } else if (shape === 'square') {
      ctx.rect(20, 10, 200, 96);
    } else if (shape === 'triangle') {
      ctx.moveTo(120, 8);
      ctx.lineTo(228, 108);
      ctx.lineTo(12, 108);
      ctx.closePath();
    } else {
      // Diamond
      ctx.moveTo(120, 6);
      ctx.lineTo(228, 58);
      ctx.lineTo(120, 110);
      ctx.lineTo(12, 58);
      ctx.closePath();
    }
    ctx.stroke();

    // Company name inside shape - dynamically maximize font size to fill shape without overflowing
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxTextWidth = shape === 'diamond' ? 145 : (shape === 'triangle' ? 110 : 160);
    const maxTextHeight = shape === 'diamond' ? 52 : (shape === 'triangle' ? 44 : 56);

    let fontSize = 34;
    ctx.font = `bold ${fontSize}px Tahoma`;
    while (fontSize > 11 && (ctx.measureText(comp).width > maxTextWidth || fontSize > maxTextHeight)) {
      fontSize -= 1;
      ctx.font = `bold ${fontSize}px Tahoma`;
    }

    const shapeCenterY = shape === 'triangle' ? 76 : 58;
    ctx.fillText(comp, 120, shapeCenterY);

    // Text below shape - uniformly maximize font size across all 3 lines
    ctx.fillStyle = '#000000';

    const portCountry = [opts.port, opts.country].filter(Boolean).join(', ').toUpperCase() || 'BUSAN, KOREA';
    const pltNo = opts.palletNoText || 'PALLET NO. : 1 / 1';
    const origin = opts.origin || 'MADE IN KOREA';

    // Uniform max font size for all 3 lines that fits width 232px
    let fSize = 21;
    ctx.font = `bold ${fSize}px Tahoma`;
    while (fSize > 12 && (
      ctx.measureText(portCountry).width > 232 ||
      ctx.measureText(pltNo).width > 232 ||
      ctx.measureText(origin).width > 232
    )) {
      fSize -= 1;
      ctx.font = `bold ${fSize}px Tahoma`;
    }

    ctx.fillText(portCountry, 120, 138);
    ctx.fillText(pltNo, 120, 172);
    ctx.fillText(origin, 120, 206);

    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.split(',')[1];
  } catch (e) {
    console.warn('Failed to generate shipping mark PNG:', e);
    return null;
  }
};

export interface CiPlData {
  orderId?: string;
  piNumber: string;
  invoiceNo?: string;
  invoiceDate: string;
  customerName: string;
  customerAddress?: string;
  issuingCompany: string;
  lcNo?: string;
  lcDate?: string;
  lcIssuingBank?: string;
  notifyParty?: string;
  remarks?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  destinationCountry?: string;
  vesselName?: string;
  etd?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  shippingMarks?: string;
  shippingMarkShape?: string;
  shippingMarkCompany?: string;
  shippingMarkPort?: string;
  shippingMarkCountry?: string;
  shippingMarkPalletNo?: string;
  shippingMarkOrigin?: string;
  customShipperText?: string;
  items: PreviewItem[];
  ciItems?: PreviewItem[];
  plItems?: PreviewItem[];
  containers?: ContainerData[];
  totalPackages?: number;
  totalNetWeight?: number;
  totalGrossWeight?: number;
  totalCbm?: number;
  introText?: string;
  containerInfo?: string;
  bottomFreeText?: string;
  plRemarks?: string;
  vatTrn?: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  hsCodeSummary?: string;
  letterheadUrl?: string;
  includeLetterhead?: boolean;
}

const applyOuterBorder = (
  ws: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number
) => {
  const thin: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } };
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const cell = ws.getCell(r, c);
      const b: Partial<ExcelJS.Borders> = {};
      if (r === startRow) b.top = thin;
      if (r === endRow) b.bottom = thin;
      if (c === startCol) b.left = thin;
      if (c === endCol) b.right = thin;
      cell.border = b;
    }
  }
};

const setFieldBlock = (
  ws: ExcelJS.Worksheet,
  colRange: string,
  labelRow: number,
  valueStartRow: number,
  valueEndRow: number,
  labelText: string,
  valueText: string,
  options: {
    labelBold?: boolean;
    labelSize?: number;
    valueSize?: number;
    valueAlign?: 'left' | 'center' | 'right';
    valueVertical?: 'top' | 'middle' | 'bottom';
    wrapText?: boolean;
  } = {}
) => {
  const [startColStr, endColStr] = colRange.split(':');
  const colToNum = (c: string) => c.charCodeAt(0) - 64;
  const c1 = colToNum(startColStr);
  const c2 = colToNum(endColStr);

  // Label cell (1 line)
  ws.mergeCells(labelRow, c1, labelRow, c2);
  const labelCell = ws.getCell(labelRow, c1);
  labelCell.value = labelText;
  labelCell.font = { name: 'Tahoma', size: options.labelSize || 9, bold: options.labelBold !== false, color: { argb: 'FF000000' } };
  labelCell.alignment = { horizontal: 'left', vertical: 'middle' };

  // Value cell
  ws.mergeCells(valueStartRow, c1, valueEndRow, c2);
  const valCell = ws.getCell(valueStartRow, c1);
  valCell.value = valueText;
  valCell.font = { name: 'Tahoma', size: options.valueSize || 8.5, bold: false, color: { argb: 'FF000000' } };
  valCell.alignment = {
    horizontal: options.valueAlign || 'left',
    vertical: options.valueVertical || 'middle',
    wrapText: options.wrapText !== false
  };

  // Outer border only around the whole combined block (no internal dividing line)
  applyOuterBorder(ws, labelRow, valueEndRow, c1, c2);
};

export const exportCiPlToExcel = async (data: CiPlData) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'YSACC Management System';
    workbook.created = new Date();

    const thinBorder = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FF94A3B8' } };
    const darkBorder = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FF1E293B' } };
    const thickBorder = { style: 'medium' as ExcelJS.BorderStyle, color: { argb: 'FF0F172A' } };
    const doubleBorder = { style: 'double' as ExcelJS.BorderStyle, color: { argb: 'FF0F172A' } };

            const cleanCiName = (rawName: string) => {
      return (rawName || '')
        .replace(/^\[.*?\]\s*/, '')
        .replace(/\(완제\s*Pallet\)/gi, '')
        .replace(/\(완제품\)/gi, '')
        .replace(/\(반제품\)/gi, '')
        .replace(/\(SAMPLE\)/gi, '')
        .replace(/\s*\(완제\)/gi, '')
        .replace(/완제\s*Pallet/gi, '')
        .replace(/\s*\([^)]*(Pallet|완제|적재|대상|단품|혼적)[^)]*\)/gi, '')
        .trim();
    };

    const isYS = (data.issuingCompany as string) === 'YS' || (data.issuingCompany as string) === '영성ACC';
    const companyName = isYS ? 'YS ACC' : 'YSACC CO., LTD.';
    const headerAddress = '111-201, 76, WOLMYEONG-RO, HEUNGDEOK-GU, CHEONGJU-SI, CHUNGCHEONGBUK-DO, 28569, REPUBLIC OF KOREA\nTEL: +82 70 4141 2927 / FAX: +82 303 3444 1130';

    // ==========================================
    // 1. COMMERCIAL INVOICE SHEET
    // ==========================================
    const buildCiSheet = async () => {
      const ws = workbook.addWorksheet('Commercial Invoice', {
        views: [{ showGridLines: true }]
      });

      ws.pageSetup.paperSize = 9; // A4
      ws.pageSetup.orientation = 'portrait';
      ws.pageSetup.fitToPage = true;
      ws.pageSetup.fitToWidth = 1;
      ws.pageSetup.fitToHeight = 0;
      ws.pageSetup.margins = { left: 0.35, right: 0.35, top: 0.4, bottom: 0.4, header: 0.0, footer: 0.0 };

      ws.columns = [
        { width: 8.0 },  // A (Shipping Mark 1/2) -> A+B = 16.0
        { width: 8.0 },  // B (Shipping Mark 2/2) -> A..D = 36.0 (Box 1)
        { width: 10.0 }, // C
        { width: 9.0 },  // D
        { width: 9.0 },  // E
        { width: 9.0 },  // F
        { width: 9.0 },  // G
        { width: 10.0 }, // H -> C..H = 56.0 (Description of Goods)
        { width: 11.0 }, // I (Quantity)
        { width: 7.0 },  // J (Unit)
        { width: 13.0 }, // K (Unit Price)
        { width: 13.0 }, // L (Amount)
      ];

      let currRow = 1;

      // Letterhead (Optional)
      const shouldIncludeLetterhead = data.includeLetterhead !== false;
      let imageAdded = false;

      if (shouldIncludeLetterhead) {
        const logoUrl = data.letterheadUrl || (isYS ? '/ys_acc_letterhead.png' : '/ysacc_letterhead.png');
        if (logoUrl) {
          try {
            const res = await fetch(logoUrl);
            if (res.ok) {
              const ab = await res.arrayBuffer();
              const imgId = workbook.addImage({ buffer: ab, extension: 'png' });
              ws.addImage(imgId, {
                tl: { col: 0, row: 0 } as any,
                br: { col: 12, row: 4 } as any,
                editAs: 'oneCell'
              });
              ws.getRow(1).height = 18;
              ws.getRow(2).height = 18;
              ws.getRow(3).height = 18;
              ws.getRow(4).height = 20;
              ws.mergeCells('A4:L4');
              for (let c = 1; c <= 12; c++) {
                ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
              }
              imageAdded = true;
              currRow = 6;
            }
          } catch (e) {
            console.warn('Letterhead image load fallback:', e);
          }
        }

        if (!imageAdded) {
          ws.mergeCells('A1:L1');
          const hName = ws.getCell('A1');
          hName.value = companyName;
          hName.font = { name: 'Tahoma', size: 14, bold: true };
          hName.alignment = { horizontal: 'left', vertical: 'middle' };
          ws.getRow(1).height = 22;

          ws.mergeCells('A2:L2');
          const hAddr = ws.getCell('A2');
          hAddr.value = headerAddress;
          hAddr.font = { name: 'Tahoma', size: 8, color: { argb: 'FF334155' } };
          hAddr.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          ws.getRow(2).height = 24;

          ws.mergeCells('A3:L3');
          ws.getCell('A3').border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
          ws.getRow(3).height = 4;
          currRow = 5;
        }
      } else {
        // Without letterhead, start cleanly at row 2
        currRow = 2;
      }

      // Document Title
      ws.mergeCells(`A${currRow}:L${currRow}`);
      const titleCell = ws.getCell(`A${currRow}`);
      titleCell.value = 'Commercial Invoice';
      titleCell.font = { name: 'Tahoma', size: 18, bold: true, color: { argb: 'FF000000' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currRow).height = 28;
      currRow += 2;

      // Header Grid (Separate single-line label cells and dedicated value cells with OUTER BORDER ONLY)
      // Section 1: Shipper vs (Invoice No & LC No)
      const r1 = currRow; // Label row
      ws.getRow(r1).height = 18;
      const r2 = r1 + 1;  // Invoice value row
      ws.getRow(r2).height = 20;
      const r3 = r2 + 1;  // LC label row
      ws.getRow(r3).height = 18;
      const r4 = r3 + 1;  // LC value row
      ws.getRow(r4).height = 20;

      // Shipper Block (A:F across rows r1..r4)
      const shipperVal = data.customShipperText || `${companyName}\n${headerAddress}`;
      setFieldBlock(ws, 'A:F', r1, r2, r4, 'Shipper / Beneficiary:', shipperVal, { valueVertical: 'top' });

      // Invoice No Block (G:L across rows r1..r2)
      setFieldBlock(ws, 'G:L', r1, r2, r2, 'Invoice No. & Date:', `${data.invoiceNo || data.piNumber || '-'}   /   ${data.invoiceDate}`);

      // L/C No Block (G:L across rows r3..r4)
      setFieldBlock(ws, 'G:L', r3, r4, r4, 'L/C No. & Date:', `${data.lcNo || 'N/A'}${data.lcDate ? `   &   ${data.lcDate}` : ''}`);

      currRow = r4 + 1;

      // Section 2: Applicant vs L/C Issuing Bank
      const r5 = currRow; // Label row
      ws.getRow(r5).height = 18;
      const r6 = r5 + 1;  // Value row
      const applicantVal = (data.customerName || '-') + (data.customerAddress ? '\n' + data.customerAddress : '');
      const applicantLines = applicantVal.split('\n').length;
      ws.getRow(r6).height = Math.max(38, applicantLines * 14 + 6);

      setFieldBlock(ws, 'A:F', r5, r6, r6, 'Applicant:', applicantVal, { valueVertical: 'top' });
      setFieldBlock(ws, 'G:L', r5, r6, r6, 'L/C Issuing Bank:', data.lcIssuingBank || 'N/A', { valueVertical: 'top' });

      currRow = r6 + 1;

      // Section 3: Notify Party vs Remarks
      const r7 = currRow; // Label row
      ws.getRow(r7).height = 18;
      const r8 = r7 + 1;  // Value row
      const notifyVal = data.notifyParty || data.customerName || 'Same as Applicant';
      const remarksVal = data.remarks ? `"${data.remarks}"` : '"FREIGHT PREPAID"';
      const remarkLines = remarksVal.split('\n').length;
      ws.getRow(r8).height = Math.max(38, remarkLines * 14 + 6);

      setFieldBlock(ws, 'A:F', r7, r8, r8, 'Notify Party:', notifyVal, { valueVertical: 'top' });
      setFieldBlock(ws, 'G:L', r7, r8, r8, 'Remarks:', remarksVal, { valueVertical: 'top' });

      currRow = r8 + 1;

      // Section 4: Port of Loading, Port of Discharge, Payment Terms
      const r9 = currRow; // Label row
      ws.getRow(r9).height = 18;
      const r10 = r9 + 1; // Value row
      const payLines = (data.paymentTerms || '-').split('\n').length;
      ws.getRow(r10).height = Math.max(24, payLines * 14 + 4);

      setFieldBlock(ws, 'A:D', r9, r10, r10, 'Port of Loading:', data.portOfLoading || '-');
      setFieldBlock(ws, 'E:H', r9, r10, r10, 'Port of Discharge:', data.portOfDischarge || '-');
      setFieldBlock(ws, 'I:L', r9, r10, r10, 'Payment Terms:', data.paymentTerms || '-');

      currRow = r10 + 1;

      // Section 5: Vessel / Flight, ETD, Delivery Terms
      const r11 = currRow; // Label row
      ws.getRow(r11).height = 18;
      const r12 = r11 + 1; // Value row
      ws.getRow(r12).height = 22;

      setFieldBlock(ws, 'A:D', r11, r12, r12, 'Vessel / Flight:', data.vesselName || '-');
      setFieldBlock(ws, 'E:H', r11, r12, r12, 'ETD:', data.etd || '-');
      setFieldBlock(ws, 'I:L', r11, r12, r12, 'Delivery Terms:', data.deliveryTerms || '-');

      currRow = r12 + 1;

      currRow++;

      // Table Headers (HS Code column removed from table; Description expanded to C..H)
      const thRow = currRow;
      ws.getRow(thRow).height = 28;

      const setTh = (range: string, val: string) => {
        ws.mergeCells(range);
        const cell = ws.getCell(range.split(':')[0]);
        cell.value = val;
        cell.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FF0F172A' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      };

      setTh(`A${thRow}:B${thRow}`, 'Shipping Mark');
      setTh(`C${thRow}:H${thRow}`, 'Description of Goods');
      ws.getCell(`I${thRow}`).value = 'Quantity';
      ws.getCell(`I${thRow}`).font = { name: 'Tahoma', size: 10, bold: true };
      ws.getCell(`I${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getCell(`J${thRow}`).value = 'Unit';
      ws.getCell(`J${thRow}`).font = { name: 'Tahoma', size: 10, bold: true };
      ws.getCell(`J${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getCell(`K${thRow}`).value = 'Unit Price ($)';
      ws.getCell(`K${thRow}`).font = { name: 'Tahoma', size: 10, bold: true };
      ws.getCell(`K${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getCell(`L${thRow}`).value = 'Amount ($)';
      ws.getCell(`L${thRow}`).font = { name: 'Tahoma', size: 10, bold: true };
      ws.getCell(`L${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

      for (let c = 1; c <= 12; c++) {
        const cell = ws.getCell(thRow, c);
        cell.border = { top: thickBorder, bottom: thickBorder, left: thinBorder, right: thinBorder };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }

      currRow++;
      const itemStartRow = currRow;

      if (data.introText && data.introText.trim()) {
        const introR = currRow;
        ws.mergeCells(`C${introR}:L${introR}`);
        const introCell = ws.getCell(`C${introR}`);
        introCell.value = data.introText.trim();
        introCell.font = { name: 'Tahoma', size: 9.5, bold: true, color: { argb: 'FF1E293B' } };
        introCell.alignment = { vertical: 'middle', wrapText: true };
        const linesCount = data.introText.trim().split('\n').length;
        ws.getRow(introR).height = Math.max(24, linesCount * 15 + 8);
        for (let c = 1; c <= 12; c++) {
          ws.getCell(introR, c).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        }
        currRow++;
      }

      const itemsList = data.ciItems && data.ciItems.length > 0 ? data.ciItems : data.items;
      const regularItems = itemsList.filter(it => !it.isFreight);
      const freightItems = itemsList.filter(it => it.isFreight);
      let totalQty = 0;
      let totalAmt = 0;

      // 1. Regular Product Items
      regularItems.forEach(it => {
        const r = currRow;
        const cleanName = cleanCiName(it.name || '');
        const descLines = cleanName.split('\n').length;
        ws.getRow(r).height = Math.max(24, descLines * 15 + 6);

        const qty = Number(it.qty) || 0;
        const uPrice = Number(it.unitPrice) || 0;
        const amt = Number(it.amount) || (qty * uPrice);

        totalQty += qty;
        totalAmt += amt;

        ws.mergeCells(`C${r}:H${r}`);
        ws.getCell(`C${r}`).value = cleanName;
        ws.getCell(`C${r}`).font = { name: 'Tahoma', size: 9.5 };
        ws.getCell(`C${r}`).alignment = { vertical: 'middle', wrapText: true };

        ws.getCell(`I${r}`).value = qty;
        ws.getCell(`I${r}`).font = { name: 'Tahoma', size: 9.5 };
        ws.getCell(`I${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`I${r}`).numFmt = '#,##0';

        ws.getCell(`J${r}`).value = it.unit || 'PCS';
        ws.getCell(`J${r}`).font = { name: 'Tahoma', size: 9.5 };
        ws.getCell(`J${r}`).alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getCell(`K${r}`).value = uPrice;
        ws.getCell(`K${r}`).font = { name: 'Tahoma', size: 9.5 };
        ws.getCell(`K${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`K${r}`).numFmt = '$#,##0.00';

        ws.getCell(`L${r}`).value = amt;
        ws.getCell(`L${r}`).font = { name: 'Tahoma', size: 9.5 };
        ws.getCell(`L${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`L${r}`).numFmt = '$#,##0.00';

        for (let c = 1; c <= 12; c++) {
          const b: Partial<ExcelJS.Borders> = {};
          if (c === 1 || c === 3) b.left = thinBorder;
          if (c === 2 || c === 12) b.right = thinBorder;
          ws.getCell(r, c).border = b;
        }
        currRow++;
      });

      // 2. Empty Padding Rows to fill A4 sheet nicely (Individual rows with separate column slots, no internal borders)
      const minRows = 8;
      const currentTotal = regularItems.length + freightItems.length;
      const emptyRowsCount = Math.max(1, minRows - currentTotal);

      for (let e = 0; e < emptyRowsCount; e++) {
        const r = currRow;
        ws.getRow(r).height = 24;
        ws.mergeCells(`C${r}:H${r}`);
        ws.getCell(`C${r}`).value = '';

        ws.getCell(`I${r}`).value = '';
        ws.getCell(`J${r}`).value = '';
        ws.getCell(`K${r}`).value = '';
        ws.getCell(`L${r}`).value = '';

        for (let c = 1; c <= 12; c++) {
          const b: Partial<ExcelJS.Borders> = {};
          if (c === 1 || c === 3) b.left = thinBorder;
          if (c === 2 || c === 12) b.right = thinBorder;
          ws.getCell(r, c).border = b;
        }
        currRow++;
      }

      // 3. Freight Charges (placed at the bottom of the table)
      freightItems.forEach(it => {
        const r = currRow;
        const cleanName = cleanCiName(it.name || '');
        const amt = Number(it.amount) || 0;
        totalAmt += amt;

        ws.getRow(r).height = 24;
        ws.mergeCells(`C${r}:H${r}`);
        ws.getCell(`C${r}`).value = cleanName;
        ws.getCell(`C${r}`).font = { name: 'Tahoma', size: 9.5, bold: true };
        ws.getCell(`C${r}`).alignment = { vertical: 'middle', wrapText: true };

        ws.getCell(`I${r}`).value = '';
        ws.getCell(`J${r}`).value = '';
        ws.getCell(`K${r}`).value = '';

        ws.getCell(`L${r}`).value = amt;
        ws.getCell(`L${r}`).font = { name: 'Tahoma', size: 9.5, bold: true };
        ws.getCell(`L${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`L${r}`).numFmt = '$#,##0.00';

        for (let c = 1; c <= 12; c++) {
          const b: Partial<ExcelJS.Borders> = {};
          if (c === 1 || c === 3) b.left = thinBorder;
          if (c === 2 || c === 12) b.right = thinBorder;
          ws.getCell(r, c).border = b;
        }
        currRow++;
      });

      // 4. Shipping Mark Box spanning all item rows (Exact twoCellAnchor with integer coordinates)
      if (itemsList.length > 0 || emptyRowsCount > 0) {
        const itemEndRow = currRow - 1;
        ws.mergeCells(`A${itemStartRow}:B${itemEndRow}`);
        
        const smBase64 = generateShippingMarkPngBase64({
          shape: data.shippingMarkShape,
          company: data.shippingMarkCompany,
          port: data.shippingMarkPort || data.portOfDischarge,
          country: data.shippingMarkCountry || data.destinationCountry,
          palletNoText: data.shippingMarkPalletNo,
          origin: data.shippingMarkOrigin
        });

        if (smBase64) {
          try {
            const smImgId = workbook.addImage({ base64: smBase64, extension: 'png' });
            ws.addImage(smImgId, {
              tl: { col: 0, row: itemStartRow - 1 } as any,
              ext: { width: 115, height: 140 },
              editAs: 'oneCell'
            });
          } catch (err) {
            console.warn('Failed to embed shipping mark image in CI sheet:', err);
            const markCell = ws.getCell(`A${itemStartRow}`);
            markCell.value = data.shippingMarks || 'N/M';
            markCell.font = { name: 'Tahoma', size: 9.5, bold: true };
            markCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          }
        } else {
          const markCell = ws.getCell(`A${itemStartRow}`);
          markCell.value = data.shippingMarks || 'N/M';
          markCell.font = { name: 'Tahoma', size: 9.5, bold: true };
          markCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }
      }

      // Total Amount
      const totalRow = currRow;
      ws.getRow(totalRow).height = 26;
      ws.mergeCells(`A${totalRow}:H${totalRow}`);
      const totTitleCell = ws.getCell(`A${totalRow}`);
      totTitleCell.value = 'TOTAL AMOUNT';
      totTitleCell.font = { name: 'Tahoma', size: 10, bold: true, color: { argb: 'FF000000' } };
      totTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getCell(`I${totalRow}`).value = totalQty;
      ws.getCell(`I${totalRow}`).font = { name: 'Tahoma', size: 10, bold: true };
      ws.getCell(`I${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`I${totalRow}`).numFmt = '#,##0';

      ws.getCell(`J${totalRow}`).value = '';
      ws.getCell(`K${totalRow}`).value = '';

      ws.getCell(`L${totalRow}`).value = totalAmt;
      ws.getCell(`L${totalRow}`).font = { name: 'Tahoma', size: 10.5, bold: true };
      ws.getCell(`L${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`L${totalRow}`).numFmt = '$#,##0.00';

      for (let c = 1; c <= 12; c++) {
        ws.getCell(totalRow, c).border = { top: thinBorder, bottom: doubleBorder, left: thinBorder, right: thinBorder };
      }



      currRow++;

      // Separator Line
      ws.mergeCells(`A${currRow}:L${currRow}`);
      ws.getCell(`A${currRow}`).value = '--------------------------------------------------------------------------------------------------------------------------------';
      ws.getCell(`A${currRow}`).font = { name: 'Tahoma', size: 8, color: { argb: 'FF94A3B8' } };
      ws.getCell(`A${currRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currRow).height = 14;
      currRow++;

      if (data.containerInfo) {
        const cInfoFormatted = data.containerInfo.toUpperCase().startsWith('CONTAINER')
          ? data.containerInfo
          : `CONTAINER : ${data.containerInfo}`;
        ws.mergeCells(`A${currRow}:L${currRow}`);
        ws.getCell(`A${currRow}`).value = cInfoFormatted;
        ws.getCell(`A${currRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`A${currRow}`).font = { name: 'Tahoma', size: 9, bold: true };
        ws.getRow(currRow).height = 18;
        currRow++;
      }

      if (data.hsCodeSummary && data.hsCodeSummary.trim()) {
        ws.mergeCells(`A${currRow}:L${currRow}`);
        ws.getCell(`A${currRow}`).value = 'A) RELEVANT HARMONIZED SYSTEM COMMODITY CODE NUMBER(S) APPLICABLE TO EACH ITEM SHIPPED UNDER THIS CREDIT';
        ws.getCell(`A${currRow}`).font = { name: 'Tahoma', size: 8.5, bold: true };
        ws.getRow(currRow).height = 18;
        currRow++;

        const hsLines = data.hsCodeSummary.trim().split('\n').length;
        ws.mergeCells(`A${currRow}:L${currRow}`);
        ws.getCell(`A${currRow}`).value = data.hsCodeSummary.trim();
        ws.getCell(`A${currRow}`).font = { name: 'Tahoma', size: 8.5 };
        ws.getCell(`A${currRow}`).alignment = { wrapText: true, vertical: 'top' };
        ws.getRow(currRow).height = Math.max(22, hsLines * 14 + 6);
        currRow++;
      }

      if (data.bottomFreeText && data.bottomFreeText.trim()) {
        const lines = data.bottomFreeText.trim().split('\n');
        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) {
            ws.getRow(currRow).height = 10;
            currRow++;
            return;
          }
          const isHeader = /^[B-Z]\)/i.test(trimmed);
          ws.mergeCells(`A${currRow}:L${currRow}`);
          ws.getCell(`A${currRow}`).value = line;
          ws.getCell(`A${currRow}`).font = { name: 'Tahoma', size: 8.5, bold: isHeader };
          ws.getCell(`A${currRow}`).alignment = { vertical: 'middle', wrapText: true };
          ws.getRow(currRow).height = isHeader ? 18 : 15;
          currRow++;
        });
      }

      currRow += 2;
      ws.mergeCells(`I${currRow}:L${currRow}`);
      ws.getCell(`I${currRow}`).value = 'Signed by';
      ws.getCell(`I${currRow}`).font = { name: 'Tahoma', size: 10, italic: true };
      ws.getCell(`I${currRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currRow).height = 18;
      currRow += 4; // Ample space for signature

      ws.mergeCells(`I${currRow}:L${currRow}`);
      ws.getCell(`I${currRow}`).value = companyName;
      ws.getCell(`I${currRow}`).font = { name: 'Tahoma', size: 11, bold: true };
      ws.getCell(`I${currRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(`I${currRow}`).border = { top: darkBorder };
      ws.getRow(currRow).height = 26;
    };

    // ==========================================
    // 2. AUTHENTIC PACKING LIST SHEET (Per Container)
    // ==========================================
    const buildPlSheet = async () => {
      const ws = workbook.addWorksheet('Packing List', {
        views: [{ showGridLines: true }]
      });

      ws.pageSetup.paperSize = 9; // A4
      ws.pageSetup.orientation = 'portrait';
      ws.pageSetup.fitToPage = true;
      ws.pageSetup.fitToWidth = 1;
      ws.pageSetup.fitToHeight = 0;
      ws.pageSetup.margins = { left: 0.35, right: 0.35, top: 0.4, bottom: 0.4, header: 0.0, footer: 0.0 };

      // 12 base columns perfectly tailored for PL layout (Total width 108.0)
      // A:C = 24.0 (Shipping Marks)
      // D:H = 48.0 (Description of Goods / Quantity)
      // I   = 12.0 (Net Weight)
      // J   = 12.0 (Gross Weight)
      // K:L = 12.0 (Measurement CBM)
      ws.columns = [
        { width: 8.0 },  // A
        { width: 8.0 },  // B -> A:C = 24.0
        { width: 8.0 },  // C -> A..D = 36.0 (Box 1)
        { width: 12.0 }, // D
        { width: 9.0 },  // E
        { width: 9.0 },  // F -> A..F = 54.0 (Left 50%)
        { width: 9.0 },  // G
        { width: 9.0 },  // H -> E..H = 36.0 (Box 2), D..H = 48.0 (Desc)
        { width: 12.0 }, // I (Net Weight KGS)
        { width: 12.0 }, // J (Gross Weight KGS)
        { width: 6.0 },  // K
        { width: 6.0 },  // L -> K:L = 12.0 (CBM), I..L = 36.0 (Box 3), G..L = 54.0 (Right 50%)
      ];

      let currRow = 1;

      // Letterhead (Optional)
      const shouldIncludeLetterhead = data.includeLetterhead !== false;
      let imageAdded = false;

      if (shouldIncludeLetterhead) {
        const logoUrl = data.letterheadUrl || (isYS ? '/ys_acc_letterhead.png' : '/ysacc_letterhead.png');
        if (logoUrl) {
          try {
            const res = await fetch(logoUrl);
            if (res.ok) {
              const ab = await res.arrayBuffer();
              const imgId = workbook.addImage({ buffer: ab, extension: 'png' });
              ws.addImage(imgId, {
                tl: { col: 0, row: 0 } as any,
                br: { col: 12, row: 4 } as any,
                editAs: 'oneCell'
              });
              ws.getRow(1).height = 18;
              ws.getRow(2).height = 18;
              ws.getRow(3).height = 18;
              ws.getRow(4).height = 20;
              ws.mergeCells('A4:L4');
              for (let c = 1; c <= 12; c++) {
                ws.getCell(4, c).border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
              }
              imageAdded = true;
              currRow = 6;
            }
          } catch (e) {
            console.warn('Letterhead image load fallback:', e);
          }
        }

        if (!imageAdded) {
          ws.mergeCells('A1:L1');
          const hName = ws.getCell('A1');
          hName.value = companyName;
          hName.font = { name: 'Tahoma', size: 14, bold: true };
          hName.alignment = { horizontal: 'left', vertical: 'middle' };
          ws.getRow(1).height = 22;

          ws.mergeCells('A2:L2');
          const hAddr = ws.getCell('A2');
          hAddr.value = headerAddress;
          hAddr.font = { name: 'Tahoma', size: 8, color: { argb: 'FF334155' } };
          hAddr.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
          ws.getRow(2).height = 24;

          ws.mergeCells('A3:L3');
          ws.getCell('A3').border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
          ws.getRow(3).height = 4;
          currRow = 5;
        }
      } else {
        // Without letterhead, start cleanly at row 2
        currRow = 2;
      }

      // Document Title
      ws.mergeCells(`A${currRow}:L${currRow}`);
      const titleCell = ws.getCell(`A${currRow}`);
      titleCell.value = 'Packing List';
      titleCell.font = { name: 'Tahoma', size: 18, bold: true, color: { argb: 'FF000000' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currRow).height = 28;
      currRow += 2;

      // Header Grid for PL (Separate single-line label cells and dedicated value cells with OUTER BORDER ONLY)
      // Section 1: Shipper vs (PL No & LC No)
      const r1 = currRow; // Label row
      ws.getRow(r1).height = 18;
      const r2 = r1 + 1;  // PL value row
      ws.getRow(r2).height = 20;
      const r3 = r2 + 1;  // LC label row
      ws.getRow(r3).height = 18;
      const r4 = r3 + 1;  // LC value row
      ws.getRow(r4).height = 20;

      // Shipper Block (A:F across rows r1..r4)
      const shipperVal = data.customShipperText || `${companyName}\n${headerAddress}`;
      setFieldBlock(ws, 'A:F', r1, r2, r4, 'Shipper/Exporter:', shipperVal, { valueVertical: 'top' });

      // Packing List No Block (G:L across rows r1..r2)
      setFieldBlock(ws, 'G:L', r1, r2, r2, 'Packing List No. & Date:', `${data.invoiceNo || data.piNumber || '-'}   /   ${data.invoiceDate}`);

      // L/C No Block (G:L across rows r3..r4)
      setFieldBlock(ws, 'G:L', r3, r4, r4, 'L/C No. & Date:', `${data.lcNo || 'N/A'}${data.lcDate ? `   &   ${data.lcDate}` : ''}`);

      currRow = r4 + 1;

      // Section 2: Applicant vs L/C Issuing Bank
      const r5 = currRow; // Label row
      ws.getRow(r5).height = 18;
      const r6 = r5 + 1;  // Value row
      const applicantVal = (data.customerName || '-') + (data.customerAddress ? '\n' + data.customerAddress : '');
      const applicantLines = applicantVal.split('\n').length;
      ws.getRow(r6).height = Math.max(38, applicantLines * 14 + 6);

      setFieldBlock(ws, 'A:F', r5, r6, r6, 'Applicant/Consignee:', applicantVal, { valueVertical: 'top' });
      setFieldBlock(ws, 'G:L', r5, r6, r6, 'L/C Issuing Bank:', data.lcIssuingBank || 'N/A', { valueVertical: 'top' });

      currRow = r6 + 1;

      // Section 3: Notify Party vs Remarks
      const r7 = currRow; // Label row
      ws.getRow(r7).height = 18;
      const r8 = r7 + 1;  // Value row
      const notifyVal = data.notifyParty || data.customerName || 'Same as Applicant';
      const remarksVal = data.remarks ? `"${data.remarks}"` : '"FREIGHT PREPAID"';
      const remarkLines = remarksVal.split('\n').length;
      ws.getRow(r8).height = Math.max(38, remarkLines * 14 + 6);

      setFieldBlock(ws, 'A:F', r7, r8, r8, 'Notify Party:', notifyVal, { valueVertical: 'top' });
      setFieldBlock(ws, 'G:L', r7, r8, r8, 'Remarks:', remarksVal, { valueVertical: 'top' });

      currRow = r8 + 1;

      // Section 4: Port of Loading, Port of Discharge, Payment Terms
      const r9 = currRow; // Label row
      ws.getRow(r9).height = 18;
      const r10 = r9 + 1; // Value row
      const payLines = (data.paymentTerms || '-').split('\n').length;
      ws.getRow(r10).height = Math.max(24, payLines * 14 + 4);

      setFieldBlock(ws, 'A:D', r9, r10, r10, 'Port of Loading:', data.portOfLoading || '-');
      setFieldBlock(ws, 'E:H', r9, r10, r10, 'Port of Discharge:', data.portOfDischarge || '-');
      setFieldBlock(ws, 'I:L', r9, r10, r10, 'Payment Terms:', data.paymentTerms || '-');

      currRow = r10 + 1;

      // Section 5: Vessel Name & Voyage No., Sailing on or about, Delivery Terms
      const r11 = currRow; // Label row
      ws.getRow(r11).height = 18;
      const r12 = r11 + 1; // Value row
      ws.getRow(r12).height = 22;

      setFieldBlock(ws, 'A:D', r11, r12, r12, 'Vessel Name & Voyage No.:', data.vesselName || '-');
      setFieldBlock(ws, 'E:H', r11, r12, r12, 'Sailing on or about:', data.etd || '-');
      setFieldBlock(ws, 'I:L', r11, r12, r12, 'Delivery Terms:', data.deliveryTerms || '-');

      currRow = r12 + 1;

      currRow++;

      // Table Header for Packing List
      const thRow = currRow;
      ws.getRow(thRow).height = 28;

      ws.mergeCells(`A${thRow}:C${thRow}`);
      ws.getCell(`A${thRow}`).value = 'Shipping Marks';
      ws.getCell(`A${thRow}`).font = { name: 'Tahoma', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      ws.getCell(`A${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`D${thRow}:H${thRow}`);
      ws.getCell(`D${thRow}`).value = 'Description of Goods\nQuantity / Number of Packages';
      ws.getCell(`D${thRow}`).font = { name: 'Tahoma', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      ws.getCell(`D${thRow}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      ws.getCell(`I${thRow}`).value = 'Net Weight\n(KGS)';
      ws.getCell(`I${thRow}`).font = { name: 'Tahoma', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      ws.getCell(`I${thRow}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      ws.getCell(`J${thRow}`).value = 'Gross Weight\n(KGS)';
      ws.getCell(`J${thRow}`).font = { name: 'Tahoma', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      ws.getCell(`J${thRow}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      ws.mergeCells(`K${thRow}:L${thRow}`);
      ws.getCell(`K${thRow}`).value = 'Measurement\n(CBM)';
      ws.getCell(`K${thRow}`).font = { name: 'Tahoma', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      ws.getCell(`K${thRow}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      for (let c = 1; c <= 12; c++) {
        const cell = ws.getCell(thRow, c);
        cell.border = { top: thickBorder, bottom: thickBorder, left: thinBorder, right: thinBorder };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }

      currRow++;

      // Top Intro Block (rendered inside D:L before individual packages)
      if (data.introText && data.introText.trim()) {
        const introR = currRow;
        ws.mergeCells(`D${introR}:L${introR}`);
        const introCell = ws.getCell(`D${introR}`);
        introCell.value = data.introText.trim();
        introCell.font = { name: 'Tahoma', size: 8.5, bold: true, color: { argb: 'FF1E293B' } };
        introCell.alignment = { vertical: 'middle', wrapText: true };
        const linesCount = data.introText.trim().split('\n').length;
        ws.getRow(introR).height = Math.max(26, linesCount * 14 + 8);
        for (let c = 1; c <= 12; c++) {
          ws.getCell(introR, c).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        }
        currRow++;
      }

      // Container Breakdown & Item rows with Merged Package Grouping
      let totalNetW = 0;
      let totalGrossW = 0;
      let totalCbmV = 0;
      let totalPkgCount = 0;

      const containersList = (data.containers && data.containers.length > 0)
        ? data.containers
        : [{ containerNo: '', sealNo: '', items: (data.plItems || data.items || []).map((it, idx) => ({ pkgNo: String(idx + 1), description: it.name, netWeight: it.netWeight, grossWeight: it.grossWeight, cbm: it.cbm, qty: it.qty })) }];

      containersList.forEach((cData, cIdx) => {
        const cItems = cData.items || [];
        interface PlPkgGroup {
          pkgNo: string;
          items: { name: string; qty: number; unit?: string; pkgCount?: number }[];
          netWeight: number;
          grossWeight: number;
          cbm: number;
          pkgCount: number;
        }

        const packageGroups: PlPkgGroup[] = [];
        let curGroup: PlPkgGroup | null = null;

        cItems.forEach((it: any, itIdx: number) => {
          const isSecondary = !!(it._sharedWithPrev || it._isMergedMember || (itIdx > 0 && it.pkgNo && curGroup && it.pkgNo === curGroup.pkgNo));
          const cleanName = cleanCiName(it.description || (it as any).name || '');
          const itQty = Number(it.qty) || 0;
          const itUnit = it.unit || 'PCS';
          const itNet = Number(it.netWeight) || 0;
          const itGross = Number(it.grossWeight) || 0;
          const itCbm = Number(it.cbm) || 0;
          const itPkg = Number(it.pkg) || 1;

          if (isSecondary && curGroup) {
            curGroup.items.push({ name: cleanName, qty: itQty, unit: itUnit, pkgCount: itPkg });
            if (itNet > 0 && curGroup.netWeight === 0) curGroup.netWeight += itNet;
            if (itGross > 0 && curGroup.grossWeight === 0) curGroup.grossWeight += itGross;
            if (itCbm > 0 && curGroup.cbm === 0) curGroup.cbm += itCbm;
          } else {
            const newGroup: PlPkgGroup = {
              pkgNo: it.pkgNo || String(packageGroups.length + 1),
              items: [{ name: cleanName, qty: itQty, unit: itUnit, pkgCount: itPkg }],
              netWeight: itNet,
              grossWeight: itGross,
              cbm: itCbm,
              pkgCount: itPkg
            };
            curGroup = newGroup;
            packageGroups.push(newGroup);
          }
        });

        const cStartRow = currRow;

        packageGroups.forEach((pkg) => {
          const r = currRow;
          const pkgNum = pkg.pkgNo;
          const netW = pkg.netWeight;
          const grossW = pkg.grossWeight;
          const cbm = pkg.cbm;

          totalNetW += netW;
          totalGrossW += grossW;
          totalCbmV += cbm;
          totalPkgCount += pkg.pkgCount;

          let descText = '';
          if (pkg.items.length === 1) {
            const weightSuffix = netW > 0 ? `-${netW.toLocaleString()}KG` : '';
            descText = `P#${pkgNum} ${pkg.items[0].name}${weightSuffix}`;
            ws.getRow(r).height = 20;
          } else {
            // Combined package with multiple items
            const lines: string[] = [];
            lines.push(`P#${pkgNum}${netW > 0 ? ` (${netW.toLocaleString()}KG)` : ''}`);
            pkg.items.forEach(it => {
              const qtyStr = it.qty > 0 ? ` (${it.qty.toLocaleString()} ${it.unit || 'PCS'})` : '';
              lines.push(`  • ${it.name}${qtyStr}`);
            });
            descText = lines.join('\n');
            ws.getRow(r).height = Math.max(22, lines.length * 15 + 6);
          }

          ws.mergeCells(`D${r}:H${r}`);
          ws.getCell(`D${r}`).value = descText;
          ws.getCell(`D${r}`).font = { name: 'Tahoma', size: 8.5 };
          ws.getCell(`D${r}`).alignment = { vertical: 'middle', wrapText: true };

          ws.getCell(`I${r}`).value = netW;
          ws.getCell(`I${r}`).font = { name: 'Tahoma', size: 8.5 };
          ws.getCell(`I${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`I${r}`).numFmt = '#,##0';

          ws.getCell(`J${r}`).value = grossW;
          ws.getCell(`J${r}`).font = { name: 'Tahoma', size: 8.5 };
          ws.getCell(`J${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`J${r}`).numFmt = '#,##0';

          ws.mergeCells(`K${r}:L${r}`);
          ws.getCell(`K${r}`).value = cbm;
          ws.getCell(`K${r}`).font = { name: 'Tahoma', size: 8.5 };
          ws.getCell(`K${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`K${r}`).numFmt = '#,##0.00';

          for (let c = 1; c <= 12; c++) {
            ws.getCell(r, c).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
          }

          // Column 13: Item PKG value in outside print area
          let pkgValueText = '';
          if (pkg.items.length === 1) {
            pkgValueText = String(pkg.items[0].pkgCount || pkg.pkgCount || 1);
          } else {
            const lines: string[] = ['']; // blank header line matching P#1 (xxxxKG)
            pkg.items.forEach(it => {
              lines.push(String(it.pkgCount || 1));
            });
            pkgValueText = lines.join('\n');
          }
          const pkgValCell = ws.getCell(r, 13);
          pkgValCell.value = pkgValueText;
          pkgValCell.font = { name: 'Tahoma', size: 8.5, bold: true, color: { argb: 'FF1E293B' } };
          pkgValCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          pkgValCell.border = { top: thinBorder, bottom: thinBorder, left: thickBorder, right: thickBorder };
          pkgValCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

          currRow++;
        });

        const cEndRow = currRow - 1;

        // Merge Container Left Side (Shipping Mark + Container No + Seal No)
        ws.mergeCells(`A${cStartRow}:C${cEndRow}`);
        const cLeftCell = ws.getCell(`A${cStartRow}`);

        let leftText = '';
        if (cIdx === 0) {
          leftText = `CONTAINER NO.:\n${cData.containerNo || ''}\n\nSEAL NO.:\n${cData.sealNo || ''}`;
        } else {
          leftText = `CONTAINER NO.:\n${cData.containerNo || ''}\n\nSEAL NO.:\n${cData.sealNo || ''}`;
        }

        cLeftCell.value = leftText.trim();
        cLeftCell.font = { name: 'Tahoma', size: 8.5, bold: true };
        cLeftCell.alignment = { horizontal: 'center', vertical: 'bottom', wrapText: true };

        if (cIdx === 0) {
          const plSmBase64 = generateShippingMarkPngBase64({
            shape: data.shippingMarkShape,
            company: data.shippingMarkCompany,
            port: data.shippingMarkPort || data.portOfDischarge,
            country: data.shippingMarkCountry || data.destinationCountry,
            palletNoText: data.shippingMarkPalletNo,
            origin: data.shippingMarkOrigin
          });
          if (plSmBase64) {
            try {
              const plSmImgId = workbook.addImage({ base64: plSmBase64, extension: 'png' });
              ws.addImage(plSmImgId, {
                tl: { col: 0, row: cStartRow - 1 } as any,
                ext: { width: 125, height: 150 },
                editAs: 'oneCell'
              });
            } catch (err) {
              console.warn('Failed to embed shipping mark image in PL sheet:', err);
            }
          }
        }
      });

      // Total Row for Packing List
      const totalRow = currRow;
      ws.getRow(totalRow).height = 24;

      ws.mergeCells(`A${totalRow}:C${totalRow}`);
      ws.getCell(`A${totalRow}`).value = 'TOTAL';
      ws.getCell(`A${totalRow}`).font = { name: 'Tahoma', size: 9.5, bold: true };
      ws.getCell(`A${totalRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`D${totalRow}:H${totalRow}`);
      ws.getCell(`D${totalRow}`).value = `${totalPkgCount || data.totalPackages || 1} GT`;
      ws.getCell(`D${totalRow}`).font = { name: 'Tahoma', size: 9, bold: true };
      ws.getCell(`D${totalRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getCell(`I${totalRow}`).value = `${totalNetW.toLocaleString()} KGS`;
      ws.getCell(`I${totalRow}`).font = { name: 'Tahoma', size: 9.5, bold: true };
      ws.getCell(`I${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };

      ws.getCell(`J${totalRow}`).value = `${totalGrossW.toLocaleString()} KGS`;
      ws.getCell(`J${totalRow}`).font = { name: 'Tahoma', size: 9.5, bold: true };
      ws.getCell(`J${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };

      ws.mergeCells(`K${totalRow}:L${totalRow}`);
      ws.getCell(`K${totalRow}`).value = `${totalCbmV.toFixed(2)} CBM`;
      ws.getCell(`K${totalRow}`).font = { name: 'Tahoma', size: 9.5, bold: true };
      ws.getCell(`K${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };

      for (let c = 1; c <= 12; c++) {
        ws.getCell(totalRow, c).border = { top: thinBorder, bottom: doubleBorder, left: thinBorder, right: thinBorder };
      }
      currRow++;

      // Dotted Line
      ws.mergeCells(`A${currRow}:L${currRow}`);
      ws.getCell(`A${currRow}`).value = '////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////';
      ws.getCell(`A${currRow}`).font = { name: 'Tahoma', size: 8, color: { argb: 'FF94A3B8' } };
      ws.getCell(`A${currRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currRow).height = 14;
      currRow++;

      if (data.containerInfo) {
        const cInfoFormatted = data.containerInfo.toUpperCase().startsWith('CONTAINER')
          ? data.containerInfo
          : `CONTAINER : ${data.containerInfo}`;
        ws.mergeCells(`A${currRow}:L${currRow}`);
        ws.getCell(`A${currRow}`).value = cInfoFormatted;
        ws.getCell(`A${currRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`A${currRow}`).font = { name: 'Tahoma', size: 9, bold: true };
        ws.getRow(currRow).height = 18;
        currRow++;
      }

      if (data.plRemarks && data.plRemarks.trim()) {
        const lines = data.plRemarks.trim().split('\n');
        lines.forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) {
            ws.getRow(currRow).height = 10;
            currRow++;
            return;
          }
          const isHeader = /^(REMARK|REMARKS|NOTE|NOTES|[A-Z]\))/i.test(trimmed);
          ws.mergeCells(`A${currRow}:L${currRow}`);
          ws.getCell(`A${currRow}`).value = line;
          ws.getCell(`A${currRow}`).font = { name: 'Tahoma', size: 8.5, bold: isHeader };
          ws.getCell(`A${currRow}`).alignment = { vertical: 'middle', wrapText: true };
          ws.getRow(currRow).height = isHeader ? 18 : 15;
          currRow++;
        });
      }

      currRow += 2;
      ws.mergeCells(`I${currRow}:L${currRow}`);
      ws.getCell(`I${currRow}`).value = 'Signed by';
      ws.getCell(`I${currRow}`).font = { name: 'Tahoma', size: 10, italic: true };
      ws.getCell(`I${currRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currRow).height = 18;
      currRow += 4; // Ample space for signature

      ws.mergeCells(`I${currRow}:L${currRow}`);
      ws.getCell(`I${currRow}`).value = companyName;
      ws.getCell(`I${currRow}`).font = { name: 'Tahoma', size: 11, bold: true };
      ws.getCell(`I${currRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(`I${currRow}`).border = { top: darkBorder };
      ws.getRow(currRow).height = 26;
    };

    await buildCiSheet();
    await buildPlSheet();

    const buffer = await workbook.xlsx.writeBuffer();
    const cleanPi = (data.piNumber || data.orderId || 'DOC').replace(/[^a-zA-Z0-9-_()]/g, '_');
    const fileName = `CI_PL_${cleanPi}.xlsx`;
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
  } catch (error) {
    console.error('Error generating CI/PL Excel file:', error);
    alert('Excel 파일 생성 중 오류가 발생했습니다.');
  }
};
