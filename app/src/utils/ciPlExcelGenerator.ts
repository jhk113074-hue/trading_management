import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface ExcelItem {
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
}

interface CiPlData {
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
}

export const exportCiPlToExcel = async (data: CiPlData) => {
  const workbook = new ExcelJS.Workbook();

  const thinBorder = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFCBD5E1' } };
  const thickBorder = { style: 'medium' as ExcelJS.BorderStyle, color: { argb: 'FF475569' } };
  const doubleBorder = { style: 'double' as ExcelJS.BorderStyle, color: { argb: 'FF000000' } };

  // Helper function to build a styled sheet
  const buildSheet = (sheetName: string, isInvoice: boolean) => {
    const ws = workbook.addWorksheet(sheetName);

    // Page settings to fit to one page wide and look professional when printing
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
      { width: 14 }, // A: Shipping Mark
      { width: 26 }, // B: Description
      { width: 12 }, // C: HS CODE / Package Qty
      { width: 10 }, // D: Qty / Net Weight
      { width: 7 },  // E: Unit / Unit Type
      { width: 12 }, // F: Unit Price / Gross Weight
      { width: 14 }, // G: Amount / CBM
      { width: 10 }, // H: Buffer / Sign space
    ];

    // Title Row
    ws.mergeCells('A1:H2');
    const titleCell = ws.getCell('A1');
    titleCell.value = isInvoice ? 'COMMERCIAL INVOICE' : 'PACKING LIST';
    titleCell.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FF1E3A8A' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 20;
    ws.getRow(2).height = 20;

    // Line beneath Title
    for (let c = 1; c <= 8; c++) {
      ws.getCell(3, c).border = { bottom: thickBorder };
    }
    ws.getRow(3).height = 6;

    // Row 4: Header Blocks (Shipper Info vs Invoice No)
    ws.getRow(4).height = 16;
    ws.mergeCells('A4:D4');
    ws.getCell('A4').value = '1. Shipper / Exporter';
    ws.getCell('A4').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
    ws.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    ws.mergeCells('E4:H4');
    ws.getCell('E4').value = isInvoice ? '2. Invoice No. & Date' : '2. Packing List No. & Date';
    ws.getCell('E4').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
    ws.getCell('E4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    // Apply borders to label header row 4
    for (let c = 1; c <= 4; c++) {
      ws.getCell(4, c).border = { top: thinBorder, left: c === 1 ? thinBorder : undefined, bottom: thinBorder };
    }
    for (let c = 5; c <= 8; c++) {
      ws.getCell(4, c).border = { top: thinBorder, left: c === 5 ? thinBorder : undefined, bottom: thinBorder, right: c === 8 ? thinBorder : undefined };
    }

    // Row 5 to 7: Shipper details on Left, Inv details on Right
    ws.mergeCells('A5:D7');
    const companyName = data.issuingCompany === 'YSACC' ? 'YSACC CO., LTD.' : 'YS CO., LTD.';
    ws.getCell('A5').value = data.customShipperText || `${companyName}\nSuite 408, Dae-il Bldg, 12, Mapo-daero 4-gil,\nMapo-gu, Seoul, 04175, Korea`;
    ws.getCell('A5').font = { name: 'Arial', size: 9.5 };
    ws.getCell('A5').alignment = { wrapText: true, vertical: 'top' };

    ws.mergeCells('E5:H5');
    ws.getCell('E5').value = `${data.invoiceNo} / ${data.invoiceDate}`;
    ws.getCell('E5').font = { name: 'Arial', size: 9.5, bold: true };
    ws.getCell('E5').alignment = { vertical: 'middle', horizontal: 'center' };

    ws.mergeCells('E6:H6');
    ws.getCell('E6').value = `L/C No. & Date: ${data.lcNo || 'N/A'} ${data.lcDate ? `/ ${data.lcDate}` : ''}`;
    ws.getCell('E6').font = { name: 'Arial', size: 9 };
    ws.getCell('E6').alignment = { vertical: 'middle', horizontal: 'center' };

    ws.mergeCells('E7:H7');
    ws.getCell('E7').value = `L/C Issuing Bank: ${data.lcIssuingBank || 'N/A'}`;
    ws.getCell('E7').font = { name: 'Arial', size: 9 };
    ws.getCell('E7').alignment = { vertical: 'middle', horizontal: 'center' };

    // Apply borders around the Shipper & Invoice No box
    for (let r = 5; r <= 7; r++) {
      ws.getCell(`A${r}`).border = { left: thinBorder };
      ws.getCell(`D${r}`).border = { right: thinBorder };
      ws.getCell(`E${r}`).border = { left: thinBorder };
      ws.getCell(`H${r}`).border = { right: thinBorder };
    }
    for (let c = 1; c <= 4; c++) ws.getCell(7, c).border = { bottom: thinBorder, left: c === 1 ? thinBorder : undefined, right: c === 4 ? thinBorder : undefined };
    for (let c = 5; c <= 8; c++) ws.getCell(7, c).border = { bottom: thinBorder, left: c === 5 ? thinBorder : undefined, right: c === 8 ? thinBorder : undefined };

    // Row 8: Applicant Header
    ws.getRow(8).height = 16;
    ws.mergeCells('A8:D8');
    ws.getCell('A8').value = '3. Consignee / Applicant (주문 바이어)';
    ws.getCell('A8').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
    ws.getCell('A8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    ws.mergeCells('E8:H8');
    ws.getCell('E8').value = '4. Notify Party (통지처)';
    ws.getCell('E8').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
    ws.getCell('E8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    // Apply borders to row 8
    for (let c = 1; c <= 4; c++) ws.getCell(8, c).border = { top: thinBorder, left: c === 1 ? thinBorder : undefined, bottom: thinBorder };
    for (let c = 5; c <= 8; c++) ws.getCell(8, c).border = { top: thinBorder, left: c === 5 ? thinBorder : undefined, bottom: thinBorder, right: c === 8 ? thinBorder : undefined };

    // Row 9 to 11: Applicant info vs Notify info
    ws.mergeCells('A9:D11');
    ws.getCell('A9').value = `${data.customerName}\n${data.customerAddress || ''}`;
    ws.getCell('A9').font = { name: 'Arial', size: 9.5 };
    ws.getCell('A9').alignment = { wrapText: true, vertical: 'top' };

    ws.mergeCells('E9:H11');
    ws.getCell('E9').value = data.notifyParty || 'SAME AS APPLICANT';
    ws.getCell('E9').font = { name: 'Arial', size: 9.5 };
    ws.getCell('E9').alignment = { wrapText: true, vertical: 'top' };

    for (let r = 9; r <= 11; r++) {
      ws.getCell(`A${r}`).border = { left: thinBorder };
      ws.getCell(`D${r}`).border = { right: thinBorder };
      ws.getCell(`E${r}`).border = { left: thinBorder };
      ws.getCell(`H${r}`).border = { right: thinBorder };
    }
    for (let c = 1; c <= 4; c++) ws.getCell(11, c).border = { bottom: thinBorder, left: c === 1 ? thinBorder : undefined, right: c === 4 ? thinBorder : undefined };
    for (let c = 5; c <= 8; c++) ws.getCell(11, c).border = { bottom: thinBorder, left: c === 5 ? thinBorder : undefined, right: c === 8 ? thinBorder : undefined };

    // Row 12: Shipping Marks vs Remarks
    ws.getRow(12).height = 16;
    ws.mergeCells('A12:D12');
    ws.getCell('A12').value = '5. Shipping Marks & Numbers (화인)';
    ws.getCell('A12').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
    ws.getCell('A12').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    ws.mergeCells('E12:H12');
    ws.getCell('E12').value = '6. Additional Remarks / Special Instructions';
    ws.getCell('E12').font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
    ws.getCell('E12').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    for (let c = 1; c <= 4; c++) ws.getCell(12, c).border = { top: thinBorder, left: c === 1 ? thinBorder : undefined, bottom: thinBorder };
    for (let c = 5; c <= 8; c++) ws.getCell(12, c).border = { top: thinBorder, left: c === 5 ? thinBorder : undefined, bottom: thinBorder, right: c === 8 ? thinBorder : undefined };

    // Row 13 to 16: Marks vs Remarks content
    ws.mergeCells('A13:D16');
    ws.getCell('A13').value = data.shippingMarks || 'N/M';
    ws.getCell('A13').font = { name: 'Courier New', size: 9.5, bold: true };
    ws.getCell('A13').alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };

    ws.mergeCells('E13:H16');
    ws.getCell('E13').value = data.remarks || '-';
    ws.getCell('E13').font = { name: 'Arial', size: 9 };
    ws.getCell('E13').alignment = { wrapText: true, vertical: 'top' };

    for (let r = 13; r <= 16; r++) {
      ws.getCell(`A${r}`).border = { left: thinBorder };
      ws.getCell(`D${r}`).border = { right: thinBorder };
      ws.getCell(`E${r}`).border = { left: thinBorder };
      ws.getCell(`H${r}`).border = { right: thinBorder };
    }
    for (let c = 1; c <= 4; c++) ws.getCell(16, c).border = { bottom: thinBorder, left: c === 1 ? thinBorder : undefined, right: c === 4 ? thinBorder : undefined };
    for (let c = 5; c <= 8; c++) ws.getCell(16, c).border = { bottom: thinBorder, left: c === 5 ? thinBorder : undefined, right: c === 8 ? thinBorder : undefined };

    // Row 17: Port labels
    ws.getRow(17).height = 15;
    ws.getCell('A17').value = 'Port of Loading';
    ws.getCell('C17').value = 'Port of Discharge';
    ws.getCell('E17').value = 'Carrier / Vessel';
    ws.getCell('G17').value = 'Incoterms & Payments';

    // Styles for ports label row
    ['A17', 'C17', 'E17', 'G17'].forEach(cellRef => {
      const cell = ws.getCell(cellRef);
      cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF64748B' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    });
    ws.mergeCells('A17:B17');
    ws.mergeCells('C17:D17');
    ws.mergeCells('E17:F17');
    ws.mergeCells('G17:H17');

    for (let c = 1; c <= 8; c++) {
      ws.getCell(17, c).border = { top: thinBorder, left: c === 1 || c === 3 || c === 5 || c === 7 ? thinBorder : undefined, right: c === 2 || c === 4 || c === 6 || c === 8 ? thinBorder : undefined, bottom: thinBorder };
    }

    // Row 18: Port values
    ws.getRow(18).height = 20;
    ws.mergeCells('A18:B18');
    ws.getCell('A18').value = data.portOfLoading || '-';

    ws.mergeCells('C18:D18');
    ws.getCell('C18').value = data.portOfDischarge || '-';

    ws.mergeCells('E18:F18');
    ws.getCell('E18').value = `${data.vesselName || ''} (ETD: ${data.etd || ''})`;

    ws.mergeCells('G18:H18');
    ws.getCell('G18').value = `${data.deliveryTerms || ''} / ${data.paymentTerms || ''}`;

    for (let c = 1; c <= 8; c++) {
      const cell = ws.getCell(18, c);
      cell.font = { name: 'Arial', size: 9, bold: true };
      cell.alignment = { vertical: 'middle' };
      cell.border = { bottom: thickBorder, left: c === 1 || c === 3 || c === 5 || c === 7 ? thinBorder : undefined, right: c === 2 || c === 4 || c === 6 || c === 8 ? thinBorder : undefined };
    }

    // Row 19: Spacer
    ws.getRow(19).height = 10;

    // Row 20: Table Headers
    ws.getRow(20).height = 24;
    const tableHeaders = isInvoice
      ? ['No.', 'Description of Goods', 'HS Code', 'Quantity', 'Unit', 'Unit Price ($)', 'Amount ($)', '']
      : ['No.', 'Description of Goods', 'Packages / Packing Qty', 'Net Weight (Kg)', '', 'Gross Weight (Kg)', 'CBM', ''];

    tableHeaders.forEach((th, index) => {
      const colLetter = String.fromCharCode(65 + index);
      const cell = ws.getCell(`${colLetter}20`);
      cell.value = th;
      cell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    if (isInvoice) {
      ws.mergeCells('G20:H20');
      ws.getCell('G20').alignment = { horizontal: 'center', vertical: 'middle' };
    } else {
      ws.mergeCells('C20:D20');
      ws.mergeCells('E20:F20');
      ws.getCell('C20').alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell('E20').alignment = { horizontal: 'center', vertical: 'middle' };
    }

    let itemRowIdx = 21;
    let totalQtySum = 0;
    let totalAmountSum = 0;
    let totalPkgsSum = 0;
    let totalNetW = 0;
    let totalGrossW = 0;
    let totalCbmV = 0;

    const sheetItems = isInvoice 
      ? (data.ciItems && data.ciItems.length > 0 ? data.ciItems : data.items)
      : (data.plItems && data.plItems.length > 0 ? data.plItems : data.items);

    sheetItems.forEach((item, index) => {
      ws.getRow(itemRowIdx).height = 20;

      // Base Values
      ws.getCell(`A${itemRowIdx}`).value = index + 1;
      ws.getCell(`A${itemRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getCell(`B${itemRowIdx}`).value = item.name;
      ws.getCell(`B${itemRowIdx}`).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

      if (isInvoice) {
        ws.getCell(`C${itemRowIdx}`).value = item.hsCode || '-';
        ws.getCell(`C${itemRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getCell(`D${itemRowIdx}`).value = item.qty;
        ws.getCell(`D${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`D${itemRowIdx}`).numFmt = '#,##0';

        ws.getCell(`E${itemRowIdx}`).value = item.unit;
        ws.getCell(`E${itemRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

        ws.getCell(`F${itemRowIdx}`).value = item.unitPrice;
        ws.getCell(`F${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`F${itemRowIdx}`).numFmt = '$#,##0.00';

        ws.mergeCells(`G${itemRowIdx}:H${itemRowIdx}`);
        ws.getCell(`G${itemRowIdx}`).value = item.amount;
        ws.getCell(`G${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`G${itemRowIdx}`).numFmt = '$#,##0.00';

        totalQtySum += item.qty;
        totalAmountSum += item.amount;
      } else {
        const pkgs = item.packagesCount || item.qty;
        ws.mergeCells(`C${itemRowIdx}:D${itemRowIdx}`);
        ws.getCell(`C${itemRowIdx}`).value = `${pkgs} ${item.packageType || 'Pallet'} (${item.qty} ${item.unit})`;
        ws.getCell(`C${itemRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells(`E${itemRowIdx}:F${itemRowIdx}`);
        ws.getCell(`E${itemRowIdx}`).value = item.netWeight || 0;
        ws.getCell(`E${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`E${itemRowIdx}`).numFmt = '#,##0.00';

        ws.getCell(`G${itemRowIdx}`).value = item.grossWeight || 0;
        ws.getCell(`G${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`G${itemRowIdx}`).numFmt = '#,##0.00';

        ws.getCell(`H${itemRowIdx}`).value = item.cbm || 0;
        ws.getCell(`H${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
        ws.getCell(`H${itemRowIdx}`).numFmt = '#,##0.000';

        totalPkgsSum += pkgs;
        totalNetW += item.netWeight || 0;
        totalGrossW += item.grossWeight || 0;
        totalCbmV += item.cbm || 0;
      }

      // Apply borders to line item columns
      for (let c = 1; c <= 8; c++) {
        ws.getCell(itemRowIdx, c).border = {
          bottom: thinBorder,
          left: thinBorder,
          right: thinBorder
        };
        ws.getCell(itemRowIdx, c).font = { name: 'Arial', size: 9 };
      }

      itemRowIdx++;
    });

    // Total Summary Row
    ws.getRow(itemRowIdx).height = 22;
    if (isInvoice) {
      ws.mergeCells(`A${itemRowIdx}:C${itemRowIdx}`);
      ws.getCell(`A${itemRowIdx}`).value = 'TOTAL AMOUNT';
      ws.getCell(`A${itemRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.getCell(`D${itemRowIdx}`).value = totalQtySum;
      ws.getCell(`D${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`D${itemRowIdx}`).numFmt = '#,##0';

      ws.getCell(`E${itemRowIdx}`).value = '';

      ws.getCell(`F${itemRowIdx}`).value = '';

      ws.mergeCells(`G${itemRowIdx}:H${itemRowIdx}`);
      ws.getCell(`G${itemRowIdx}`).value = totalAmountSum;
      ws.getCell(`G${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`G${itemRowIdx}`).numFmt = '$#,##0.00';
    } else {
      ws.mergeCells(`A${itemRowIdx}:B${itemRowIdx}`);
      ws.getCell(`A${itemRowIdx}`).value = 'TOTAL SUMMARY';
      ws.getCell(`A${itemRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`C${itemRowIdx}:D${itemRowIdx}`);
      ws.getCell(`C${itemRowIdx}`).value = `${totalPkgsSum} Pallets`;
      ws.getCell(`C${itemRowIdx}`).alignment = { horizontal: 'center', vertical: 'middle' };

      ws.mergeCells(`E${itemRowIdx}:F${itemRowIdx}`);
      ws.getCell(`E${itemRowIdx}`).value = totalNetW;
      ws.getCell(`E${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`E${itemRowIdx}`).numFmt = '#,##0.00';

      ws.getCell(`G${itemRowIdx}`).value = totalGrossW;
      ws.getCell(`G${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`G${itemRowIdx}`).numFmt = '#,##0.00';

      ws.getCell(`H${itemRowIdx}`).value = totalCbmV;
      ws.getCell(`H${itemRowIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
      ws.getCell(`H${itemRowIdx}`).numFmt = '#,##0.000';
    }

    // Styles for Total Summary
    for (let c = 1; c <= 8; c++) {
      const cell = ws.getCell(itemRowIdx, c);
      cell.font = { name: 'Arial', size: 9.5, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.border = {
        top: thickBorder,
        bottom: doubleBorder,
        left: thinBorder,
        right: thinBorder
      };
    }

    itemRowIdx += 2;

    // HS Codes clause for CI
    if (isInvoice) {
      ws.getRow(itemRowIdx).height = 15;
      ws.mergeCells(`A${itemRowIdx}:H${itemRowIdx}`);
      ws.getCell(`A${itemRowIdx}`).value = 'A) RELEVANT HARMONIZED SYSTEM COMMODITY CODE NUMBER(S) APPLICABLE TO EACH ITEM SHIPPED:';
      ws.getCell(`A${itemRowIdx}`).font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF475569' } };
      itemRowIdx++;

      ws.getRow(itemRowIdx).height = 15;
      ws.mergeCells(`A${itemRowIdx}:H${itemRowIdx}`);
      const hsCodesText = data.items.map(it => `${it.name}: ${it.hsCode || 'N/A'}`).join(', ');
      ws.getCell(`A${itemRowIdx}`).value = hsCodesText;
      ws.getCell(`A${itemRowIdx}`).font = { name: 'Arial', size: 8.5 };
      itemRowIdx += 2;
    }

    // Signature Area
    ws.getRow(itemRowIdx).height = 15;
    ws.mergeCells(`F${itemRowIdx}:H${itemRowIdx}`);
    ws.getCell(`F${itemRowIdx}`).value = 'Signed by:';
    ws.getCell(`F${itemRowIdx}`).font = { name: 'Arial', size: 9, bold: true };
    ws.getCell(`F${itemRowIdx}`).alignment = { horizontal: 'center' };
    itemRowIdx++;

    ws.getRow(itemRowIdx).height = 20;
    ws.mergeCells(`F${itemRowIdx}:H${itemRowIdx}`);
    ws.getCell(`F${itemRowIdx}`).value = '';
    ws.getCell(`F${itemRowIdx}`).border = { bottom: thinBorder };
    itemRowIdx++;

    ws.getRow(itemRowIdx).height = 15;
    ws.mergeCells(`F${itemRowIdx}:H${itemRowIdx}`);
    ws.getCell(`F${itemRowIdx}`).value = companyName;
    ws.getCell(`F${itemRowIdx}`).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF1E3A8A' } };
    ws.getCell('F' + itemRowIdx).alignment = { horizontal: 'center' };
  };

  buildSheet('Commercial Invoice', true);
  buildSheet('Packing List', false);

  // Write and Save
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `CI_PL_${data.invoiceNo || data.orderId}.xlsx`);
};
