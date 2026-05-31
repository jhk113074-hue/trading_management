import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { ProformaInvoice, PIItem } from '../types/pi';

export const generatePIExcel = async (piData: Partial<ProformaInvoice>, items: PIItem[]) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Proforma Invoice');

  // Page setup
  worksheet.pageSetup.paperSize = 9; // A4
  worksheet.pageSetup.orientation = 'portrait';
  worksheet.pageSetup.margins = {
    left: 0.5, right: 0.5,
    top: 0.5, bottom: 0.5,
    header: 0.3, footer: 0.3
  };

  // Columns: A(No), B(Description), C(Qty), D(Unit), E(Unit Price), F(Total), G(Remarks)
  worksheet.columns = [
    { width: 5 },  // A
    { width: 45 }, // B
    { width: 12 }, // C
    { width: 8 },  // D
    { width: 15 }, // E
    { width: 15 }, // F
    { width: 25 }, // G
  ];

  let currentRow = 1;

  // Add Company Name Header
  const issuerName = piData.issuingCompany === 'YS' 
    ? "영성ACC(Young Seong ACC)" 
    : "(주)와이에스에이씨씨(YS ACC Co.,Ltd.)";
  
  worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
  const titleRow = worksheet.getRow(currentRow);
  titleRow.getCell(1).value = issuerName;
  titleRow.getCell(1).font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1F4E78' } };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  titleRow.height = 30;
  currentRow += 2;

  // Title: PROFORMA INVOICE
  worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
  const piTitleRow = worksheet.getRow(currentRow);
  piTitleRow.getCell(1).value = "PROFORMA INVOICE";
  piTitleRow.getCell(1).font = { name: 'Arial', size: 24, bold: true, color: { argb: 'FF1F4E78' } };
  piTitleRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
  currentRow += 2;

  // BILL TO
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  const billToTitle = worksheet.getRow(currentRow);
  billToTitle.getCell(1).value = "BILL TO";
  billToTitle.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFB91C1C' } };

  // Metadata Table Headers (Right side)
  worksheet.getCell(`E${currentRow}`).value = "INVOICE NO.";
  worksheet.getCell(`E${currentRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
  worksheet.getCell(`E${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getCell(`E${currentRow}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  worksheet.mergeCells(`F${currentRow}:G${currentRow}`);
  const piNumCell = worksheet.getCell(`F${currentRow}`);
  let piNumStr = piData.piNumber || '-';
  if (piData.currentVersion && piData.currentVersion > 1) {
    piNumStr += ` R${piData.currentVersion - 1}`;
  }
  piNumCell.value = piNumStr;
  piNumCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
  piNumCell.alignment = { horizontal: 'center', vertical: 'middle' };
  piNumCell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  currentRow++;

  // Customer Name
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = piData.customerName || '-';
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 12, bold: true };
  
  worksheet.getCell(`E${currentRow}`).value = "DATE";
  worksheet.getCell(`E${currentRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
  worksheet.getCell(`E${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getCell(`E${currentRow}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  worksheet.mergeCells(`F${currentRow}:G${currentRow}`);
  worksheet.getCell(`F${currentRow}`).value = piData.piDate || '-';
  worksheet.getCell(`F${currentRow}`).font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell(`F${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getCell(`F${currentRow}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  currentRow++;

  // Address
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = `Address: ${(piData as any).customerAddress || '-'}`;
  
  worksheet.getCell(`E${currentRow}`).value = "VALID UNTIL";
  worksheet.getCell(`E${currentRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
  worksheet.getCell(`E${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getCell(`E${currentRow}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  worksheet.mergeCells(`F${currentRow}:G${currentRow}`);
  worksheet.getCell(`F${currentRow}`).value = piData.validUntilDate || '-';
  worksheet.getCell(`F${currentRow}`).font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell(`F${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getCell(`F${currentRow}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  currentRow++;

  // Attn
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = `Attn: ${piData.contactPerson || '-'}`;
  currentRow++;

  // Email
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = `Email: ${piData.email || '-'}`;
  currentRow += 2;

  // TRADE TERMS
  worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "TRADE TERMS";
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFD97706' } };
  currentRow++;

  const applyTermsStyle = (row: number, c1: string, v1: string, c2: string, v2: string) => {
    worksheet.mergeCells(`B${row}:C${row}`);
    worksheet.mergeCells(`E${row}:G${row}`);
    
    worksheet.getCell(`A${row}`).value = c1;
    worksheet.getCell(`A${row}`).font = { bold: true, size: 9, color: { argb: 'FF475569' } };
    worksheet.getCell(`B${row}`).value = v1;
    worksheet.getCell(`B${row}`).font = { size: 9 };
    
    worksheet.getCell(`D${row}`).value = c2;
    worksheet.getCell(`D${row}`).font = { bold: true, size: 9, color: { argb: 'FF475569' } };
    worksheet.getCell(`E${row}`).value = v2;
    worksheet.getCell(`E${row}`).font = { size: 9 };
  };

  applyTermsStyle(currentRow, "Incoterms", piData.incoterms || '-', "Destination", piData.destinationPort || '-');
  currentRow++;
  applyTermsStyle(currentRow, "Departure Port", piData.departurePort || '-', "Shipping Method", piData.shippingMethod || '-');
  currentRow++;
  applyTermsStyle(currentRow, "Payment Terms", piData.paymentTerms || '-', "Packaging Spec.", piData.packagingSpec || '-');
  currentRow += 2;

  // LINE ITEMS Header
  const headers = ['NO', 'DESCRIPTION', 'QTY', 'UNIT', 'UNIT PRICE', 'TOTAL (USD)', 'REMARKS'];
  const headerRow = worksheet.getRow(currentRow);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });
  headerRow.height = 20;
  currentRow++;

  // LINE ITEMS Data
  let subtotal = 0;
  items.forEach((item, index) => {
    const row = worksheet.getRow(currentRow);
    row.getCell(1).value = index + 1;
    row.getCell(1).alignment = { horizontal: 'center' };
    
    row.getCell(2).value = item.description || '';
    row.getCell(3).value = item.quantity || 0;
    row.getCell(3).numFmt = '#,##0';
    
    row.getCell(4).value = item.unit || '';
    row.getCell(4).alignment = { horizontal: 'center' };
    
    row.getCell(5).value = item.salePriceUsd || 0;
    row.getCell(5).numFmt = '"$"#,##0.00';
    
    row.getCell(6).value = item.lineTotalUsd || 0;
    row.getCell(6).numFmt = '"$"#,##0.00';
    row.getCell(6).font = { bold: true };
    
    row.getCell(7).value = item.remarks || '';
    row.getCell(7).font = { italic: true, color: { argb: 'FF64748B' } };

    // Apply borders to all cells
    for(let i=1; i<=7; i++) {
      row.getCell(i).border = { top: {style:'thin', color: {argb:'FFCBD5E1'}}, left: {style:'thin', color: {argb:'FFCBD5E1'}}, bottom: {style:'thin', color: {argb:'FFCBD5E1'}}, right: {style:'thin', color: {argb:'FFCBD5E1'}} };
    }
    
    subtotal += (item.lineTotalUsd || 0);
    currentRow++;
  });

  currentRow++;

  // FREIGHT CHARGES
  let freightTotal = 0;
  if (piData.freightCharges && piData.freightCharges.length > 0) {
    worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = "FREIGHT CHARGES";
    worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
    currentRow++;

    // Freight Headers
    const fHeaders = ['CONTAINER TYPE', '', 'QTY', 'UNIT PRICE', 'TOTAL (USD)', 'REMARKS', ''];
    worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
    worksheet.mergeCells(`F${currentRow}:G${currentRow}`);
    const fHeaderRow = worksheet.getRow(currentRow);
    fHeaders.forEach((h, i) => {
      if(h !== '') {
        const cell = fHeaderRow.getCell(i + 1);
        cell.value = h;
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      }
    });
    // apply borders to merged cells
    fHeaderRow.getCell(2).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    fHeaderRow.getCell(7).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    currentRow++;

    // Freight Data
    piData.freightCharges.forEach(fc => {
      worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
      worksheet.mergeCells(`F${currentRow}:G${currentRow}`);
      const row = worksheet.getRow(currentRow);
      
      row.getCell(1).value = fc.type || '-';
      row.getCell(1).alignment = { horizontal: 'center' };
      
      row.getCell(3).value = fc.qty || 0;
      row.getCell(3).numFmt = '#,##0';
      row.getCell(3).alignment = { horizontal: 'center' };
      
      row.getCell(4).value = fc.price || 0;
      row.getCell(4).numFmt = '"$"#,##0.00';
      
      const total = (fc.qty || 0) * (fc.price || 0);
      row.getCell(5).value = total;
      row.getCell(5).numFmt = '"$"#,##0.00';
      row.getCell(5).font = { bold: true };
      
      row.getCell(6).value = fc.remarks || '';
      row.getCell(6).font = { italic: true, color: { argb: 'FF64748B' } };

      for(let i=1; i<=7; i++) {
        row.getCell(i).border = { top: {style:'thin', color: {argb:'FFCBD5E1'}}, left: {style:'thin', color: {argb:'FFCBD5E1'}}, bottom: {style:'thin', color: {argb:'FFCBD5E1'}}, right: {style:'thin', color: {argb:'FFCBD5E1'}} };
      }
      freightTotal += total;
      currentRow++;
    });
    currentRow++;
  }

  // TOTALS Table
  const grandTotal = subtotal + freightTotal + (piData.insurance || 0);
  
  worksheet.mergeCells(`D${currentRow}:E${currentRow}`);
  worksheet.getCell(`D${currentRow}`).value = "Subtotal:";
  worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
  worksheet.getCell(`D${currentRow}`).font = { color: { argb: 'FF475569' } };
  worksheet.getCell(`F${currentRow}`).value = subtotal;
  worksheet.getCell(`F${currentRow}`).numFmt = '"$"#,##0.00';
  worksheet.getCell(`F${currentRow}`).font = { bold: true };
  currentRow++;

  if (freightTotal > 0) {
    worksheet.mergeCells(`D${currentRow}:E${currentRow}`);
    worksheet.getCell(`D${currentRow}`).value = "Freight Total:";
    worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
    worksheet.getCell(`D${currentRow}`).font = { color: { argb: 'FF475569' } };
    worksheet.getCell(`F${currentRow}`).value = freightTotal;
    worksheet.getCell(`F${currentRow}`).numFmt = '"$"#,##0.00';
    worksheet.getCell(`F${currentRow}`).font = { bold: true };
    currentRow++;
  }

  if ((piData.insurance || 0) > 0) {
    worksheet.mergeCells(`D${currentRow}:E${currentRow}`);
    worksheet.getCell(`D${currentRow}`).value = "Insurance:";
    worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
    worksheet.getCell(`D${currentRow}`).font = { color: { argb: 'FF475569' } };
    worksheet.getCell(`F${currentRow}`).value = piData.insurance || 0;
    worksheet.getCell(`F${currentRow}`).numFmt = '"$"#,##0.00';
    worksheet.getCell(`F${currentRow}`).font = { bold: true };
    currentRow++;
  }

  worksheet.mergeCells(`D${currentRow}:E${currentRow}`);
  worksheet.getCell(`D${currentRow}`).value = "GRAND TOTAL:";
  worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right' };
  worksheet.getCell(`D${currentRow}`).font = { size: 12, bold: true, color: { argb: 'FF059669' } };
  worksheet.getCell(`F${currentRow}`).value = grandTotal;
  worksheet.getCell(`F${currentRow}`).numFmt = '"$"#,##0.00';
  worksheet.getCell(`F${currentRow}`).font = { size: 12, bold: true, color: { argb: 'FF059669' } };
  currentRow += 2;

  // BANK DETAILS
  worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "BANK DETAILS";
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
  currentRow++;

  worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "Bank Name:";
  worksheet.getCell(`A${currentRow}`).font = { bold: true };
  worksheet.mergeCells(`C${currentRow}:G${currentRow}`);
  worksheet.getCell(`C${currentRow}`).value = "IBK (Industrial Bank of Korea)";
  currentRow++;

  worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "Bank Address:";
  worksheet.getCell(`A${currentRow}`).font = { bold: true };
  worksheet.mergeCells(`C${currentRow}:G${currentRow}`);
  worksheet.getCell(`C${currentRow}`).value = "111-201, 76, Wolmyeong-ro, Heungdeok-gu, Cheongju-si, Chungcheongbuk-do, 28589, Korea";
  currentRow++;

  worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "Account No:";
  worksheet.getCell(`A${currentRow}`).font = { bold: true };
  worksheet.mergeCells(`C${currentRow}:G${currentRow}`);
  worksheet.getCell(`C${currentRow}`).value = "955-010464-04-015";
  currentRow++;

  worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "Beneficiary:";
  worksheet.getCell(`A${currentRow}`).font = { bold: true };
  worksheet.mergeCells(`C${currentRow}:G${currentRow}`);
  worksheet.getCell(`C${currentRow}`).value = piData.issuingCompany === 'YS' ? 'YS ACC' : 'YSACC CO., LTD.';
  currentRow++;

  worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "Swift Code:";
  worksheet.getCell(`A${currentRow}`).font = { bold: true };
  worksheet.mergeCells(`C${currentRow}:G${currentRow}`);
  worksheet.getCell(`C${currentRow}`).value = "KIHOKRPXXXX";
  currentRow += 2;

  // Signatures
  worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "Accepted By (Buyer):";
  worksheet.getCell(`A${currentRow}`).font = { bold: true };

  worksheet.mergeCells(`E${currentRow}:G${currentRow}`);
  worksheet.getCell(`E${currentRow}`).value = "Authorized Signature (Seller):";
  worksheet.getCell(`E${currentRow}`).font = { bold: true };
  currentRow++;

  worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
  worksheet.getCell(`A${currentRow}`).border = { bottom: { style: 'thin' } };
  worksheet.mergeCells(`E${currentRow}:G${currentRow}`);
  worksheet.getCell(`E${currentRow}`).border = { bottom: { style: 'thin' } };

  // Write to file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${piData.piNumber || 'PI'}_${piData.customerName || 'Customer'}.xlsx`);
};
