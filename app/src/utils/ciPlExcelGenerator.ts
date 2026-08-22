import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

export interface ExcelItem {
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
  orderId: string;
  piNumber: string;
  customerName: string;
  customerAddress?: string;
  issuingCompany: string; // YSACC or YS
  invoiceNo: string;
  invoiceDate: string;
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
  deliveryTerms?: string; // Incoterms
  shippingMarks?: string;
  items: ExcelItem[];
  ciItems?: ExcelItem[];
  plItems?: ExcelItem[];
  totalPackages?: number;
  totalNetWeight?: number;
  totalGrossWeight?: number;
  totalCbm?: number;
  customShipperText?: string;
  introText?: string;
  containerInfo?: string;
  vatTrn?: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  hsCodeSummary?: string;
}

export const exportCiPlToExcel = async (data: CiPlData) => {
  const workbook = new ExcelJS.Workbook();

  const thinBorder = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFCBD5E1' } };
  const thickBorder = { style: 'medium' as ExcelJS.BorderStyle, color: { argb: 'FF000000' } };
  const doubleBorder = { style: 'double' as ExcelJS.BorderStyle, color: { argb: 'FF000000' } };

  const cleanCiName = (rawName: string) => {
    return (rawName || '').replace(/^\[.*?\]\s*/, '').trim();
  };

  const isYS = data.issuingCompany === 'YS';
  const companyName = isYS ? 'YS' : 'YS ACC';
  const headerAddress = '111-201, 76, WOLMYEONG-RO, HEUNGDEOK-GU, CHEONGJU-SI, CHUNGCHEONGBUK-DO, 28569, REPUBLIC OF KOREA\nTEL: +82 70 4141 2927 / FAX: +82 303 3444 1130';

  // Helper function to build a styled sheet
  const buildSheet = (sheetName: string, isInvoice: boolean) => {
    const ws = workbook.addWorksheet(sheetName);

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

    // Columns config (8 columns: A to H)
    ws.columns = [
      { width: 15 }, // A: Shipping Mark
      { width: 34 }, // B: Description
      { width: 14 }, // C: HS Code / Packaging
      { width: 12 }, // D: Qty / Net Weight
      { width: 8 },  // E: Unit
      { width: 14 }, // F: Unit Price / Gross Weight
      { width: 16 }, // G: Amount / CBM
      { width: 8 },  // H: Extra
    ];

    // Row 1-2: Letterhead Header
    ws.mergeCells('A1:H1');
    const headerNameCell = ws.getCell('A1');
    headerNameCell.value = companyName;
    headerNameCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF000000' } };
    headerNameCell.alignment = { horizontal: 'left', vertical: 'middle' };

    ws.mergeCells('A2:H2');
    const headerAddrCell = ws.getCell('A2');
    headerAddrCell.value = headerAddress;
    headerAddrCell.font = { name: 'Arial', size: 8, color: { argb: 'FF334155' } };
    headerAddrCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    ws.getRow(2).height = 24;

    // Row 3: Title
    ws.mergeCells('A3:H3');
    const titleCell = ws.getCell('A3');
    titleCell.value = isInvoice ? 'Commercial Invoice' : 'Packing List';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF000000' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(3).height = 26;

    // Header 5x2 Info Grid (Row 4 to 8)
    // Row 4: Shipper (A4:D4) vs Inv No (E4:H4)
    ws.mergeCells('A4:D4');
    ws.getCell('A4').value = `Shipper / Beneficiary\n${data.customShipperText || `${companyName}\n${headerAddress}`}`;
    ws.getCell('A4').font = { name: 'Arial', size: 8.5 };
    ws.getCell('A4').alignment = { wrapText: true, vertical: 'top' };

    ws.mergeCells('E4:H4');
    ws.getCell('E4').value = `Invoice No. & Date: ${data.invoiceNo} / ${data.invoiceDate}\nL/C No. & Date: ${data.lcNo || 'N/A'} ${data.lcDate ? `& ${data.lcDate}` : ''}`;
    ws.getCell('E4').font = { name: 'Arial', size: 8.5 };
    ws.getCell('E4').alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(4).height = 36;

    // Row 5: Applicant (A5:D5) vs LC Bank (E5:H5)
    ws.mergeCells('A5:D5');
    ws.getCell('A5').value = `Applicant\n${data.customerName}\n${data.customerAddress || ''}`;
    ws.getCell('A5').font = { name: 'Arial', size: 8.5 };
    ws.getCell('A5').alignment = { wrapText: true, vertical: 'top' };

    ws.mergeCells('E5:H5');
    ws.getCell('E5').value = `L/C Issuing Bank\n${data.lcIssuingBank || 'N/A'}`;
    ws.getCell('E5').font = { name: 'Arial', size: 8.5 };
    ws.getCell('E5').alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(5).height = 36;

    // Row 6: Notify Party (A6:D6) vs Remarks (E6:H6)
    ws.mergeCells('A6:D6');
    ws.getCell('A6').value = `Notify Party\n${data.notifyParty || data.customerName || 'Same as Applicant'}`;
    ws.getCell('A6').font = { name: 'Arial', size: 8.5 };
    ws.getCell('A6').alignment = { wrapText: true, vertical: 'top' };

    ws.mergeCells('E6:H6');
    ws.getCell('E6').value = `Remarks\n${data.remarks || '"FREIGHT PREPAID"'}`;
    ws.getCell('E6').font = { name: 'Arial', size: 8.5 };
    ws.getCell('E6').alignment = { wrapText: true, vertical: 'top' };
    const remarkLines = (data.remarks || '').split('\n').length;
    ws.getRow(6).height = Math.max(30, remarkLines * 12 + 10);

    // Row 7: Ports (A7:D7) vs Payment Terms (E7:H7)
    ws.mergeCells('A7:D7');
    ws.getCell('A7').value = `Port of Loading: ${data.portOfLoading || '-'}    |    Port of Discharge: ${data.portOfDischarge || '-'}`;
    ws.getCell('A7').font = { name: 'Arial', size: 8.5 };
    ws.getCell('A7').alignment = { vertical: 'middle' };

    ws.mergeCells('E7:H7');
    ws.getCell('E7').value = `Payment Terms: ${data.paymentTerms || '-'}`;
    ws.getCell('E7').font = { name: 'Arial', size: 8.5 };
    ws.getCell('E7').alignment = { vertical: 'middle' };
    ws.getRow(7).height = 20;

    // Row 8: Vessel & Sailing (A8:D8) vs Delivery Terms (E8:H8)
    ws.mergeCells('A8:D8');
    ws.getCell('A8').value = `Vessel: ${data.vesselName || '-'}    |    Sailing on or about: ${data.etd || '-'}`;
    ws.getCell('A8').font = { name: 'Arial', size: 8.5 };
    ws.getCell('A8').alignment = { vertical: 'middle' };

    ws.mergeCells('E8:H8');
    ws.getCell('E8').value = `Delivery Terms: ${data.deliveryTerms || '-'}`;
    ws.getCell('E8').font = { name: 'Arial', size: 8.5 };
    ws.getCell('E8').alignment = { vertical: 'middle' };
    ws.getRow(8).height = 20;

    // Apply borders to header info grid (rows 4-8)
    for (let r = 4; r <= 8; r++) {
      for (let c = 1; c <= 8; c++) {
        ws.getCell(r, c).border = {
          top: thinBorder,
          bottom: thinBorder,
          left: (c === 1 || c === 5) ? thinBorder : undefined,
          right: (c === 4 || c === 8) ? thinBorder : undefined
        };
      }
    }

    // Row 9: Table Headers
    ws.getRow(9).height = 24;
    const tableHeaders = isInvoice
      ? ['Shipping Mark', 'Description of Goods', 'HS Code', 'Quantity', 'Unit', 'Unit Price ($)', 'Amount ($)', '']
      : ['Shipping Marks', 'Description of Goods', 'Quantity / Packages', '', 'Net Wt (Kg)', 'Gross Wt (Kg)', 'CBM', ''];

    tableHeaders.forEach((th, index) => {
      const colLetter = String.fromCharCode(65 + index);
      const cell = ws.getCell(`${colLetter}9`);
      cell.value = th;
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: thickBorder, bottom: thickBorder, left: thinBorder, right: thinBorder };
    });

    if (isInvoice) {
      ws.mergeCells('G9:H9');
    } else {
      ws.mergeCells('C9:D9');
    }

    let itemRowIdx = 10;
    let totalQtySum = 0;
    let totalAmountSum = 0;
    let totalPkgsSum = 0;
    let totalNetW = 0;
    let totalGrossW = 0;
    let totalCbmV = 0;

    const sheetItems = isInvoice 
      ? (data.ciItems && data.ciItems.length > 0 ? data.ciItems : data.items)
      : (data.plItems && data.plItems.length > 0 ? data.plItems : data.items);

    // If introText present on CI, render it on first item row
    if (isInvoice && data.introText) {
      ws.getRow(itemRowIdx).height = 20;
      ws.mergeCells(`B${itemRowIdx}:H${itemRowIdx}`);
      ws.getCell(`B${itemRowIdx}`).value = data.introText;
      ws.getCell(`B${itemRowIdx}`).font = { name: 'Arial', size: 8.5, bold: true };
      ws.getCell(`B${itemRowIdx}`).alignment = { vertical: 'middle' };
      for (let c = 1; c <= 8; c++) ws.getCell(itemRowIdx, c).border = { bottom: thinBorder, left: thinBorder, right: thinBorder };
      itemRowIdx++;
    }

    const startItemRow = itemRowIdx;

    sheetItems.forEach((rawItem) => {
      const item = { ...rawItem, name: cleanCiName(rawItem.name) };
      ws.getRow(itemRowIdx).height = 20;

      // Column B: Description
      ws.getCell(`B${itemRowIdx}`).value = item.name;
      ws.getCell(`B${itemRowIdx}`).alignment = { vertical: 'middle' };

      if (isInvoice) {
        // Column C: HS Code
        ws.getCell(`C${itemRowIdx}`).value = item.hsCode || '-';
        ws.getCell(`C${itemRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

        // Column D: Qty
        ws.getCell(`D${itemRowIdx}`).value = item.qty || 0;
        ws.getCell(`D${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`D${itemRowIdx}`).numFmt = '#,##0';

        // Column E: Unit
        ws.getCell(`E${itemRowIdx}`).value = item.unit || 'PCS';
        ws.getCell(`E${itemRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

        // Column F: Unit Price
        ws.getCell(`F${itemRowIdx}`).value = item.unitPrice || 0;
        ws.getCell(`F${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`F${itemRowIdx}`).numFmt = '$#,##0.00';

        // Column G-H: Amount
        ws.mergeCells(`G${itemRowIdx}:H${itemRowIdx}`);
        const lineAmt = item.amount || ((item.qty || 0) * (item.unitPrice || 0));
        ws.getCell(`G${itemRowIdx}`).value = lineAmt;
        ws.getCell(`G${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`G${itemRowIdx}`).numFmt = '$#,##0.00';

        totalQtySum += item.qty || 0;
        totalAmountSum += lineAmt;
      } else {
        // Packing List Columns
        ws.mergeCells(`C${itemRowIdx}:D${itemRowIdx}`);
        const pkgs = item.packagesCount && item.packagesCount > 0 ? item.packagesCount : 1;
        ws.getCell(`C${itemRowIdx}`).value = `${pkgs} ${item.packageType || 'PL'} (${(item.qty || 0).toLocaleString()} ${item.unit || 'EA'})`;
        ws.getCell(`C${itemRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getCell(`E${itemRowIdx}`).value = item.netWeight || 0;
        ws.getCell(`E${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`E${itemRowIdx}`).numFmt = '#,##0.00';

        ws.getCell(`F${itemRowIdx}`).value = item.grossWeight || 0;
        ws.getCell(`F${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`F${itemRowIdx}`).numFmt = '#,##0.00';

        ws.mergeCells(`G${itemRowIdx}:H${itemRowIdx}`);
        ws.getCell(`G${itemRowIdx}`).value = item.cbm || 0;
        ws.getCell(`G${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`G${itemRowIdx}`).numFmt = '#,##0.000';

        totalPkgsSum += pkgs;
        totalNetW += item.netWeight || 0;
        totalGrossW += item.grossWeight || 0;
        totalCbmV += item.cbm || 0;
      }

      for (let c = 1; c <= 8; c++) {
        ws.getCell(itemRowIdx, c).border = { bottom: thinBorder, left: thinBorder, right: thinBorder };
        ws.getCell(itemRowIdx, c).font = { name: 'Arial', size: 9 };
      }

      itemRowIdx++;
    });

    const endItemRow = itemRowIdx - 1;

    // Merge Shipping Mark in Column A across all item rows
    if (endItemRow >= startItemRow) {
      ws.mergeCells(`A${startItemRow}:A${endItemRow}`);
      ws.getCell(`A${startItemRow}`).value = data.shippingMarks || 'N/M';
      ws.getCell(`A${startItemRow}`).font = { name: 'Arial', size: 8.5, bold: true };
      ws.getCell(`A${startItemRow}`).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }

    // Total Row
    ws.getRow(itemRowIdx).height = 22;
    if (isInvoice) {
      ws.mergeCells(`A${itemRowIdx}:C${itemRowIdx}`);
      ws.getCell(`A${itemRowIdx}`).value = 'TOTAL AMOUNT';
      ws.getCell(`A${itemRowIdx}`).alignment = { horizontal: 'left', vertical: 'middle' };
      ws.getCell(`A${itemRowIdx}`).font = { name: 'Arial', size: 9.5, bold: true };

      ws.getCell(`D${itemRowIdx}`).value = totalQtySum;
      ws.getCell(`D${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`D${itemRowIdx}`).font = { name: 'Arial', size: 9.5, bold: true };
      ws.getCell(`D${itemRowIdx}`).numFmt = '#,##0';

      ws.getCell(`E${itemRowIdx}`).value = '';
      ws.getCell(`F${itemRowIdx}`).value = '';

      ws.mergeCells(`G${itemRowIdx}:H${itemRowIdx}`);
      ws.getCell(`G${itemRowIdx}`).value = totalAmountSum;
      ws.getCell(`G${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`G${itemRowIdx}`).font = { name: 'Arial', size: 10, bold: true };
      ws.getCell(`G${itemRowIdx}`).numFmt = '$#,##0.00';
    } else {
      ws.mergeCells(`A${itemRowIdx}:B${itemRowIdx}`);
      ws.getCell(`A${itemRowIdx}`).value = 'TOTAL';
      ws.getCell(`A${itemRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`C${itemRowIdx}:D${itemRowIdx}`);
      ws.getCell(`C${itemRowIdx}`).value = `${totalPkgsSum} PLT`;
      ws.getCell(`C${itemRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getCell(`E${itemRowIdx}`).value = totalNetW;
      ws.getCell(`E${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`E${itemRowIdx}`).numFmt = '#,##0.00';

      ws.getCell(`F${itemRowIdx}`).value = totalGrossW;
      ws.getCell(`F${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`F${itemRowIdx}`).numFmt = '#,##0.00';

      ws.mergeCells(`G${itemRowIdx}:H${itemRowIdx}`);
      ws.getCell(`G${itemRowIdx}`).value = totalCbmV;
      ws.getCell(`G${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`G${itemRowIdx}`).numFmt = '#,##0.000';
    }

    for (let c = 1; c <= 8; c++) {
      const cell = ws.getCell(itemRowIdx, c);
      cell.border = { top: thickBorder, bottom: doubleBorder, left: thinBorder, right: thinBorder };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }

    itemRowIdx++;

    // Extra CI Sections A, B, C & Container Info
    if (isInvoice) {
      // Slash divider line
      ws.getRow(itemRowIdx).height = 14;
      ws.mergeCells(`A${itemRowIdx}:H${itemRowIdx}`);
      ws.getCell(`A${itemRowIdx}`).value = '////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////';
      ws.getCell(`A${itemRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(`A${itemRowIdx}`).font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF64748B' } };
      itemRowIdx++;

      // Container count line
      if (data.containerInfo) {
        const cInfoFormatted = data.containerInfo.toUpperCase().startsWith('CONTAINER')
          ? data.containerInfo
          : `CONTAINER : ${data.containerInfo}`;
        ws.getRow(itemRowIdx).height = 16;
        ws.mergeCells(`A${itemRowIdx}:H${itemRowIdx}`);
        ws.getCell(`A${itemRowIdx}`).value = cInfoFormatted;
        ws.getCell(`A${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`A${itemRowIdx}`).font = { name: 'Arial', size: 9, bold: true };
        itemRowIdx++;
      }

      // Section A (Only if filled)
      if (data.hsCodeSummary) {
        ws.getRow(itemRowIdx).height = 15;
        ws.mergeCells(`A${itemRowIdx}:H${itemRowIdx}`);
        ws.getCell(`A${itemRowIdx}`).value = 'A) RELEVANT HARMONIZED SYSTEM COMMODITY CODE NUMBER(S) APPLICABLE TO EACH ITEM SHIPPED UNDER THIS CREDIT';
        ws.getCell(`A${itemRowIdx}`).font = { name: 'Arial', size: 8.5, bold: true };
        itemRowIdx++;

        const hsLines = (data.hsCodeSummary || '').split('\n').length;
        ws.getRow(itemRowIdx).height = Math.max(20, hsLines * 13 + 4);
        ws.mergeCells(`A${itemRowIdx}:H${itemRowIdx}`);
        ws.getCell(`A${itemRowIdx}`).value = data.hsCodeSummary;
        ws.getCell(`A${itemRowIdx}`).font = { name: 'Arial', size: 8.5 };
        ws.getCell(`A${itemRowIdx}`).alignment = { wrapText: true };
        itemRowIdx++;
      }

      // Section B (Only if filled)
      if (data.vatTrn) {
        ws.getRow(itemRowIdx).height = 15;
        ws.mergeCells(`A${itemRowIdx}:H${itemRowIdx}`);
        ws.getCell(`A${itemRowIdx}`).value = `B) VAT registration(TRN) number : ${data.vatTrn}`;
        ws.getCell(`A${itemRowIdx}`).font = { name: 'Arial', size: 8.5, bold: true };
        itemRowIdx++;
      }

      // Section C (Only if filled)
      if (data.manufacturerName || data.manufacturerAddress) {
        ws.getRow(itemRowIdx).height = 15;
        ws.mergeCells(`A${itemRowIdx}:H${itemRowIdx}`);
        ws.getCell(`A${itemRowIdx}`).value = 'C) MANUFACTURER/PRODUCER';
        ws.getCell(`A${itemRowIdx}`).font = { name: 'Arial', size: 8.5, bold: true };
        itemRowIdx++;

        const mfgLines = [];
        if (data.manufacturerName) mfgLines.push(`1. NAME : ${data.manufacturerName}`);
        if (data.manufacturerAddress) mfgLines.push(`2. ADDRESS : ${data.manufacturerAddress}`);

        ws.getRow(itemRowIdx).height = 24;
        ws.mergeCells(`A${itemRowIdx}:H${itemRowIdx}`);
        ws.getCell(`A${itemRowIdx}`).value = mfgLines.join('\n');
        ws.getCell(`A${itemRowIdx}`).font = { name: 'Arial', size: 8.5 };
        ws.getCell(`A${itemRowIdx}`).alignment = { wrapText: true };
        itemRowIdx++;
      }
    }

    itemRowIdx += 1;

    // Signature Area
    ws.getRow(itemRowIdx).height = 15;
    ws.mergeCells(`F${itemRowIdx}:H${itemRowIdx}`);
    ws.getCell(`F${itemRowIdx}`).value = 'Signed by:';
    ws.getCell(`F${itemRowIdx}`).font = { name: 'Arial', size: 9, bold: true };
    ws.getCell(`F${itemRowIdx}`).alignment = { horizontal: 'center' };
    itemRowIdx++;

    ws.getRow(itemRowIdx).height = 20;
    ws.mergeCells(`F${itemRowIdx}:H${itemRowIdx}`);
    ws.getCell(`F${itemRowIdx}`).border = { bottom: thinBorder };
    itemRowIdx++;

    ws.getRow(itemRowIdx).height = 15;
    ws.mergeCells(`F${itemRowIdx}:H${itemRowIdx}`);
    ws.getCell(`F${itemRowIdx}`).value = companyName;
    ws.getCell(`F${itemRowIdx}`).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF1E3A8A' } };
    ws.getCell(`F${itemRowIdx}`).alignment = { horizontal: 'center' };
  };

  buildSheet('Commercial Invoice', true);
  buildSheet('Packing List', false);

  // Write and Save
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `CI_PL_${data.invoiceNo || data.orderId}.xlsx`);
};
