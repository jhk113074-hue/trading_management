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
  vesselName?: string;
  etd?: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  shippingMarks?: string;
  customShipperText?: string;
  items: PreviewItem[];
  ciItems?: PreviewItem[];
  plItems?: PreviewItem[];
  totalPackages?: number;
  totalNetWeight?: number;
  totalGrossWeight?: number;
  totalCbm?: number;
  introText?: string;
  containerInfo?: string;
  bottomFreeText?: string;
  vatTrn?: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  hsCodeSummary?: string;
  letterheadUrl?: string;
}

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
        .trim();
    };

    const isYS = (data.issuingCompany as string) === 'YS' || (data.issuingCompany as string) === '영성ACC';
    const companyName = isYS ? 'YS ACC' : 'YSACC CO., LTD.';
    const headerAddress = '111-201, 76, WOLMYEONG-RO, HEUNGDEOK-GU, CHEONGJU-SI, CHUNGCHEONGBUK-DO, 28569, REPUBLIC OF KOREA\nTEL: +82 70 4141 2927 / FAX: +82 303 3444 1130';

    const buildSheet = async (sheetName: string, isInvoice: boolean) => {
      const ws = workbook.addWorksheet(sheetName, {
        views: [{ showGridLines: true }]
      });

      ws.pageSetup.paperSize = 9; // A4
      ws.pageSetup.orientation = 'portrait';
      ws.pageSetup.fitToPage = true;
      ws.pageSetup.fitToWidth = 1;
      ws.pageSetup.fitToHeight = 0;
      ws.pageSetup.margins = {
        left: 0.35, right: 0.35,
        top: 0.4, bottom: 0.4,
        header: 0.0, footer: 0.0
      };

      // 12 Equal Base Columns (9.5 width each = 114 total A4 width)
      // Enables exact 2-column equal split (6 cols + 6 cols = 57 + 57)
      // and exact 3-column equal split (4 cols + 4 cols + 4 cols = 38 + 38 + 38)
      ws.columns = [
        { width: 9.5 }, // A (Shipping Mark 1/2)
        { width: 9.5 }, // B (Shipping Mark 2/2)
        { width: 9.5 }, // C (Desc 1/4)
        { width: 9.5 }, // D (Desc 2/4)
        { width: 9.5 }, // E (Desc 3/4)
        { width: 9.5 }, // F (Desc 4/4)
        { width: 9.5 }, // G (HS Code 1/2)
        { width: 9.5 }, // H (HS Code 2/2)
        { width: 9.5 }, // I (Quantity / Net Wt)
        { width: 9.5 }, // J (Unit)
        { width: 9.5 }, // K (Unit Price / Gross Wt)
        { width: 9.5 }, // L (Amount / CBM)
      ];

      let currRow = 1;

      // 1. Top Letterhead Image or Fallback Text
      let imageAdded = false;
      const logoUrl = data.letterheadUrl || (isYS ? '/ys_acc_letterhead.png' : '/ysacc_letterhead.png');
      if (logoUrl) {
        try {
          const res = await fetch(logoUrl);
          if (res.ok) {
            const ab = await res.arrayBuffer();
            const imgId = workbook.addImage({
              buffer: ab,
              extension: 'png',
            });
            ws.addImage(imgId, 'A1:L4');
            ws.getRow(1).height = 18;
            ws.getRow(2).height = 18;
            ws.getRow(3).height = 18;
            ws.getRow(4).height = 20;
            ws.mergeCells('A4:L4');
            ws.getCell('A4').border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
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
        hName.font = { name: 'Arial', size: 14, bold: true };
        hName.alignment = { horizontal: 'left', vertical: 'middle' };
        ws.getRow(1).height = 22;

        ws.mergeCells('A2:L2');
        const hAddr = ws.getCell('A2');
        hAddr.value = headerAddress;
        hAddr.font = { name: 'Arial', size: 8, color: { argb: 'FF334155' } };
        hAddr.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        ws.getRow(2).height = 24;

        ws.mergeCells('A3:L3');
        ws.getCell('A3').border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
        ws.getRow(3).height = 4;
        currRow = 5;
      }

      // 2. Document Title
      ws.mergeCells(`A${currRow}:L${currRow}`);
      const titleCell = ws.getCell(`A${currRow}`);
      titleCell.value = isInvoice ? 'Commercial Invoice' : 'Packing List';
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF000000' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currRow).height = 28;
      currRow += 2;

      // 3. 5x2 Header Grid
      // Row 1-3: Exactly 2 Equal Columns (A..F = 50%, G..L = 50%)
      // Row 4-5: Exactly 3 Equal Columns (A..D = 33.3%, E..H = 33.3%, I..L = 33.3%)

      // Row 1 (50% / 50%): Shipper (A:F) vs Inv No / LC No (G:L)
      const r1 = currRow;
      ws.mergeCells(`A${r1}:F${r1}`);
      const shipperVal = data.customShipperText || `${companyName}\n${headerAddress}`;
      ws.getCell(`A${r1}`).value = `Shipper / Beneficiary:\n${shipperVal}`;
      ws.getCell(`A${r1}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`A${r1}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`G${r1}:L${r1}`);
      ws.getCell(`G${r1}`).value = `Invoice No. & Date:\n${data.invoiceNo || data.piNumber || '-'}   /   ${data.invoiceDate}\n\nL/C No. & Date:\n${data.lcNo || 'N/A'}${data.lcDate ? `   &   ${data.lcDate}` : ''}`;
      ws.getCell(`G${r1}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`G${r1}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r1).height = 58;
      currRow++;

      // Row 2 (50% / 50%): Applicant (A:F) vs LC Bank (G:L)
      const r2 = currRow;
      ws.mergeCells(`A${r2}:F${r2}`);
      const appAddress = data.customerAddress ? `\n${data.customerAddress}` : '';
      ws.getCell(`A${r2}`).value = `Applicant:\n${data.customerName || '-'}${appAddress}`;
      ws.getCell(`A${r2}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`A${r2}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`G${r2}:L${r2}`);
      ws.getCell(`G${r2}`).value = `L/C Issuing Bank:\n${data.lcIssuingBank || 'N/A'}`;
      ws.getCell(`G${r2}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`G${r2}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r2).height = 48;
      currRow++;

      // Row 3 (50% / 50%): Notify Party (A:F) vs Remarks (G:L)
      const r3 = currRow;
      ws.mergeCells(`A${r3}:F${r3}`);
      ws.getCell(`A${r3}`).value = `Notify Party:\n${data.notifyParty || data.customerName || 'Same as Applicant'}`;
      ws.getCell(`A${r3}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`A${r3}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`G${r3}:L${r3}`);
      ws.getCell(`G${r3}`).value = `Remarks:\n${data.remarks ? `"${data.remarks}"` : '"FREIGHT PREPAID"'}`;
      ws.getCell(`G${r3}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`G${r3}`).alignment = { wrapText: true, vertical: 'top' };
      const remarkLines = (data.remarks || '').split('\n').length;
      ws.getRow(r3).height = Math.max(50, remarkLines * 13 + 18);
      currRow++;

      // Apply borders to Row 1-3 (2 equal columns A:F and G:L)
      for (let r = r1; r <= r3; r++) {
        for (let c = 1; c <= 12; c++) {
          ws.getCell(r, c).border = {
            top: thinBorder,
            bottom: thinBorder,
            left: (c === 1 || c === 7) ? darkBorder : undefined,
            right: (c === 6 || c === 12) ? darkBorder : undefined
          };
        }
      }

      // Row 4 (33.3% / 33.3% / 33.3%): Port of Loading (A:D) | Port of Discharge (E:H) | Payment Terms (I:L)
      const r4 = currRow;
      ws.mergeCells(`A${r4}:D${r4}`);
      ws.getCell(`A${r4}`).value = `Port of Loading:\n${data.portOfLoading || '-'}`;
      ws.getCell(`A${r4}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`A${r4}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`E${r4}:H${r4}`);
      ws.getCell(`E${r4}`).value = `Port of Discharge:\n${data.portOfDischarge || '-'}`;
      ws.getCell(`E${r4}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`E${r4}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`I${r4}:L${r4}`);
      ws.getCell(`I${r4}`).value = `Payment Terms:\n${data.paymentTerms || '-'}`;
      ws.getCell(`I${r4}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`I${r4}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r4).height = 34;
      currRow++;

      // Row 5 (33.3% / 33.3% / 33.3%): Vessel / Flight (A:D) | ETD (E:H) | Delivery Terms (I:L)
      const r5 = currRow;
      ws.mergeCells(`A${r5}:D${r5}`);
      ws.getCell(`A${r5}`).value = `Vessel / Flight:\n${data.vesselName || '-'}`;
      ws.getCell(`A${r5}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`A${r5}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`E${r5}:H${r5}`);
      ws.getCell(`E${r5}`).value = `ETD:\n${data.etd || '-'}`;
      ws.getCell(`E${r5}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`E${r5}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`I${r5}:L${r5}`);
      ws.getCell(`I${r5}`).value = `Delivery Terms:\n${data.deliveryTerms || '-'}`;
      ws.getCell(`I${r5}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`I${r5}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r5).height = 34;
      currRow++;

      // Apply borders to Row 4-5 (3 equal columns A:D, E:H, I:L)
      for (let r = r4; r <= r5; r++) {
        for (let c = 1; c <= 12; c++) {
          ws.getCell(r, c).border = {
            top: thinBorder,
            bottom: thinBorder,
            left: (c === 1 || c === 5 || c === 9) ? darkBorder : undefined,
            right: (c === 4 || c === 8 || c === 12) ? darkBorder : undefined
          };
        }
      }

      currRow++; // Spacer row

      // 4. Item Table Header (12 Columns)
      const thRow = currRow;
      ws.getRow(thRow).height = 24;

      const setTh = (range: string, val: string) => {
        ws.mergeCells(range);
        const cell = ws.getCell(range.split(':')[0]);
        cell.value = val;
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      };

      if (isInvoice) {
        setTh(`A${thRow}:B${thRow}`, 'Shipping Mark');
        setTh(`C${thRow}:F${thRow}`, 'Description of Goods');
        setTh(`G${thRow}:H${thRow}`, 'HS Code');
        ws.getCell(`I${thRow}`).value = 'Quantity';
        ws.getCell(`I${thRow}`).font = { name: 'Arial', size: 9, bold: true };
        ws.getCell(`I${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getCell(`J${thRow}`).value = 'Unit';
        ws.getCell(`J${thRow}`).font = { name: 'Arial', size: 9, bold: true };
        ws.getCell(`J${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getCell(`K${thRow}`).value = 'Unit Price ($)';
        ws.getCell(`K${thRow}`).font = { name: 'Arial', size: 9, bold: true };
        ws.getCell(`K${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getCell(`L${thRow}`).value = 'Amount ($)';
        ws.getCell(`L${thRow}`).font = { name: 'Arial', size: 9, bold: true };
        ws.getCell(`L${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        setTh(`A${thRow}:B${thRow}`, 'Shipping Mark');
        setTh(`C${thRow}:F${thRow}`, 'Description of Goods');
        setTh(`G${thRow}:H${thRow}`, 'Packaging');
        ws.getCell(`I${thRow}`).value = 'Net Wt (Kg)';
        ws.getCell(`I${thRow}`).font = { name: 'Arial', size: 9, bold: true };
        ws.getCell(`I${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getCell(`J${thRow}`).value = 'Unit';
        ws.getCell(`J${thRow}`).font = { name: 'Arial', size: 9, bold: true };
        ws.getCell(`J${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getCell(`K${thRow}`).value = 'Gross Wt (Kg)';
        ws.getCell(`K${thRow}`).font = { name: 'Arial', size: 9, bold: true };
        ws.getCell(`K${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getCell(`L${thRow}`).value = 'CBM (M3)';
        ws.getCell(`L${thRow}`).font = { name: 'Arial', size: 9, bold: true };
        ws.getCell(`L${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      }

      for (let c = 1; c <= 12; c++) {
        const cell = ws.getCell(thRow, c);
        cell.border = { top: thickBorder, bottom: thickBorder, left: thinBorder, right: thinBorder };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }

      currRow++;
      const itemStartRow = currRow;

      // Top Intro Text (rendered between Table Header and Item 1 across C:L)
      if (data.introText && data.introText.trim()) {
        const introR = currRow;
        ws.mergeCells(`C${introR}:L${introR}`);
        const introCell = ws.getCell(`C${introR}`);
        introCell.value = data.introText.trim();
        introCell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF1E293B' } };
        introCell.alignment = { vertical: 'middle', wrapText: true };
        const linesCount = data.introText.trim().split('\n').length;
        ws.getRow(introR).height = Math.max(22, linesCount * 14 + 6);
        for (let c = 1; c <= 12; c++) {
          ws.getCell(introR, c).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        }
        currRow++;
      }

      const itemsList = isInvoice
        ? (data.ciItems && data.ciItems.length > 0 ? data.ciItems : data.items)
        : (data.plItems && data.plItems.length > 0 ? data.plItems : data.items);

      let totalQty = 0;
      let totalAmt = 0;
      let totalNetW = 0;
      let totalGrossW = 0;
      let totalCbmV = 0;

      itemsList.forEach(it => {
        const r = currRow;
        const cleanName = cleanCiName(it.name || '');
        const descLines = cleanName.split('\n').length;
        ws.getRow(r).height = Math.max(22, descLines * 14 + 4);

        if (isInvoice) {
          const qty = Number(it.qty) || 0;
          const uPrice = Number(it.unitPrice) || 0;
          const amt = it.isFreight ? (Number(it.amount) || 0) : (Number(it.amount) || qty * uPrice);

          totalQty += it.isFreight ? 0 : qty;
          totalAmt += amt;

          ws.mergeCells(`C${r}:F${r}`);
          ws.getCell(`C${r}`).value = cleanName;
          ws.getCell(`C${r}`).font = { name: 'Arial', size: 9, bold: it.isFreight };
          ws.getCell(`C${r}`).alignment = { vertical: 'middle', wrapText: true };

          ws.mergeCells(`G${r}:H${r}`);
          ws.getCell(`G${r}`).value = it.isFreight ? '' : (it.hsCode || '');
          ws.getCell(`G${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`G${r}`).alignment = { horizontal: 'center', vertical: 'middle' };

          ws.getCell(`I${r}`).value = it.isFreight ? '' : qty;
          ws.getCell(`I${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`I${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          if (!it.isFreight) ws.getCell(`I${r}`).numFmt = '#,##0';

          ws.getCell(`J${r}`).value = it.isFreight ? '' : (it.unit || 'PCS');
          ws.getCell(`J${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`J${r}`).alignment = { horizontal: 'center', vertical: 'middle' };

          ws.getCell(`K${r}`).value = it.isFreight ? '' : uPrice;
          ws.getCell(`K${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`K${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          if (!it.isFreight) ws.getCell(`K${r}`).numFmt = 'US$#,##0.00';

          ws.getCell(`L${r}`).value = amt;
          ws.getCell(`L${r}`).font = { name: 'Arial', size: 9, bold: true };
          ws.getCell(`L${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`L${r}`).numFmt = 'US$#,##0.00';
        } else {
          // Packing List
          const qty = Number(it.qty) || 0;
          const pkgCount = it.packagesCount || 1;
          const pkgType = it.packageType || 'PALLET';
          const nWeight = it.netWeight || 0;
          const gWeight = it.grossWeight || 0;
          const cbm = it.cbm || 0;

          totalQty += qty;
          totalNetW += nWeight;
          totalGrossW += gWeight;
          totalCbmV += cbm;

          ws.mergeCells(`C${r}:F${r}`);
          ws.getCell(`C${r}`).value = cleanName;
          ws.getCell(`C${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`C${r}`).alignment = { vertical: 'middle', wrapText: true };

          ws.mergeCells(`G${r}:H${r}`);
          ws.getCell(`G${r}`).value = `${pkgCount} ${pkgType}`;
          ws.getCell(`G${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`G${r}`).alignment = { horizontal: 'center', vertical: 'middle' };

          ws.getCell(`I${r}`).value = nWeight;
          ws.getCell(`I${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`I${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`I${r}`).numFmt = '#,##0.00';

          ws.getCell(`J${r}`).value = 'KG';
          ws.getCell(`J${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`J${r}`).alignment = { horizontal: 'center', vertical: 'middle' };

          ws.getCell(`K${r}`).value = gWeight;
          ws.getCell(`K${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`K${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`K${r}`).numFmt = '#,##0.00';

          ws.getCell(`L${r}`).value = cbm;
          ws.getCell(`L${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`L${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`L${r}`).numFmt = '#,##0.000';
        }

        // Apply borders for row across 12 cols
        for (let c = 1; c <= 12; c++) {
          ws.getCell(r, c).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        }

        currRow++;
      });

      // Merge Shipping Mark across item rows (Cols A..B)
      if (itemsList.length > 0) {
        const itemEndRow = currRow - 1;
        ws.mergeCells(`A${itemStartRow}:B${itemEndRow}`);
        const markCell = ws.getCell(`A${itemStartRow}`);
        markCell.value = data.shippingMarks || 'N/M';
        markCell.font = { name: 'Arial', size: 8.5 };
        markCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }

      // 5. TOTAL AMOUNT ROW
      const totalRow = currRow;
      ws.getRow(totalRow).height = 24;

      ws.mergeCells(`A${totalRow}:H${totalRow}`);
      const totTitleCell = ws.getCell(`A${totalRow}`);
      totTitleCell.value = 'TOTAL AMOUNT';
      totTitleCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } };
      totTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      if (isInvoice) {
        ws.getCell(`I${totalRow}`).value = totalQty;
        ws.getCell(`I${totalRow}`).font = { name: 'Arial', size: 9.5, bold: true };
        ws.getCell(`I${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`I${totalRow}`).numFmt = '#,##0';

        ws.getCell(`J${totalRow}`).value = '';
        ws.getCell(`K${totalRow}`).value = '';

        ws.getCell(`L${totalRow}`).value = totalAmt;
        ws.getCell(`L${totalRow}`).font = { name: 'Arial', size: 10, bold: true };
        ws.getCell(`L${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`L${totalRow}`).numFmt = 'US$#,##0.00';
      } else {
        ws.getCell(`I${totalRow}`).value = totalNetW;
        ws.getCell(`I${totalRow}`).font = { name: 'Arial', size: 9.5, bold: true };
        ws.getCell(`I${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`I${totalRow}`).numFmt = '#,##0.00';

        ws.getCell(`J${totalRow}`).value = 'KG';
        ws.getCell(`J${totalRow}`).font = { name: 'Arial', size: 9, bold: true };
        ws.getCell(`J${totalRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getCell(`K${totalRow}`).value = totalGrossW;
        ws.getCell(`K${totalRow}`).font = { name: 'Arial', size: 9.5, bold: true };
        ws.getCell(`K${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`K${totalRow}`).numFmt = '#,##0.00';

        ws.getCell(`L${totalRow}`).value = totalCbmV;
        ws.getCell(`L${totalRow}`).font = { name: 'Arial', size: 9.5, bold: true };
        ws.getCell(`L${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`L${totalRow}`).numFmt = '#,##0.000';
      }

      for (let c = 1; c <= 12; c++) {
        ws.getCell(totalRow, c).border = { top: thinBorder, bottom: doubleBorder, left: thinBorder, right: thinBorder };
      }

      currRow++;

      // 6. Dotted separator line
      ws.mergeCells(`A${currRow}:L${currRow}`);
      ws.getCell(`A${currRow}`).value = '--------------------------------------------------------------------------------------------------------------------------------';
      ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8, color: { argb: 'FF94A3B8' } };
      ws.getCell(`A${currRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currRow).height = 14;
      currRow++;

      // 7. Container Info
      if (data.containerInfo) {
        const cInfoFormatted = data.containerInfo.toUpperCase().startsWith('CONTAINER')
          ? data.containerInfo
          : `CONTAINER : ${data.containerInfo}`;
        ws.mergeCells(`A${currRow}:L${currRow}`);
        ws.getCell(`A${currRow}`).value = cInfoFormatted;
        ws.getCell(`A${currRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 9, bold: true };
        ws.getRow(currRow).height = 18;
        currRow++;
      }

      // 8. Section A (Only if filled)
      if (data.hsCodeSummary && data.hsCodeSummary.trim()) {
        ws.mergeCells(`A${currRow}:L${currRow}`);
        ws.getCell(`A${currRow}`).value = 'A) RELEVANT HARMONIZED SYSTEM COMMODITY CODE NUMBER(S) APPLICABLE TO EACH ITEM SHIPPED UNDER THIS CREDIT';
        ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5, bold: true };
        ws.getRow(currRow).height = 18;
        currRow++;

        const hsLines = data.hsCodeSummary.trim().split('\n').length;
        ws.mergeCells(`A${currRow}:L${currRow}`);
        ws.getCell(`A${currRow}`).value = data.hsCodeSummary.trim();
        ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5 };
        ws.getCell(`A${currRow}`).alignment = { wrapText: true, vertical: 'top' };
        ws.getRow(currRow).height = Math.max(22, hsLines * 14 + 6);
        currRow++;
      }

      // 9. Free-form Bottom Clauses (B, C, D, etc.)
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
          ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5, bold: isHeader };
          ws.getCell(`A${currRow}`).alignment = { vertical: 'middle', wrapText: true };
          ws.getRow(currRow).height = isHeader ? 18 : 15;
          currRow++;
        });
      } else {
        if (data.vatTrn && data.vatTrn.trim()) {
          ws.mergeCells(`A${currRow}:L${currRow}`);
          const bVal = data.vatTrn.trim();
          const bText = bVal.toUpperCase().startsWith('B)') ? bVal : `B) TRN Number: ${bVal}`;
          ws.getCell(`A${currRow}`).value = bText;
          ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5, bold: true };
          ws.getRow(currRow).height = 18;
          currRow++;
        }

        if (data.manufacturerName || data.manufacturerAddress) {
          ws.mergeCells(`A${currRow}:L${currRow}`);
          ws.getCell(`A${currRow}`).value = 'C) MANUFACTURER/PRODUCER';
          ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5, bold: true };
          ws.getRow(currRow).height = 18;
          currRow++;

          const mfgLines = [];
          if (data.manufacturerName) mfgLines.push(`1. NAME : ${data.manufacturerName}`);
          if (data.manufacturerAddress) mfgLines.push(`2. ADDRESS : ${data.manufacturerAddress}`);

          ws.mergeCells(`A${currRow}:L${currRow}`);
          ws.getCell(`A${currRow}`).value = mfgLines.join('\n');
          ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5 };
          ws.getCell(`A${currRow}`).alignment = { wrapText: true };
          ws.getRow(currRow).height = 26;
          currRow++;
        }
      }

      // 10. Sign-off / Signature
      currRow += 2;
      ws.mergeCells(`I${currRow}:L${currRow}`);
      ws.getCell(`I${currRow}`).value = 'Signed by';
      ws.getCell(`I${currRow}`).font = { name: 'Arial', size: 8.5, italic: true };
      ws.getCell(`I${currRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currRow).height = 16;
      currRow += 3;

      ws.mergeCells(`I${currRow}:L${currRow}`);
      ws.getCell(`I${currRow}`).value = companyName;
      ws.getCell(`I${currRow}`).font = { name: 'Arial', size: 10, bold: true };
      ws.getCell(`I${currRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(`I${currRow}`).border = { top: darkBorder };
      ws.getRow(currRow).height = 22;
    };

    await buildSheet('Commercial Invoice', true);
    await buildSheet('Packing List', false);

    const buffer = await workbook.xlsx.writeBuffer();
    const cleanPi = (data.piNumber || data.orderId || 'DOC').replace(/[^a-zA-Z0-9-_()]/g, '_');
    const fileName = `CI_PL_${cleanPi}.xlsx`;
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
  } catch (error) {
    console.error('Error generating CI/PL Excel file:', error);
    alert('Excel 파일 생성 중 오류가 발생했습니다.');
  }
};
