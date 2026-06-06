import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { ProformaInvoice, PIItem } from '../types/pi';

export const generatePIExcel = async (piData: Partial<ProformaInvoice>, items: PIItem[]) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Proforma Invoice');

  // Page setup
  worksheet.pageSetup.paperSize = 9; // A4
  worksheet.pageSetup.orientation = 'portrait';
  worksheet.pageSetup.fitToPage = true;
  worksheet.pageSetup.fitToWidth = 1;
  worksheet.pageSetup.fitToHeight = 0;
  worksheet.pageSetup.margins = {
    left: 0.3, right: 0.3,
    top: 0.4, bottom: 0.4,
    header: 0.0, footer: 0.0
  };

  // Columns: A(No), B(Description), C(Qty), D(Unit), E(Unit Price), F(Total), G(Remarks)
  worksheet.columns = [
    { width: 5 },   // A
    { width: 35 },  // B
    { width: 10 },  // C
    { width: 8 },   // D
    { width: 14 },  // E
    { width: 16 },  // F
    { width: 22 },  // G
  ];

  let currentRow = 1;

  // 1. Letterhead / Company Info
  const isYS = piData.issuingCompany === 'YS';

  try {
    const logoUrl = isYS ? '/letterhead_ys.png' : '/letterhead_ysacc.png';
    const response = await fetch(logoUrl);
    const arrayBuffer = await response.arrayBuffer();
    
    const imageId = workbook.addImage({
      buffer: arrayBuffer,
      extension: 'png',
    });
    
    // Add image spanning rows 1 to 4 (columns A to G)
    worksheet.addImage(imageId, 'A1:G4');
    
    // Set heights for the rows to make space for the image
    worksheet.getRow(1).height = 20;
    worksheet.getRow(2).height = 20;
    worksheet.getRow(3).height = 20;
    worksheet.getRow(4).height = 25;
    
    // Add red border line at the bottom of the letterhead area
    worksheet.mergeCells(`A4:G4`);
    worksheet.getCell('A4').border = { bottom: { style: 'thick', color: { argb: 'FFB91C1C' } } };
    
  } catch (e) {
    console.error("Failed to load letterhead image for Excel:", e);
    // Fallback to text
    const issuerName = isYS ? "YS ACC" : "YSACC CO., LTD.";
    const issuerAddress = "111-201, 76, Wolmyeong-ro, Heungdeok-gu, Cheongju-si, Chungcheongbuk-do, 28589, Korea";
    const issuerContact = "Tel: +82-50-7081-1130   Fax: +82-503-0464-1130   www.ysacc.co.kr";

    worksheet.mergeCells(`A1:G1`);
    const titleRow = worksheet.getRow(1);
    titleRow.getCell(1).value = issuerName;
    titleRow.getCell(1).font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1F4E78' } };
    titleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'bottom' };
    titleRow.height = 25;

    worksheet.mergeCells(`A2:G2`);
    const addrRow = worksheet.getRow(2);
    addrRow.getCell(1).value = issuerAddress;
    addrRow.getCell(1).font = { name: 'Arial', size: 9, color: { argb: 'FF475569' } };

    worksheet.mergeCells(`A3:G3`);
    const contactRow = worksheet.getRow(3);
    contactRow.getCell(1).value = issuerContact;
    contactRow.getCell(1).font = { name: 'Arial', size: 9, color: { argb: 'FF475569' } };
    contactRow.getCell(1).border = { bottom: { style: 'thick', color: { argb: 'FFB91C1C' } } };
  }

  currentRow = 6;

  // 2. Title: PROFORMA INVOICE
  worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
  const piTitleRow = worksheet.getRow(currentRow);
  piTitleRow.getCell(1).value = "PROFORMA INVOICE";
  piTitleRow.getCell(1).font = { name: 'Arial', size: 22, bold: true, color: { argb: 'FF1F4E78' } };
  piTitleRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
  currentRow += 2;

  // 3. BILL TO & Metadata
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
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF0F172A' } };
  
  // YOUR REF.
  worksheet.getCell(`E${currentRow}`).value = "YOUR REF.";
  worksheet.getCell(`E${currentRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
  worksheet.getCell(`E${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getCell(`E${currentRow}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  worksheet.mergeCells(`F${currentRow}:G${currentRow}`);
  worksheet.getCell(`F${currentRow}`).value = piData.yourRef || '-';
  worksheet.getCell(`F${currentRow}`).font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell(`F${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getCell(`F${currentRow}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  currentRow++;

  // Address
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = `Address: ${(piData as any).customerAddress || '-'}`;
  worksheet.getCell(`A${currentRow}`).font = { size: 9, color: { argb: 'FF334155' } };
  
  // DATE
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

  // Attn
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = `Attn: ${piData.contactPerson || '-'}`;
  worksheet.getCell(`A${currentRow}`).font = { size: 9, color: { argb: 'FF334155' } };

  // VALID UNTIL
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

  // Email
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = `Email: ${piData.email || '-'}`;
  worksheet.getCell(`A${currentRow}`).font = { size: 9, color: { argb: 'FF334155' } };
  currentRow += 2;

  // 4. TRADE TERMS
  worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "TRADE TERMS";
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFD97706' } };
  currentRow++;

  const applyTermsStyle = (row: number, c1: string, v1: string, c2: string, v2: string) => {
    worksheet.mergeCells(`B${row}:D${row}`);
    worksheet.mergeCells(`F${row}:G${row}`);
    
    worksheet.getCell(`A${row}`).value = c1;
    worksheet.getCell(`A${row}`).font = { bold: true, size: 9, color: { argb: 'FF475569' } };
    worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    worksheet.getCell(`A${row}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    
    worksheet.getCell(`B${row}`).value = v1;
    worksheet.getCell(`B${row}`).font = { size: 9 };
    worksheet.getCell(`B${row}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    
    worksheet.getCell(`E${row}`).value = c2;
    worksheet.getCell(`E${row}`).font = { bold: true, size: 9, color: { argb: 'FF475569' } };
    worksheet.getCell(`E${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    worksheet.getCell(`E${row}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    
    worksheet.getCell(`F${row}`).value = v2;
    worksheet.getCell(`F${row}`).font = { size: 9 };
    worksheet.getCell(`F${row}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  };

  applyTermsStyle(currentRow, "Incoterms", piData.incoterms || '-', "Destination", piData.destinationPort || '-');
  currentRow++;
  applyTermsStyle(currentRow, "Departure Port", piData.departurePort || '-', "Shipping", piData.shippingMethod || '-');
  currentRow++;
  applyTermsStyle(currentRow, "Payment Terms", piData.paymentTerms || '-', "Packaging", piData.packagingSpec || '-');
  currentRow++;
  applyTermsStyle(currentRow, "Delivery Term", piData.deliveryTerm || '-', "Origin", piData.origin || '-');
  currentRow += 2;

  // 5. LINE ITEMS
  worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "LINE ITEMS";
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
  currentRow++;

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
  headerRow.height = 22;
  currentRow++;

  let subtotal = 0;
  if (!items || items.length === 0) {
    worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
    const row = worksheet.getRow(currentRow);
    row.getCell(1).value = "No items";
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(1).font = { color: { argb: 'FF9CA3AF' } };
    for(let i=1; i<=7; i++) {
      row.getCell(i).border = { top: {style:'thin', color: {argb:'FFCBD5E1'}}, left: {style:'thin', color: {argb:'FFCBD5E1'}}, bottom: {style:'thin', color: {argb:'FFCBD5E1'}}, right: {style:'thin', color: {argb:'FFCBD5E1'}} };
    }
    currentRow++;
  } else {
    items.forEach((item, index) => {
      const row = worksheet.getRow(currentRow);
      row.getCell(1).value = index + 1;
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      
      row.getCell(2).value = item.description || '';
      row.getCell(2).alignment = { vertical: 'middle', wrapText: true };
      
      row.getCell(3).value = item.quantity || 0;
      row.getCell(3).numFmt = '#,##0';
      row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
      
      row.getCell(4).value = item.unit || '';
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      
      row.getCell(5).value = item.salePriceUsd || 0;
      row.getCell(5).numFmt = '"$"#,##0.00';
      row.getCell(5).alignment = { vertical: 'middle' };
      
      row.getCell(6).value = item.lineTotalUsd || 0;
      row.getCell(6).numFmt = '"$"#,##0.00';
      row.getCell(6).font = { bold: true };
      row.getCell(6).alignment = { vertical: 'middle' };
      
      row.getCell(7).value = item.remarks || '';
      row.getCell(7).font = { size: 9, color: { argb: 'FF64748B' } };
      row.getCell(7).alignment = { vertical: 'middle', wrapText: true };

      // Apply borders
      for(let i=1; i<=7; i++) {
        row.getCell(i).border = { top: {style:'thin', color: {argb:'FFCBD5E1'}}, left: {style:'thin', color: {argb:'FFCBD5E1'}}, bottom: {style:'thin', color: {argb:'FFCBD5E1'}}, right: {style:'thin', color: {argb:'FFCBD5E1'}} };
      }
      
      // Auto row height approximation (basic)
      row.height = 20; 
      subtotal += (item.lineTotalUsd || 0);
      currentRow++;
    });
  }

  currentRow++;

  // 6. FREIGHT CHARGES
  let freightTotal = 0;
  if (piData.freightCharges && piData.freightCharges.length > 0) {
    worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = "FREIGHT CHARGES";
    worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
    currentRow++;

    // Freight Headers
    const fHeaders = ['CONTAINER TYPE', '', 'QTY', '', 'UNIT PRICE', 'TOTAL (USD)', 'REMARKS'];
    worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
    worksheet.mergeCells(`C${currentRow}:D${currentRow}`);
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
    fHeaderRow.getCell(2).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    fHeaderRow.getCell(4).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    fHeaderRow.height = 20;
    currentRow++;

    // Freight Data
    piData.freightCharges.forEach(fc => {
      worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
      worksheet.mergeCells(`C${currentRow}:D${currentRow}`);
      const row = worksheet.getRow(currentRow);
      
      row.getCell(1).value = fc.type || '-';
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      
      row.getCell(3).value = fc.qty || 0;
      row.getCell(3).numFmt = '#,##0';
      row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      
      row.getCell(5).value = fc.price || 0;
      row.getCell(5).numFmt = '"$"#,##0.00';
      row.getCell(5).alignment = { vertical: 'middle' };
      
      const total = (fc.qty || 0) * (fc.price || 0);
      row.getCell(6).value = total;
      row.getCell(6).numFmt = '"$"#,##0.00';
      row.getCell(6).font = { bold: true };
      row.getCell(6).alignment = { vertical: 'middle' };
      
      row.getCell(7).value = fc.remarks || '';
      row.getCell(7).font = { size: 9, color: { argb: 'FF64748B' } };
      row.getCell(7).alignment = { vertical: 'middle', wrapText: true };

      for(let i=1; i<=7; i++) {
        row.getCell(i).border = { top: {style:'thin', color: {argb:'FFCBD5E1'}}, left: {style:'thin', color: {argb:'FFCBD5E1'}}, bottom: {style:'thin', color: {argb:'FFCBD5E1'}}, right: {style:'thin', color: {argb:'FFCBD5E1'}} };
      }
      row.height = 20;
      freightTotal += total;
      currentRow++;
    });
    currentRow++;
  }

  // 7. TOTALS Table
  const grandTotal = subtotal + freightTotal + (piData.insurance || 0);
  
  worksheet.mergeCells(`D${currentRow}:E${currentRow}`);
  worksheet.getCell(`D${currentRow}`).value = "Subtotal (USD):";
  worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getCell(`D${currentRow}`).font = { color: { argb: 'FF64748B' }, size: 9 };
  worksheet.getCell(`F${currentRow}`).value = subtotal;
  worksheet.getCell(`F${currentRow}`).numFmt = '"$"#,##0.00';
  worksheet.getCell(`F${currentRow}`).font = { bold: true, color: { argb: 'FF1E293B' }, size: 10 };
  worksheet.getCell(`F${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  currentRow++;

  if (freightTotal > 0) {
    worksheet.mergeCells(`D${currentRow}:E${currentRow}`);
    worksheet.getCell(`D${currentRow}`).value = "Freight Total (USD):";
    worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
    worksheet.getCell(`D${currentRow}`).font = { color: { argb: 'FF64748B' }, size: 9 };
    worksheet.getCell(`F${currentRow}`).value = freightTotal;
    worksheet.getCell(`F${currentRow}`).numFmt = '"$"#,##0.00';
    worksheet.getCell(`F${currentRow}`).font = { bold: true, color: { argb: 'FF1E293B' }, size: 10 };
    worksheet.getCell(`F${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
    currentRow++;
  }

  if ((piData.insurance || 0) > 0) {
    worksheet.mergeCells(`D${currentRow}:E${currentRow}`);
    worksheet.getCell(`D${currentRow}`).value = "Insurance (USD):";
    worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
    worksheet.getCell(`D${currentRow}`).font = { color: { argb: 'FF64748B' }, size: 9 };
    worksheet.getCell(`F${currentRow}`).value = piData.insurance || 0;
    worksheet.getCell(`F${currentRow}`).numFmt = '"$"#,##0.00';
    worksheet.getCell(`F${currentRow}`).font = { bold: true, color: { argb: 'FF1E293B' }, size: 10 };
    worksheet.getCell(`F${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
    currentRow++;
  }

  worksheet.mergeCells(`D${currentRow}:E${currentRow}`);
  worksheet.getCell(`D${currentRow}`).value = "GRAND TOTAL (USD):";
  worksheet.getCell(`D${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getCell(`D${currentRow}`).font = { size: 11, bold: true, color: { argb: 'FF000000' } };
  worksheet.getCell(`D${currentRow}`).border = { top: { style: 'medium', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'medium', color: { argb: 'FFCBD5E1' } } };
  
  worksheet.mergeCells(`F${currentRow}:G${currentRow}`);
  worksheet.getCell(`F${currentRow}`).value = grandTotal;
  worksheet.getCell(`F${currentRow}`).numFmt = '"$"#,##0.00';
  worksheet.getCell(`F${currentRow}`).font = { size: 12, bold: true, color: { argb: 'FFB91C1C' } };
  worksheet.getCell(`F${currentRow}`).alignment = { horizontal: 'left', vertical: 'middle' };
  worksheet.getCell(`F${currentRow}`).border = { top: { style: 'medium', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'medium', color: { argb: 'FFCBD5E1' } } };
  worksheet.getRow(currentRow).height = 25;
  currentRow += 2;

  // 8. REMARKS (Red border box)
  worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "REMARKS";
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
  currentRow++;

  let remarkLines = ["① This is a basic price. Prices are subject to change based on your additional requests.", "② Shipping cost may vary monthly depending on the carrier's current conditions."];
  if (piData.remarks !== undefined && piData.remarks !== null) {
    remarkLines = piData.remarks ? piData.remarks.split('\n') : [];
  }

  const remarksStartRow = currentRow;
  remarkLines.forEach(line => {
    worksheet.mergeCells(`A${currentRow}:G${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = line;
    worksheet.getCell(`A${currentRow}`).font = { size: 9, color: { argb: 'FF334155' } };
    currentRow++;
  });
  
  // Apply red border around remarks
  const remarksEndRow = currentRow - 1;
  for (let r = remarksStartRow; r <= remarksEndRow; r++) {
    if (r === remarksStartRow) {
      for(let c=1; c<=7; c++) worksheet.getCell(r, c).border = { top: {style: 'thin', color: {argb: 'FFFCA5A5'}} };
    }
    if (r === remarksEndRow) {
      for(let c=1; c<=7; c++) worksheet.getCell(r, c).border = { ...worksheet.getCell(r, c).border, bottom: {style: 'thin', color: {argb: 'FFFCA5A5'}} };
    }
    worksheet.getCell(`A${r}`).border = { ...worksheet.getCell(`A${r}`).border, left: {style: 'thin', color: {argb: 'FFFCA5A5'}} };
    worksheet.getCell(`G${r}`).border = { ...worksheet.getCell(`G${r}`).border, right: {style: 'thin', color: {argb: 'FFFCA5A5'}} };
  }
  
  currentRow += 2;

  // 9. BANK DETAILS & SIGNATURES (Side by side)
  // Left: BANK DETAILS (A to D)
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "BANK DETAILS";
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFD97706' } };
  
  // Right: SIGNATURES (F to G)
  worksheet.mergeCells(`F${currentRow}:G${currentRow}`);
  worksheet.getCell(`F${currentRow}`).value = "SIGNATURES";
  worksheet.getCell(`F${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
  worksheet.getCell(`F${currentRow}`).alignment = { horizontal: 'right' };
  currentRow++;

  const startBankRow = currentRow;
  const writeBank = (lbl: string, val: string, r: number) => {
    worksheet.getCell(`A${r}`).value = lbl;
    worksheet.getCell(`A${r}`).font = { bold: true, size: 9, color: { argb: 'FF475569' } };
    worksheet.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    worksheet.getCell(`A${r}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    
    worksheet.mergeCells(`B${r}:D${r}`);
    worksheet.getCell(`B${r}`).value = val;
    worksheet.getCell(`B${r}`).font = { size: 9, bold: true };
    worksheet.getCell(`B${r}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    worksheet.getCell(`C${r}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    worksheet.getCell(`D${r}`).border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  };

  const bankName = "INDUSTRIAL BANK OF KOREA, SEOUL,KOREA";
  const bankAddress = "50, ULCHIRO 2-GA, CHUNG-GU, SEOUL, 100-758, SOUTH KOREA";
  const beneficiary = isYS ? "YS ACC" : "YSACC Co.,LTD";
  const bankAccountNo = isYS ? "940-013901-56-00011" : "143-129260-56-00012";
  const swiftCode = isYS ? "IBKOKRSE" : "IBKOKRSEXXX";
  const beneficiaryAddress = isYS 
    ? "111-201, 76, Wolmyeong-ro, Heungdeok-gu, Cheongju-si, Chungcheongbuk-do, 28589, Korea" 
    : "201-1HO, 1251, GAROSU-RO, HEUNGDEOK-GU, CHEONGJU-SI, CHUNGCHEONGBUK-DO, 28420, SOUTH KOREA";

  writeBank("Bank Name", bankName, currentRow); currentRow++;
  
  writeBank("Bank Address", bankAddress, currentRow); 
  worksheet.getRow(currentRow).height = 25; // multi-line address space
  worksheet.getCell(`B${currentRow}`).alignment = { wrapText: true, vertical: 'middle' };
  currentRow++;
  
  writeBank("Beneficiary", beneficiary, currentRow); currentRow++;
  
  writeBank("Beneficiary Addr", beneficiaryAddress, currentRow); 
  worksheet.getRow(currentRow).height = 25; // multi-line address space
  worksheet.getCell(`B${currentRow}`).alignment = { wrapText: true, vertical: 'middle' };
  currentRow++;
  
  writeBank("Account No.", bankAccountNo, currentRow); currentRow++;
  writeBank("SWIFT Code", swiftCode, currentRow); 

  // Add Signatures on the right side of the bank details
  const sigStartRow = startBankRow;
  
  // Buyer Signature Box (F)
  worksheet.mergeCells(`F${sigStartRow}:F${sigStartRow+5}`);
  const buyerBox = worksheet.getCell(`F${sigStartRow}`);
  buyerBox.value = "CONSIGNEE (BUYER)\n\n\n\n\nAuthorized Signature";
  buyerBox.font = { size: 8, color: { argb: 'FF94A3B8' } };
  buyerBox.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
  buyerBox.border = { top: {style:'thin', color: {argb:'FFCBD5E1'}}, left: {style:'thin', color: {argb:'FFCBD5E1'}}, bottom: {style:'thin', color: {argb:'FFCBD5E1'}}, right: {style:'thin', color: {argb:'FFCBD5E1'}} };
  buyerBox.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8F8' } };

  // Seller Signature Box (G)
  worksheet.mergeCells(`G${sigStartRow}:G${sigStartRow+5}`);
  const sellerBox = worksheet.getCell(`G${sigStartRow}`);
  sellerBox.value = `${isYS ? 'YS ACC' : 'YSACC CO., LTD.'} (SELLER)\n\n\n\n\nAuthorized Signature`;
  sellerBox.font = { size: 8, color: { argb: 'FF94A3B8' } };
  sellerBox.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
  sellerBox.border = { top: {style:'thin', color: {argb:'FFCBD5E1'}}, left: {style:'thin', color: {argb:'FFCBD5E1'}}, bottom: {style:'thin', color: {argb:'FFCBD5E1'}}, right: {style:'thin', color: {argb:'FFCBD5E1'}} };
  sellerBox.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
  
  // Add signature image to G column over the seller signature box
  try {
    const sigResponse = await fetch('/signature.png');
    const sigArrayBuffer = await sigResponse.arrayBuffer();
    const sigImageId = workbook.addImage({
      buffer: sigArrayBuffer,
      extension: 'png'
    });
    // Column G is 0-indexed index 6. We place the image to hover inside cell G[sigStartRow+1.5]
    worksheet.addImage(sigImageId, {
      tl: { col: 6.2, row: sigStartRow + 1.2 },
      ext: { width: 110, height: 50 },
      editAs: 'absolute'
    });
  } catch (e) {
    console.error("Failed to load signature image for Excel:", e);
  }
  
  // Write to file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${piData.piNumber || 'PI'}_${piData.customerName || 'Customer'}.xlsx`);
};
