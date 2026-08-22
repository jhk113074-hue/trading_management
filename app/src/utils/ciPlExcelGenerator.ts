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
        { width: 10.0 }, // C (Desc 1/4)
        { width: 10.0 }, // D (Desc 2/4)
        { width: 9.0 },  // E (Desc 3/4)          -> E+F = 18.0, C..F = 38.0
        { width: 9.0 },  // F (Desc 4/4)          -> A..F = 54.0 (Left 50%)
        { width: 9.0 },  // G (HS Code 1/2)       -> G+H = 18.0
        { width: 9.0 },  // H (HS Code 2/2)       -> E..H = 36.0 (Box 2)
        { width: 9.5 },  // I (Quantity)
        { width: 5.5 },  // J (Unit)
        { width: 10.5 }, // K (Unit Price)
        { width: 10.5 }, // L (Amount)            -> I..L = 36.0 (Box 3), G..L = 54.0 (Right 50%)
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
      } else {
        // Without letterhead, start cleanly at row 2
        currRow = 2;
      }

      // Document Title
      ws.mergeCells(`A${currRow}:L${currRow}`);
      const titleCell = ws.getCell(`A${currRow}`);
      titleCell.value = 'Commercial Invoice';
      titleCell.font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FF000000' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currRow).height = 26;
      currRow += 2;

      // 5x2 Header Grid
      const r1 = currRow;
      ws.mergeCells(`A${r1}:F${r1}`);
      const shipperVal = data.customShipperText || `${companyName}\n${headerAddress}`;
      ws.getCell(`A${r1}`).value = {
        richText: [
          { text: 'Shipper / Beneficiary:\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: shipperVal, font: { name: 'Arial', size: 8.5 } }
        ]
      };
      ws.getCell(`A${r1}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`G${r1}:L${r1}`);
      ws.getCell(`G${r1}`).value = {
        richText: [
          { text: 'Invoice No. & Date:\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: `${data.invoiceNo || data.piNumber || '-'}   /   ${data.invoiceDate}\n\n`, font: { name: 'Arial', size: 9, bold: true } },
          { text: 'L/C No. & Date:\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: `${data.lcNo || 'N/A'}${data.lcDate ? `   &   ${data.lcDate}` : ''}`, font: { name: 'Arial', size: 8.5 } }
        ]
      };
      ws.getCell(`G${r1}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r1).height = 64;
      currRow++;

      const r2 = currRow;
      ws.mergeCells(`A${r2}:F${r2}`);
      ws.getCell(`A${r2}`).value = {
        richText: [
          { text: 'Applicant:\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: (data.customerName || '-') + '\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: data.customerAddress || '', font: { name: 'Arial', size: 8.5 } }
        ]
      };
      ws.getCell(`A${r2}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`G${r2}:L${r2}`);
      ws.getCell(`G${r2}`).value = {
        richText: [
          { text: 'L/C Issuing Bank:\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: data.lcIssuingBank || 'N/A', font: { name: 'Arial', size: 9, bold: true } }
        ]
      };
      ws.getCell(`G${r2}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r2).height = 52;
      currRow++;

      const r3 = currRow;
      ws.mergeCells(`A${r3}:F${r3}`);
      ws.getCell(`A${r3}`).value = {
        richText: [
          { text: 'Notify Party:\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: data.notifyParty || data.customerName || 'Same as Applicant', font: { name: 'Arial', size: 8.5, bold: true } }
        ]
      };
      ws.getCell(`A${r3}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`G${r3}:L${r3}`);
      ws.getCell(`G${r3}`).value = {
        richText: [
          { text: 'Remarks:\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: data.remarks ? `"${data.remarks}"` : '"FREIGHT PREPAID"', font: { name: 'Arial', size: 8.5 } }
        ]
      };
      ws.getCell(`G${r3}`).alignment = { wrapText: true, vertical: 'top' };
      const remarkLines = (data.remarks || '').split('\n').length;
      ws.getRow(r3).height = Math.max(54, remarkLines * 14 + 18);
      currRow++;

      for (let r = r1; r <= r3; r++) {
        for (let c = 1; c <= 12; c++) {
          ws.getCell(r, c).border = {
            top: thinBorder, bottom: thinBorder,
            left: (c === 1 || c === 7) ? darkBorder : undefined,
            right: (c === 6 || c === 12) ? darkBorder : undefined
          };
        }
      }

      const r4 = currRow;
      ws.mergeCells(`A${r4}:D${r4}`);
      ws.getCell(`A${r4}`).value = {
        richText: [
          { text: 'Port of Loading:\n', font: { name: 'Arial', size: 8.5, bold: true } },
          { text: data.portOfLoading || '-', font: { name: 'Arial', size: 9, bold: true } }
        ]
      };
      ws.getCell(`A${r4}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`E${r4}:H${r4}`);
      ws.getCell(`E${r4}`).value = {
        richText: [
          { text: 'Port of Discharge:\n', font: { name: 'Arial', size: 8.5, bold: true } },
          { text: data.portOfDischarge || '-', font: { name: 'Arial', size: 9, bold: true } }
        ]
      };
      ws.getCell(`E${r4}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`I${r4}:L${r4}`);
      ws.getCell(`I${r4}`).value = {
        richText: [
          { text: 'Payment Terms:\n', font: { name: 'Arial', size: 8.5, bold: true } },
          { text: data.paymentTerms || '-', font: { name: 'Arial', size: 8.5, bold: true } }
        ]
      };
      ws.getCell(`I${r4}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r4).height = 38;
      currRow++;

      const r5 = currRow;
      ws.mergeCells(`A${r5}:D${r5}`);
      ws.getCell(`A${r5}`).value = {
        richText: [
          { text: 'Vessel / Flight:\n', font: { name: 'Arial', size: 8.5, bold: true } },
          { text: data.vesselName || '-', font: { name: 'Arial', size: 9, bold: true } }
        ]
      };
      ws.getCell(`A${r5}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`E${r5}:H${r5}`);
      ws.getCell(`E${r5}`).value = {
        richText: [
          { text: 'ETD:\n', font: { name: 'Arial', size: 8.5, bold: true } },
          { text: data.etd || '-', font: { name: 'Arial', size: 9, bold: true } }
        ]
      };
      ws.getCell(`E${r5}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`I${r5}:L${r5}`);
      ws.getCell(`I${r5}`).value = {
        richText: [
          { text: 'Delivery Terms:\n', font: { name: 'Arial', size: 8.5, bold: true } },
          { text: data.deliveryTerms || '-', font: { name: 'Arial', size: 9, bold: true } }
        ]
      };
      ws.getCell(`I${r5}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r5).height = 34;
      currRow++;

      for (let r = r4; r <= r5; r++) {
        for (let c = 1; c <= 12; c++) {
          ws.getCell(r, c).border = {
            top: thinBorder, bottom: thinBorder,
            left: (c === 1 || c === 5 || c === 9) ? darkBorder : undefined,
            right: (c === 4 || c === 8 || c === 12) ? darkBorder : undefined
          };
        }
      }

      currRow++;

      // Table Headers
      const thRow = currRow;
      ws.getRow(thRow).height = 24;

      const setTh = (range: string, val: string) => {
        ws.mergeCells(range);
        const cell = ws.getCell(range.split(':')[0]);
        cell.value = val;
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      };

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
        introCell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF1E293B' } };
        introCell.alignment = { vertical: 'middle', wrapText: true };
        const linesCount = data.introText.trim().split('\n').length;
        ws.getRow(introR).height = Math.max(22, linesCount * 14 + 6);
        for (let c = 1; c <= 12; c++) {
          ws.getCell(introR, c).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        }
        currRow++;
      }

      const itemsList = data.ciItems && data.ciItems.length > 0 ? data.ciItems : data.items;
      let totalQty = 0;
      let totalAmt = 0;

      itemsList.forEach(it => {
        const r = currRow;
        const cleanName = cleanCiName(it.name || '');
        const descLines = cleanName.split('\n').length;
        ws.getRow(r).height = Math.max(22, descLines * 14 + 4);

        const qty = Number(it.qty) || 0;
        const uPrice = Number(it.unitPrice) || 0;
        const amt = it.isFreight ? (Number(it.amount) || 0) : (Number(it.amount) || qty * uPrice);

        totalQty += it.isFreight ? 0 : qty;
        totalAmt += amt;

        ws.mergeCells(`C${r}:F${r}`);
        ws.getCell(`C${r}`).value = cleanName;
        ws.getCell(`C${r}`).font = { name: 'Arial', size: 9, bold: true };
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
        ws.getCell(`L${r}`).font = { name: 'Arial', size: 9.5, bold: true };
        ws.getCell(`L${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`L${r}`).numFmt = 'US$#,##0.00';

        for (let c = 1; c <= 12; c++) {
          ws.getCell(r, c).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        }
        currRow++;
      });

      if (itemsList.length > 0) {
        const itemEndRow = currRow - 1;
        ws.mergeCells(`A${itemStartRow}:B${itemEndRow}`);
        const markCell = ws.getCell(`A${itemStartRow}`);
        markCell.value = data.shippingMarks || 'N/M';
        markCell.font = { name: 'Arial', size: 8.5, bold: true };
        markCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }

      // Total Amount
      const totalRow = currRow;
      ws.getRow(totalRow).height = 24;
      ws.mergeCells(`A${totalRow}:H${totalRow}`);
      const totTitleCell = ws.getCell(`A${totalRow}`);
      totTitleCell.value = 'TOTAL AMOUNT';
      totTitleCell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF000000' } };
      totTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

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

      for (let c = 1; c <= 12; c++) {
        ws.getCell(totalRow, c).border = { top: thinBorder, bottom: doubleBorder, left: thinBorder, right: thinBorder };
      }
      currRow++;

      // Separator Line
      ws.mergeCells(`A${currRow}:L${currRow}`);
      ws.getCell(`A${currRow}`).value = '--------------------------------------------------------------------------------------------------------------------------------';
      ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8, color: { argb: 'FF94A3B8' } };
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
        ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 9, bold: true };
        ws.getRow(currRow).height = 18;
        currRow++;
      }

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
      }

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
      } else {
        // Without letterhead, start cleanly at row 2
        currRow = 2;
      }

      // Document Title
      ws.mergeCells(`A${currRow}:L${currRow}`);
      const titleCell = ws.getCell(`A${currRow}`);
      titleCell.value = 'Packing List';
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF000000' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currRow).height = 26;
      currRow += 2;

      // 5x2 Header Grid for PL (Titles & Company Name Bold, Values Regular)
      const r1 = currRow;
      ws.mergeCells(`A${r1}:F${r1}`);
      const shipperLines = (data.customShipperText || `${companyName}\n${headerAddress}`).split('\n');
      const shipperCompany = shipperLines[0] || companyName;
      const shipperRest = shipperLines.slice(1).join('\n');
      ws.getCell(`A${r1}`).value = {
        richText: [
          { text: 'Shipper/Exporter\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: shipperCompany + (shipperRest ? '\n' : ''), font: { name: 'Arial', size: 9, bold: true } },
          { text: shipperRest, font: { name: 'Arial', size: 8.5 } }
        ]
      };
      ws.getCell(`A${r1}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`G${r1}:L${r1}`);
      ws.getCell(`G${r1}`).value = {
        richText: [
          { text: 'Packing List No. & Date\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: `${data.invoiceNo || data.piNumber || '-'}   /   ${data.invoiceDate}\n\n`, font: { name: 'Arial', size: 9 } },
          { text: 'L/C No. & Date\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: `${data.lcNo || 'N/A'}${data.lcDate ? `   &   ${data.lcDate}` : ''}`, font: { name: 'Arial', size: 8.5 } }
        ]
      };
      ws.getCell(`G${r1}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r1).height = 64;
      currRow++;

      const r2 = currRow;
      ws.mergeCells(`A${r2}:F${r2}`);
      ws.getCell(`A${r2}`).value = {
        richText: [
          { text: 'Applicant/Consignee\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: (data.customerName || '-') + (data.customerAddress ? '\n' : ''), font: { name: 'Arial', size: 9, bold: true } },
          { text: data.customerAddress || '', font: { name: 'Arial', size: 8.5 } }
        ]
      };
      ws.getCell(`A${r2}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`G${r2}:L${r2}`);
      ws.getCell(`G${r2}`).value = {
        richText: [
          { text: 'L/C Issuing Bank\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: data.lcIssuingBank || 'N/A', font: { name: 'Arial', size: 8.5 } }
        ]
      };
      ws.getCell(`G${r2}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r2).height = 52;
      currRow++;

      const r3 = currRow;
      ws.mergeCells(`A${r3}:F${r3}`);
      ws.getCell(`A${r3}`).value = {
        richText: [
          { text: 'Notify Party\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: (data.notifyParty || data.customerName || 'Same as Applicant') + (data.notifyParty ? '' : (data.customerAddress ? '\n' : '')), font: { name: 'Arial', size: 8.5, bold: true } },
          { text: data.notifyParty ? '' : (data.customerAddress || ''), font: { name: 'Arial', size: 8.5 } }
        ]
      };
      ws.getCell(`A${r3}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`G${r3}:L${r3}`);
      ws.getCell(`G${r3}`).value = {
        richText: [
          { text: 'Remarks\n', font: { name: 'Arial', size: 9, bold: true } },
          { text: data.remarks ? `"${data.remarks}"` : '"FREIGHT PREPAID"', font: { name: 'Arial', size: 8.5 } }
        ]
      };
      ws.getCell(`G${r3}`).alignment = { wrapText: true, vertical: 'top' };
      const remarkLines = (data.remarks || '').split('\n').length;
      ws.getRow(r3).height = Math.max(54, remarkLines * 14 + 18);
      currRow++;

      for (let r = r1; r <= r3; r++) {
        for (let c = 1; c <= 12; c++) {
          ws.getCell(r, c).border = {
            top: thinBorder, bottom: thinBorder,
            left: (c === 1 || c === 7) ? darkBorder : undefined,
            right: (c === 6 || c === 12) ? darkBorder : undefined
          };
        }
      }

      const r4 = currRow;
      ws.mergeCells(`A${r4}:D${r4}`);
      ws.getCell(`A${r4}`).value = {
        richText: [
          { text: 'Port of Loading\n', font: { name: 'Arial', size: 8.5, bold: true } },
          { text: data.portOfLoading || '-', font: { name: 'Arial', size: 9 } }
        ]
      };
      ws.getCell(`A${r4}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`E${r4}:H${r4}`);
      ws.getCell(`E${r4}`).value = {
        richText: [
          { text: 'Port of Discharge\n', font: { name: 'Arial', size: 8.5, bold: true } },
          { text: data.portOfDischarge || '-', font: { name: 'Arial', size: 9 } }
        ]
      };
      ws.getCell(`E${r4}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`I${r4}:L${r4}`);
      ws.getCell(`I${r4}`).value = {
        richText: [
          { text: 'Payment Terms\n', font: { name: 'Arial', size: 8.5, bold: true } },
          { text: data.paymentTerms || '-', font: { name: 'Arial', size: 8.5 } }
        ]
      };
      ws.getCell(`I${r4}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r4).height = 38;
      currRow++;

      const r5 = currRow;
      ws.mergeCells(`A${r5}:D${r5}`);
      ws.getCell(`A${r5}`).value = {
        richText: [
          { text: 'Vessel Name & Voyage No.\n', font: { name: 'Arial', size: 8.5, bold: true } },
          { text: data.vesselName || '-', font: { name: 'Arial', size: 9 } }
        ]
      };
      ws.getCell(`A${r5}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`E${r5}:H${r5}`);
      ws.getCell(`E${r5}`).value = {
        richText: [
          { text: 'Sailing on or about\n', font: { name: 'Arial', size: 8.5, bold: true } },
          { text: data.etd || '-', font: { name: 'Arial', size: 9 } }
        ]
      };
      ws.getCell(`E${r5}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`I${r5}:L${r5}`);
      ws.getCell(`I${r5}`).value = {
        richText: [
          { text: 'Delivery Terms\n', font: { name: 'Arial', size: 8.5, bold: true } },
          { text: data.deliveryTerms || '-', font: { name: 'Arial', size: 9 } }
        ]
      };
      ws.getCell(`I${r5}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(r5).height = 34;
      currRow++;

      for (let r = r4; r <= r5; r++) {
        for (let c = 1; c <= 12; c++) {
          ws.getCell(r, c).border = {
            top: thinBorder, bottom: thinBorder,
            left: (c === 1 || c === 5 || c === 9) ? darkBorder : undefined,
            right: (c === 4 || c === 8 || c === 12) ? darkBorder : undefined
          };
        }
      }

      currRow++;

      // Table Header for Packing List
      const thRow = currRow;
      ws.getRow(thRow).height = 28;

      ws.mergeCells(`A${thRow}:C${thRow}`);
      ws.getCell(`A${thRow}`).value = 'Shipping Marks';
      ws.getCell(`A${thRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      ws.getCell(`A${thRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`D${thRow}:H${thRow}`);
      ws.getCell(`D${thRow}`).value = 'Description of Goods\nQuantity / Number of Packages';
      ws.getCell(`D${thRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      ws.getCell(`D${thRow}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      ws.getCell(`I${thRow}`).value = 'Net Weight\n(KGS)';
      ws.getCell(`I${thRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      ws.getCell(`I${thRow}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      ws.getCell(`J${thRow}`).value = 'Gross Weight\n(KGS)';
      ws.getCell(`J${thRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
      ws.getCell(`J${thRow}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

      ws.mergeCells(`K${thRow}:L${thRow}`);
      ws.getCell(`K${thRow}`).value = 'Measurement\n(CBM)';
      ws.getCell(`K${thRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
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
        introCell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF1E293B' } };
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
        if (cItems.length === 0) return;

        // Group cItems by package (identifying merged/shared packages)
        interface PlPkgGroup {
          pkgNo: string;
          items: { name: string; qty: number; unit?: string }[];
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

          if (isSecondary && curGroup) {
            curGroup.items.push({ name: cleanName, qty: itQty, unit: itUnit });
            if (itNet > 0 && curGroup.netWeight === 0) curGroup.netWeight += itNet;
            if (itGross > 0 && curGroup.grossWeight === 0) curGroup.grossWeight += itGross;
            if (itCbm > 0 && curGroup.cbm === 0) curGroup.cbm += itCbm;
          } else {
            curGroup = {
              pkgNo: it.pkgNo || String(packageGroups.length + 1),
              items: [{ name: cleanName, qty: itQty, unit: itUnit }],
              netWeight: itNet,
              grossWeight: itGross,
              cbm: itCbm,
              pkgCount: Number(it.pkg) || 1
            };
            packageGroups.push(curGroup);
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
          ws.getCell(`D${r}`).font = { name: 'Arial', size: 8.5, bold: true };
          ws.getCell(`D${r}`).alignment = { vertical: 'middle', wrapText: true };

          ws.getCell(`I${r}`).value = netW;
          ws.getCell(`I${r}`).font = { name: 'Arial', size: 8.5 };
          ws.getCell(`I${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`I${r}`).numFmt = '#,##0';

          ws.getCell(`J${r}`).value = grossW;
          ws.getCell(`J${r}`).font = { name: 'Arial', size: 8.5 };
          ws.getCell(`J${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`J${r}`).numFmt = '#,##0';

          ws.mergeCells(`K${r}:L${r}`);
          ws.getCell(`K${r}`).value = cbm;
          ws.getCell(`K${r}`).font = { name: 'Arial', size: 8.5 };
          ws.getCell(`K${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`K${r}`).numFmt = '#,##0.00';

          for (let c = 1; c <= 12; c++) {
            ws.getCell(r, c).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
          }
          currRow++;
        });

        const cEndRow = currRow - 1;

        // Merge Container Left Side (Shipping Mark + Container No + Seal No)
        ws.mergeCells(`A${cStartRow}:C${cEndRow}`);
        const cLeftCell = ws.getCell(`A${cStartRow}`);

        let leftText = '';
        if (cIdx === 0) {
          leftText = `SHIPPING MARKS:\n${data.shippingMarks || 'N/M'}\n\nCONTAINER NO.:\n${cData.containerNo || ''}\n\nSEAL NO.:\n${cData.sealNo || ''}`;
        } else {
          leftText = `CONTAINER NO.:\n${cData.containerNo || ''}\n\nSEAL NO.:\n${cData.sealNo || ''}`;
        }

        cLeftCell.value = leftText.trim();
        cLeftCell.font = { name: 'Arial', size: 8.5, bold: true };
        cLeftCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });

      // Total Row for Packing List
      const totalRow = currRow;
      ws.getRow(totalRow).height = 24;

      ws.mergeCells(`A${totalRow}:C${totalRow}`);
      ws.getCell(`A${totalRow}`).value = 'TOTAL';
      ws.getCell(`A${totalRow}`).font = { name: 'Arial', size: 9.5, bold: true };
      ws.getCell(`A${totalRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`D${totalRow}:H${totalRow}`);
      ws.getCell(`D${totalRow}`).value = `${totalPkgCount || data.totalPackages || 1} GT`;
      ws.getCell(`D${totalRow}`).font = { name: 'Arial', size: 9, bold: true };
      ws.getCell(`D${totalRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getCell(`I${totalRow}`).value = totalNetW;
      ws.getCell(`I${totalRow}`).font = { name: 'Arial', size: 9.5, bold: true };
      ws.getCell(`I${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`I${totalRow}`).numFmt = '#,##0 "KGS"';

      ws.getCell(`J${totalRow}`).value = totalGrossW;
      ws.getCell(`J${totalRow}`).font = { name: 'Arial', size: 9.5, bold: true };
      ws.getCell(`J${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`J${totalRow}`).numFmt = '#,##0 "KGS"';

      ws.mergeCells(`K${totalRow}:L${totalRow}`);
      ws.getCell(`K${totalRow}`).value = totalCbmV;
      ws.getCell(`K${totalRow}`).font = { name: 'Arial', size: 9.5, bold: true };
      ws.getCell(`K${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`K${totalRow}`).numFmt = '#,##0.00 "CBM"';

      for (let c = 1; c <= 12; c++) {
        ws.getCell(totalRow, c).border = { top: thinBorder, bottom: doubleBorder, left: thinBorder, right: thinBorder };
      }
      currRow++;

      // Dotted Line
      ws.mergeCells(`A${currRow}:L${currRow}`);
      ws.getCell(`A${currRow}`).value = '////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////';
      ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8, color: { argb: 'FF94A3B8' } };
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
        ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 9, bold: true };
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
          ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5, bold: isHeader };
          ws.getCell(`A${currRow}`).alignment = { vertical: 'middle', wrapText: true };
          ws.getRow(currRow).height = isHeader ? 18 : 15;
          currRow++;
        });
      }

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
