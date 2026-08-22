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
      return (rawName || '').replace(/^\[.*?\]\s*/, '').trim();
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

      // 7 Optimized Columns matching A4 portrait print area
      ws.columns = [
        { width: 16 }, // A: Shipping Mark
        { width: 34 }, // B: Description of Goods
        { width: 15 }, // C: HS Code / Packaging
        { width: 12 }, // D: Qty / Net Weight
        { width: 8 },  // E: Unit
        { width: 14 }, // F: Unit Price / Gross Weight
        { width: 16 }, // G: Amount / CBM
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
            ws.addImage(imgId, 'A1:G4');
            ws.getRow(1).height = 18;
            ws.getRow(2).height = 18;
            ws.getRow(3).height = 18;
            ws.getRow(4).height = 20;
            ws.mergeCells('A4:G4');
            ws.getCell('A4').border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
            imageAdded = true;
            currRow = 6;
          }
        } catch (e) {
          console.warn('Letterhead image load fallback:', e);
        }
      }

      if (!imageAdded) {
        ws.mergeCells('A1:G1');
        const hName = ws.getCell('A1');
        hName.value = companyName;
        hName.font = { name: 'Arial', size: 14, bold: true };
        hName.alignment = { horizontal: 'left', vertical: 'middle' };
        ws.getRow(1).height = 22;

        ws.mergeCells('A2:G2');
        const hAddr = ws.getCell('A2');
        hAddr.value = headerAddress;
        hAddr.font = { name: 'Arial', size: 8, color: { argb: 'FF334155' } };
        hAddr.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        ws.getRow(2).height = 24;

        ws.mergeCells('A3:G3');
        ws.getCell('A3').border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
        ws.getRow(3).height = 4;
        currRow = 5;
      }

      // 2. Document Title
      ws.mergeCells(`A${currRow}:G${currRow}`);
      const titleCell = ws.getCell(`A${currRow}`);
      titleCell.value = isInvoice ? 'Commercial Invoice' : 'Packing List';
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF000000' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currRow).height = 28;
      currRow += 2;

      // 3. 5x2 Header Grid with Generous Row Heights & Line Breaks
      const gridStartRow = currRow;

      // Row 1: Shipper (A:D) vs Inv No / LC No (E:G)
      ws.mergeCells(`A${currRow}:D${currRow}`);
      const shipperVal = data.customShipperText || `${companyName}\n${headerAddress}`;
      ws.getCell(`A${currRow}`).value = `Shipper / Beneficiary:\n${shipperVal}`;
      ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`A${currRow}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`E${currRow}:G${currRow}`);
      ws.getCell(`E${currRow}`).value = `Invoice No. & Date:\n${data.invoiceNo || data.piNumber || '-'}   /   ${data.invoiceDate}\n\nL/C No. & Date:\n${data.lcNo || 'N/A'}${data.lcDate ? `   &   ${data.lcDate}` : ''}`;
      ws.getCell(`E${currRow}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`E${currRow}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(currRow).height = 58;
      currRow++;

      // Row 2: Applicant (A:D) vs LC Bank (E:G)
      ws.mergeCells(`A${currRow}:D${currRow}`);
      const appAddress = data.customerAddress ? `\n${data.customerAddress}` : '';
      ws.getCell(`A${currRow}`).value = `Applicant:\n${data.customerName || '-'}${appAddress}`;
      ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`A${currRow}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`E${currRow}:G${currRow}`);
      ws.getCell(`E${currRow}`).value = `L/C Issuing Bank:\n${data.lcIssuingBank || 'N/A'}`;
      ws.getCell(`E${currRow}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`E${currRow}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(currRow).height = 48;
      currRow++;

      // Row 3: Notify Party (A:D) vs Remarks (E:G)
      ws.mergeCells(`A${currRow}:D${currRow}`);
      ws.getCell(`A${currRow}`).value = `Notify Party:\n${data.notifyParty || data.customerName || 'Same as Applicant'}`;
      ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`A${currRow}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`E${currRow}:G${currRow}`);
      ws.getCell(`E${currRow}`).value = `Remarks:\n${data.remarks ? `"${data.remarks}"` : '"FREIGHT PREPAID"'}`;
      ws.getCell(`E${currRow}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`E${currRow}`).alignment = { wrapText: true, vertical: 'top' };
      const remarkLines = (data.remarks || '').split('\n').length;
      ws.getRow(currRow).height = Math.max(50, remarkLines * 13 + 18);
      currRow++;

      // Row 4: Ports (A:B & C:D) vs Payment Terms (E:G)
      ws.mergeCells(`A${currRow}:B${currRow}`);
      ws.getCell(`A${currRow}`).value = `Port of Loading:\n${data.portOfLoading || '-'}`;
      ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`A${currRow}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`C${currRow}:D${currRow}`);
      ws.getCell(`C${currRow}`).value = `Port of Discharge:\n${data.portOfDischarge || '-'}`;
      ws.getCell(`C${currRow}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`C${currRow}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`E${currRow}:G${currRow}`);
      ws.getCell(`E${currRow}`).value = `Payment Terms:\n${data.paymentTerms || '-'}`;
      ws.getCell(`E${currRow}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`E${currRow}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(currRow).height = 34;
      currRow++;

      // Row 5: Vessel / Flight & ETD (A:B & C:D) vs Delivery Terms (E:G)
      ws.mergeCells(`A${currRow}:B${currRow}`);
      ws.getCell(`A${currRow}`).value = `Vessel / Flight:\n${data.vesselName || '-'}`;
      ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`A${currRow}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`C${currRow}:D${currRow}`);
      ws.getCell(`C${currRow}`).value = `ETD:\n${data.etd || '-'}`;
      ws.getCell(`C${currRow}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`C${currRow}`).alignment = { wrapText: true, vertical: 'top' };

      ws.mergeCells(`E${currRow}:G${currRow}`);
      ws.getCell(`E${currRow}`).value = `Delivery Terms:\n${data.deliveryTerms || '-'}`;
      ws.getCell(`E${currRow}`).font = { name: 'Arial', size: 8.5 };
      ws.getCell(`E${currRow}`).alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(currRow).height = 34;

      const gridEndRow = currRow;
      currRow++;

      // Apply borders to 5x2 Header Grid
      for (let r = gridStartRow; r <= gridEndRow; r++) {
        for (let c = 1; c <= 7; c++) {
          ws.getCell(r, c).border = {
            top: thinBorder,
            bottom: thinBorder,
            left: (c === 1 || c === 3 || c === 5) ? darkBorder : undefined,
            right: (c === 2 || c === 4 || c === 7) ? darkBorder : undefined
          };
        }
      }

      currRow++; // Spacer row

      // 4. Item Table Header
      const thRow = currRow;
      ws.getRow(thRow).height = 24;
      const headers = isInvoice
        ? ['Shipping Mark', 'Description of Goods', 'HS Code', 'Quantity', 'Unit', 'Unit Price ($)', 'Amount ($)']
        : ['Shipping Mark', 'Description of Goods', 'Packaging', 'Net Wt (Kg)', 'Unit', 'Gross Wt (Kg)', 'CBM (M3)'];

      headers.forEach((th, idx) => {
        const colLetter = String.fromCharCode(65 + idx);
        const cell = ws.getCell(`${colLetter}${thRow}`);
        cell.value = th;
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF0F172A' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: thickBorder, bottom: thickBorder, left: thinBorder, right: thinBorder };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      });

      currRow++;
      const itemStartRow = currRow;

      // Top Intro Text (rendered between Table Header and Item 1 across B:G)
      if (data.introText && data.introText.trim()) {
        const introR = currRow;
        ws.mergeCells(`B${introR}:G${introR}`);
        const introCell = ws.getCell(`B${introR}`);
        introCell.value = data.introText.trim();
        introCell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF1E293B' } };
        introCell.alignment = { vertical: 'middle', wrapText: true };
        const linesCount = data.introText.trim().split('\n').length;
        ws.getRow(introR).height = Math.max(22, linesCount * 14 + 6);
        for (let c = 1; c <= 7; c++) {
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

          ws.getCell(`B${r}`).value = cleanName;
          ws.getCell(`B${r}`).font = { name: 'Arial', size: 9, bold: it.isFreight };
          ws.getCell(`B${r}`).alignment = { vertical: 'middle', wrapText: true };

          ws.getCell(`C${r}`).value = it.isFreight ? '' : (it.hsCode || '');
          ws.getCell(`C${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`C${r}`).alignment = { horizontal: 'center', vertical: 'middle' };

          ws.getCell(`D${r}`).value = it.isFreight ? '' : qty;
          ws.getCell(`D${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`D${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          if (!it.isFreight) ws.getCell(`D${r}`).numFmt = '#,##0';

          ws.getCell(`E${r}`).value = it.isFreight ? '' : (it.unit || 'PCS');
          ws.getCell(`E${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`E${r}`).alignment = { horizontal: 'center', vertical: 'middle' };

          ws.getCell(`F${r}`).value = it.isFreight ? '' : uPrice;
          ws.getCell(`F${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`F${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          if (!it.isFreight) ws.getCell(`F${r}`).numFmt = 'US$#,##0.00';

          ws.getCell(`G${r}`).value = amt;
          ws.getCell(`G${r}`).font = { name: 'Arial', size: 9, bold: true };
          ws.getCell(`G${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`G${r}`).numFmt = 'US$#,##0.00';
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

          ws.getCell(`B${r}`).value = cleanName;
          ws.getCell(`B${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`B${r}`).alignment = { vertical: 'middle', wrapText: true };

          ws.getCell(`C${r}`).value = `${pkgCount} ${pkgType}`;
          ws.getCell(`C${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`C${r}`).alignment = { horizontal: 'center', vertical: 'middle' };

          ws.getCell(`D${r}`).value = nWeight;
          ws.getCell(`D${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`D${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`D${r}`).numFmt = '#,##0.00';

          ws.getCell(`E${r}`).value = 'KG';
          ws.getCell(`E${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`E${r}`).alignment = { horizontal: 'center', vertical: 'middle' };

          ws.getCell(`F${r}`).value = gWeight;
          ws.getCell(`F${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`F${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`F${r}`).numFmt = '#,##0.00';

          ws.getCell(`G${r}`).value = cbm;
          ws.getCell(`G${r}`).font = { name: 'Arial', size: 9 };
          ws.getCell(`G${r}`).alignment = { horizontal: 'right', vertical: 'middle' };
          ws.getCell(`G${r}`).numFmt = '#,##0.000';
        }

        // Apply borders for row
        for (let c = 1; c <= 7; c++) {
          ws.getCell(r, c).border = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
        }

        currRow++;
      });

      // Merge Shipping Mark column A across item rows
      if (itemsList.length > 0) {
        const itemEndRow = currRow - 1;
        ws.mergeCells(`A${itemStartRow}:A${itemEndRow}`);
        const markCell = ws.getCell(`A${itemStartRow}`);
        markCell.value = data.shippingMarks || 'N/M';
        markCell.font = { name: 'Arial', size: 8.5 };
        markCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }

      // 5. TOTAL AMOUNT ROW
      const totalRow = currRow;
      ws.getRow(totalRow).height = 24;

      ws.mergeCells(`A${totalRow}:C${totalRow}`);
      const totTitleCell = ws.getCell(`A${totalRow}`);
      totTitleCell.value = 'TOTAL AMOUNT';
      totTitleCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } };
      totTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      if (isInvoice) {
        ws.getCell(`D${totalRow}`).value = totalQty;
        ws.getCell(`D${totalRow}`).font = { name: 'Arial', size: 9.5, bold: true };
        ws.getCell(`D${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`D${totalRow}`).numFmt = '#,##0';

        ws.getCell(`E${totalRow}`).value = '';
        ws.getCell(`F${totalRow}`).value = '';

        ws.getCell(`G${totalRow}`).value = totalAmt;
        ws.getCell(`G${totalRow}`).font = { name: 'Arial', size: 10, bold: true };
        ws.getCell(`G${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`G${totalRow}`).numFmt = 'US$#,##0.00';
      } else {
        ws.getCell(`D${totalRow}`).value = totalNetW;
        ws.getCell(`D${totalRow}`).font = { name: 'Arial', size: 9.5, bold: true };
        ws.getCell(`D${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`D${totalRow}`).numFmt = '#,##0.00';

        ws.getCell(`E${totalRow}`).value = 'KG';
        ws.getCell(`E${totalRow}`).font = { name: 'Arial', size: 9, bold: true };
        ws.getCell(`E${totalRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getCell(`F${totalRow}`).value = totalGrossW;
        ws.getCell(`F${totalRow}`).font = { name: 'Arial', size: 9.5, bold: true };
        ws.getCell(`F${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`F${totalRow}`).numFmt = '#,##0.00';

        ws.getCell(`G${totalRow}`).value = totalCbmV;
        ws.getCell(`G${totalRow}`).font = { name: 'Arial', size: 9.5, bold: true };
        ws.getCell(`G${totalRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`G${totalRow}`).numFmt = '#,##0.000';
      }

      for (let c = 1; c <= 7; c++) {
        ws.getCell(totalRow, c).border = { top: thinBorder, bottom: doubleBorder, left: thinBorder, right: thinBorder };
      }

      currRow++;

      // 6. Dotted separator line
      ws.mergeCells(`A${currRow}:G${currRow}`);
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
        ws.mergeCells(`A${currRow}:G${currRow}`);
        ws.getCell(`A${currRow}`).value = cInfoFormatted;
        ws.getCell(`A${currRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 9, bold: true };
        ws.getRow(currRow).height = 18;
        currRow++;
      }



      // 9. Section A (Only if filled)
      if (data.hsCodeSummary && data.hsCodeSummary.trim()) {
        ws.mergeCells(`A${currRow}:G${currRow}`);
        ws.getCell(`A${currRow}`).value = 'A) RELEVANT HARMONIZED SYSTEM COMMODITY CODE NUMBER(S) APPLICABLE TO EACH ITEM SHIPPED UNDER THIS CREDIT';
        ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5, bold: true };
        ws.getRow(currRow).height = 18;
        currRow++;

        const hsLines = data.hsCodeSummary.trim().split('\n').length;
        ws.mergeCells(`A${currRow}:G${currRow}`);
        ws.getCell(`A${currRow}`).value = data.hsCodeSummary.trim();
        ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5 };
        ws.getCell(`A${currRow}`).alignment = { wrapText: true, vertical: 'top' };
        ws.getRow(currRow).height = Math.max(22, hsLines * 14 + 6);
        currRow++;
      }

      // 10. Free-form Bottom Clauses (B, C, D, etc.)
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
          ws.mergeCells(`A${currRow}:G${currRow}`);
          ws.getCell(`A${currRow}`).value = line;
          ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5, bold: isHeader };
          ws.getCell(`A${currRow}`).alignment = { vertical: 'middle', wrapText: true };
          ws.getRow(currRow).height = isHeader ? 18 : 15;
          currRow++;
        });
      } else {
        if (data.vatTrn && data.vatTrn.trim()) {
          ws.mergeCells(`A${currRow}:G${currRow}`);
          const bVal = data.vatTrn.trim();
          const bText = bVal.toUpperCase().startsWith('B)') ? bVal : `B) TRN Number: ${bVal}`;
          ws.getCell(`A${currRow}`).value = bText;
          ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5, bold: true };
          ws.getRow(currRow).height = 18;
          currRow++;
        }

        if (data.manufacturerName || data.manufacturerAddress) {
          ws.mergeCells(`A${currRow}:G${currRow}`);
          ws.getCell(`A${currRow}`).value = 'C) MANUFACTURER/PRODUCER';
          ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5, bold: true };
          ws.getRow(currRow).height = 18;
          currRow++;

          const mfgLines = [];
          if (data.manufacturerName) mfgLines.push(`1. NAME : ${data.manufacturerName}`);
          if (data.manufacturerAddress) mfgLines.push(`2. ADDRESS : ${data.manufacturerAddress}`);

          ws.mergeCells(`A${currRow}:G${currRow}`);
          ws.getCell(`A${currRow}`).value = mfgLines.join('\n');
          ws.getCell(`A${currRow}`).font = { name: 'Arial', size: 8.5 };
          ws.getCell(`A${currRow}`).alignment = { wrapText: true };
          ws.getRow(currRow).height = 26;
          currRow++;
        }
      }

      // 11. Sign-off / Signature
      currRow += 2;
      ws.mergeCells(`E${currRow}:G${currRow}`);
      ws.getCell(`E${currRow}`).value = 'Signed by';
      ws.getCell(`E${currRow}`).font = { name: 'Arial', size: 8.5, italic: true };
      ws.getCell(`E${currRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(currRow).height = 16;
      currRow += 3;

      ws.mergeCells(`E${currRow}:G${currRow}`);
      ws.getCell(`E${currRow}`).value = companyName;
      ws.getCell(`E${currRow}`).font = { name: 'Arial', size: 10, bold: true };
      ws.getCell(`E${currRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(`E${currRow}`).border = { top: darkBorder };
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
