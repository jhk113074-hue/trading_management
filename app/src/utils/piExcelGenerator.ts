import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
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

  // Columns: A(No), B(Product), C(Spec), D(Qty), E(Unit), F(Unit Price), G(Total), H(Remarks), I(Purchase Cost), J(Expected Profit)
  worksheet.columns = [
    { width: 5 },   // A
    { width: 18 },  // B (Product)
    { width: 22 },  // C (Spec)
    { width: 10 },  // D (Qty)
    { width: 8 },   // E (Unit)
    { width: 14 },  // F (Unit Price)
    { width: 16 },  // G (Total)
    { width: 20 },  // H (Remarks)
    { width: 16 },  // I (Purchase Cost)
    { width: 20 },  // J (Expected Profit)
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
    
    // Add image spanning rows 1 to 4 (columns A to J)
    worksheet.addImage(imageId, 'A1:J4');
    
    // Set heights for the rows to make space for the image
    worksheet.getRow(1).height = 20;
    worksheet.getRow(2).height = 20;
    worksheet.getRow(3).height = 20;
    worksheet.getRow(4).height = 25;
    
    // Add red border line at the bottom of the letterhead area
    worksheet.mergeCells(`A4:J4`);
    worksheet.getCell('A4').border = { bottom: { style: 'thick', color: { argb: 'FFB91C1C' } } };
    
  } catch (e) {
    console.error("Failed to load letterhead image for Excel:", e);
    // Fallback to text
    const issuerName = isYS ? "YS ACC" : "YSACC CO., LTD.";
    const issuerAddress = "111-201, 76, Wolmyeong-ro, Heungdeok-gu, Cheongju-si, Chungcheongbuk-do, 28589, Korea";
    const issuerContact = "Tel: +82-50-7081-1130   Fax: +82-503-0464-1130   www.ysacc.co.kr";

    worksheet.mergeCells(`A1:J1`);
    const titleRow = worksheet.getRow(1);
    titleRow.getCell(1).value = issuerName;
    titleRow.getCell(1).font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF1F4E78' } };
    titleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'bottom' };
    titleRow.height = 25;

    worksheet.mergeCells(`A2:J2`);
    const addrRow = worksheet.getRow(2);
    addrRow.getCell(1).value = issuerAddress;
    addrRow.getCell(1).font = { name: 'Arial', size: 9, color: { argb: 'FF475569' } };

    worksheet.mergeCells(`A3:J3`);
    const contactRow = worksheet.getRow(3);
    contactRow.getCell(1).value = issuerContact;
    contactRow.getCell(1).font = { name: 'Arial', size: 9, color: { argb: 'FF475569' } };
    contactRow.getCell(1).border = { bottom: { style: 'thick', color: { argb: 'FFB91C1C' } } };
  }

  currentRow = 6;

  // 3. BILL TO & Metadata
  // BILL TO Title
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  const billToTitle = worksheet.getCell(`A${currentRow}`);
  billToTitle.value = "BILL TO";
  billToTitle.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFB91C1C' } };

  // Metadata Table Headers (Right side - F to H)
  worksheet.getCell(`F${currentRow}`).value = "INVOICE NO.";
  worksheet.getCell(`F${currentRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
  worksheet.getCell(`F${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  worksheet.getCell(`F${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  
  worksheet.mergeCells(`G${currentRow}:H${currentRow}`);
  const piNumCell = worksheet.getCell(`G${currentRow}`);
  let piNumStr = piData.piNumber || '-';
  if (piData.currentVersion && piData.currentVersion > 1) {
    piNumStr += ` R${piData.currentVersion - 1}`;
  }
  piNumCell.value = piNumStr;
  piNumCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
  piNumCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Apply borders for metadata row 1
  const thinBorder = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFCBD5E1' } };
  worksheet.getCell(`F${currentRow}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
  worksheet.getCell(`G${currentRow}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder };
  worksheet.getCell(`H${currentRow}`).border = { top: thinBorder, bottom: thinBorder, right: thinBorder };

  currentRow++;

  // Customer Name
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = piData.customerName || '-';
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF0F172A' } };
  
  // YOUR REF.
  worksheet.getCell(`F${currentRow}`).value = "YOUR REF.";
  worksheet.getCell(`F${currentRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
  worksheet.getCell(`F${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  worksheet.getCell(`F${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`G${currentRow}:H${currentRow}`);
  worksheet.getCell(`G${currentRow}`).value = piData.yourRef || '-';
  worksheet.getCell(`G${currentRow}`).font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell(`G${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

  // Apply borders for metadata row 2
  worksheet.getCell(`F${currentRow}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
  worksheet.getCell(`G${currentRow}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder };
  worksheet.getCell(`H${currentRow}`).border = { top: thinBorder, bottom: thinBorder, right: thinBorder };

  currentRow++;

  // Address
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = `Address: ${(piData as any).customerAddress || '-'}`;
  worksheet.getCell(`A${currentRow}`).font = { size: 9, color: { argb: 'FF334155' } };
  worksheet.getCell(`A${currentRow}`).alignment = { wrapText: true, vertical: 'top' };
  
  // DATE
  worksheet.getCell(`F${currentRow}`).value = "DATE";
  worksheet.getCell(`F${currentRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
  worksheet.getCell(`F${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  worksheet.getCell(`F${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`G${currentRow}:H${currentRow}`);
  worksheet.getCell(`G${currentRow}`).value = piData.piDate || '-';
  worksheet.getCell(`G${currentRow}`).font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell(`G${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

  // Apply borders for metadata row 3
  worksheet.getCell(`F${currentRow}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
  worksheet.getCell(`G${currentRow}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder };
  worksheet.getCell(`H${currentRow}`).border = { top: thinBorder, bottom: thinBorder, right: thinBorder };

  currentRow++;

  // Attn
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = `Attn: ${piData.contactPerson || '-'}`;
  worksheet.getCell(`A${currentRow}`).font = { size: 9, color: { argb: 'FF334155' } };

  // VALID UNTIL
  worksheet.getCell(`F${currentRow}`).value = "VALID UNTIL";
  worksheet.getCell(`F${currentRow}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF475569' } };
  worksheet.getCell(`F${currentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  worksheet.getCell(`F${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells(`G${currentRow}:H${currentRow}`);
  worksheet.getCell(`G${currentRow}`).value = piData.validUntilDate || '-';
  worksheet.getCell(`G${currentRow}`).font = { name: 'Arial', size: 10, bold: true };
  worksheet.getCell(`G${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

  // Apply borders for metadata row 4
  worksheet.getCell(`F${currentRow}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
  worksheet.getCell(`G${currentRow}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder };
  worksheet.getCell(`H${currentRow}`).border = { top: thinBorder, bottom: thinBorder, right: thinBorder };

  currentRow++;

  // Email
  worksheet.mergeCells(`A${currentRow}:D${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = `Email: ${piData.email || '-'}`;
  worksheet.getCell(`A${currentRow}`).font = { size: 9, color: { argb: 'FF334155' } };
  currentRow += 2;

  // 4. TRADE TERMS
  worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = piData.type === 'consulting' ? "CONTRACT TERMS" : "TRADE TERMS";
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFD97706' } };
  currentRow++;

  const applyTermsStyle = (row: number, c1: string, v1: string, c2: string, v2: string) => {
    worksheet.mergeCells(`A${row}:B${row}`);
    worksheet.mergeCells(`C${row}:E${row}`);
    worksheet.mergeCells(`G${row}:H${row}`);
    
    worksheet.getCell(`A${row}`).value = c1;
    worksheet.getCell(`A${row}`).font = { bold: true, size: 9, color: { argb: 'FF475569' } };
    worksheet.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    
    worksheet.getCell(`C${row}`).value = v1;
    worksheet.getCell(`C${row}`).font = { size: 9 };
    worksheet.getCell(`C${row}`).alignment = { wrapText: true, vertical: 'middle' };
    
    worksheet.getCell(`F${row}`).value = c2;
    worksheet.getCell(`F${row}`).font = { bold: true, size: 9, color: { argb: 'FF475569' } };
    worksheet.getCell(`F${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    
    worksheet.getCell(`G${row}`).value = v2;
    worksheet.getCell(`G${row}`).font = { size: 9 };
    worksheet.getCell(`G${row}`).alignment = { wrapText: true, vertical: 'middle' };

    // Apply borders to all cells in the row to make borders look solid
    const thinBorder = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFCBD5E1' } };
    
    // c1 (A:B)
    worksheet.getCell(`A${row}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder };
    worksheet.getCell(`B${row}`).border = { top: thinBorder, bottom: thinBorder, right: thinBorder };
    
    // v1 (C:E)
    worksheet.getCell(`C${row}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder };
    worksheet.getCell(`D${row}`).border = { top: thinBorder, bottom: thinBorder };
    worksheet.getCell(`E${row}`).border = { top: thinBorder, bottom: thinBorder, right: thinBorder };
    
    // c2 (F)
    worksheet.getCell(`F${row}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
    
    // v2 (G:H)
    worksheet.getCell(`G${row}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder };
    worksheet.getCell(`H${row}`).border = { top: thinBorder, bottom: thinBorder, right: thinBorder };

    worksheet.getRow(row).height = 20;
  };

  if (piData.type === 'consulting') {
    applyTermsStyle(currentRow, "Payment Terms", piData.paymentTerms || '-', "Delivery Term", piData.deliveryTerm || '-');
    currentRow++;
  } else {
    applyTermsStyle(currentRow, "Incoterms", piData.incoterms || '-', "Destination", piData.destinationPort || '-');
    currentRow++;
    applyTermsStyle(currentRow, "Departure Port", piData.departurePort || '-', "Shipping", piData.shippingMethod || '-');
    currentRow++;
    applyTermsStyle(currentRow, "Payment Terms", piData.paymentTerms || '-', "Packaging", piData.packagingSpec || '-');
    currentRow++;
    applyTermsStyle(currentRow, "Delivery Term", piData.deliveryTerm || '-', "Origin", piData.origin || '-');
    currentRow++;
  }
  currentRow += 2;

  // 5. LINE ITEMS
  worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "LINE ITEMS";
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
  currentRow++;

  const headers = ['NO', piData.type === 'consulting' ? 'SERVICE ITEM' : 'PRODUCT', 'SPEC', 'QTY', 'UNIT', 'UNIT PRICE', 'TOTAL (USD)', 'REMARKS', 'PURCHASE COST', 'EXPECTED PROFIT'];
  const headerRow = worksheet.getRow(currentRow);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { 
      type: 'pattern', 
      pattern: 'solid', 
      fgColor: { argb: i === 8 ? 'FF1E40AF' : i === 9 ? 'FF15803D' : 'FF1F4E78' } 
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });
  headerRow.height = 22;
  currentRow++;

  let subtotal = 0;
  let totalCostUsdSum = 0;
  let totalProfitSum = 0;

  if (!items || items.length === 0) {
    worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
    const row = worksheet.getRow(currentRow);
    row.getCell(1).value = "No items";
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(1).font = { color: { argb: 'FF9CA3AF' } };
    for(let i=1; i<=10; i++) {
      row.getCell(i).border = { top: {style:'thin', color: {argb:'FFCBD5E1'}}, left: {style:'thin', color: {argb:'FFCBD5E1'}}, bottom: {style:'thin', color: {argb:'FFCBD5E1'}}, right: {style:'thin', color: {argb:'FFCBD5E1'}} };
    }
    currentRow++;
  } else {
    items.forEach((item, index) => {
      const row = worksheet.getRow(currentRow);
      row.getCell(1).value = index + 1;
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      
      let prodName = item.productName || '';
      if (!prodName && item.productCode) {
        const code = item.productCode;
        if (code.startsWith('[') && code.includes(']')) {
          prodName = code.substring(code.indexOf(']') + 1).trim();
        } else {
          prodName = code;
        }
      }
      row.getCell(2).value = prodName;
      row.getCell(2).font = { bold: true };
      row.getCell(2).alignment = { vertical: 'middle', wrapText: true };
      
      row.getCell(3).value = item.spec || item.description || '';
      row.getCell(3).alignment = { vertical: 'middle', wrapText: true };
      
      row.getCell(4).value = item.quantity || 0;
      row.getCell(4).numFmt = '#,##0';
      row.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
      
      row.getCell(5).value = item.unit || '';
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      
      row.getCell(6).value = item.salePriceUsd || 0;
      row.getCell(6).numFmt = '"$"#,##0.00';
      row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
      
      const lineTotal = item.lineTotalUsd || ((item.salePriceUsd || 0) * (item.quantity || 0));
      row.getCell(7).value = lineTotal;
      row.getCell(7).numFmt = '"$"#,##0.00';
      row.getCell(7).font = { bold: true };
      row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
      
      row.getCell(8).value = item.remarks || '';
      row.getCell(8).font = { size: 9, color: { argb: 'FF64748B' } };
      row.getCell(8).alignment = { vertical: 'middle', wrapText: true };

      // Calculate Item Cost & Profit
      const exRate = item.exchangeRate || piData.exchangeRate || 1400;
      const costUsd = item.purchasePriceUsd > 0 
        ? item.purchasePriceUsd 
        : ((item.purchasePriceKrw || 0) / exRate);
      const totalCostUsd = costUsd * (item.quantity || 0);
      const profitUsd = lineTotal - totalCostUsd;
      const marginPct = lineTotal > 0 ? (profitUsd / lineTotal) * 100 : 0;

      totalCostUsdSum += totalCostUsd;
      totalProfitSum += profitUsd;

      // Col 9: PURCHASE COST
      row.getCell(9).value = costUsd;
      row.getCell(9).numFmt = '"$"#,##0.00';
      row.getCell(9).font = { color: { argb: 'FF1E40AF' } };
      row.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };

      // Col 10: EXPECTED PROFIT
      row.getCell(10).value = `${profitUsd >= 0 ? '$' : '-$'}${Math.abs(profitUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${marginPct.toFixed(1)}%)`;
      row.getCell(10).font = { bold: true, color: { argb: profitUsd >= 0 ? 'FF15803D' : 'FFDC2626' } };
      row.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };

      // Apply borders
      for(let i=1; i<=10; i++) {
        row.getCell(i).border = { top: {style:'thin', color: {argb:'FFCBD5E1'}}, left: {style:'thin', color: {argb:'FFCBD5E1'}}, bottom: {style:'thin', color: {argb:'FFCBD5E1'}}, right: {style:'thin', color: {argb:'FFCBD5E1'}} };
      }
      
      const remarksLines = (item.remarks || '').split('\n').length;
      const specLines = (item.spec || item.description || '').split('\n').length;
      const prodLines = (prodName || '').split('\n').length;
      const maxLines = Math.max(remarksLines, specLines, prodLines, 1);
      row.height = maxLines > 1 ? (maxLines * 15 + 8) : 22;

      subtotal += lineTotal;
      currentRow++;
    });
  }

  currentRow++;

  // 6. FREIGHT CHARGES
  let freightTotal = 0;
  if (piData.type !== 'consulting' && piData.freightCharges && piData.freightCharges.length > 0) {
    worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = "FREIGHT CHARGES";
    worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
    currentRow++;

    // Freight Headers
    worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
    worksheet.mergeCells(`E${currentRow}:F${currentRow}`);
    worksheet.mergeCells(`H${currentRow}:J${currentRow}`);
    const fHeaderRow = worksheet.getRow(currentRow);
    
    const fCols = [
      { col: 1, val: 'CONTAINER TYPE' },
      { col: 4, val: 'QTY' },
      { col: 5, val: 'UNIT PRICE' },
      { col: 7, val: 'TOTAL (USD)' },
      { col: 8, val: 'REMARKS' },
    ];
    
    const thinBorderDark = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FF1F4E78' } };
    const borderDark = { top: thinBorderDark, left: thinBorderDark, bottom: thinBorderDark, right: thinBorderDark };
    for(let i=1; i<=10; i++) {
      const cell = fHeaderRow.getCell(i);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
      cell.border = borderDark;
    }

    fCols.forEach(fc => {
      const cell = fHeaderRow.getCell(fc.col);
      cell.value = fc.val;
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    fHeaderRow.height = 20;
    currentRow++;

    // Freight Data
    piData.freightCharges.forEach(fc => {
      worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
      worksheet.mergeCells(`E${currentRow}:F${currentRow}`);
      worksheet.mergeCells(`H${currentRow}:J${currentRow}`);
      const row = worksheet.getRow(currentRow);
      
      row.getCell(1).value = fc.type;
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      
      row.getCell(4).value = fc.qty || 0;
      row.getCell(4).numFmt = '#,##0';
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      
      row.getCell(5).value = fc.price || 0;
      row.getCell(5).numFmt = '"$"#,##0.00';
      row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
      
      const total = (fc.qty || 0) * (fc.price || 0);
      row.getCell(7).value = total;
      row.getCell(7).numFmt = '"$"#,##0.00';
      row.getCell(7).font = { bold: true };
      row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
      
      row.getCell(8).value = fc.remarks || '';
      row.getCell(8).font = { size: 9, color: { argb: 'FF64748B' } };
      row.getCell(8).alignment = { vertical: 'middle', wrapText: true };

      for(let i=1; i<=10; i++) {
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
  
  worksheet.mergeCells(`E${currentRow}:F${currentRow}`);
  worksheet.getCell(`E${currentRow}`).value = "Subtotal (USD):";
  worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getCell(`E${currentRow}`).font = { color: { argb: 'FF64748B' }, size: 9 };
  worksheet.getCell(`G${currentRow}`).value = subtotal;
  worksheet.getCell(`G${currentRow}`).numFmt = '"$"#,##0.00';
  worksheet.getCell(`G${currentRow}`).font = { bold: true, color: { argb: 'FF1E293B' }, size: 10 };
  worksheet.getCell(`G${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  currentRow++;

  if (freightTotal > 0) {
    worksheet.mergeCells(`E${currentRow}:F${currentRow}`);
    worksheet.getCell(`E${currentRow}`).value = "Freight Total (USD):";
    worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
    worksheet.getCell(`E${currentRow}`).font = { color: { argb: 'FF64748B' }, size: 9 };
    worksheet.getCell(`G${currentRow}`).value = freightTotal;
    worksheet.getCell(`G${currentRow}`).numFmt = '"$"#,##0.00';
    worksheet.getCell(`G${currentRow}`).font = { bold: true, color: { argb: 'FF1E293B' }, size: 10 };
    worksheet.getCell(`G${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
    currentRow++;
  }

  // Total Est. Purchase Cost
  worksheet.mergeCells(`E${currentRow}:F${currentRow}`);
  worksheet.getCell(`E${currentRow}`).value = "Total Est. Cost (USD):";
  worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getCell(`E${currentRow}`).font = { color: { argb: 'FF1E40AF' }, size: 9, bold: true };
  worksheet.getCell(`G${currentRow}`).value = totalCostUsdSum;
  worksheet.getCell(`G${currentRow}`).numFmt = '"$"#,##0.00';
  worksheet.getCell(`G${currentRow}`).font = { bold: true, color: { argb: 'FF1E40AF' }, size: 10 };
  worksheet.getCell(`G${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  currentRow++;

  // Expected Operating Profit
  const overallMargin = subtotal > 0 ? (totalProfitSum / subtotal) * 100 : 0;
  worksheet.mergeCells(`E${currentRow}:F${currentRow}`);
  worksheet.getCell(`E${currentRow}`).value = "Expected Operating Profit:";
  worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getCell(`E${currentRow}`).font = { color: { argb: 'FF15803D' }, size: 9, bold: true };
  worksheet.mergeCells(`G${currentRow}:J${currentRow}`);
  worksheet.getCell(`G${currentRow}`).value = `$${totalProfitSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${overallMargin.toFixed(1)}%)`;
  worksheet.getCell(`G${currentRow}`).font = { bold: true, color: { argb: 'FF15803D' }, size: 11 };
  worksheet.getCell(`G${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  currentRow++;

  worksheet.mergeCells(`E${currentRow}:F${currentRow}`);
  worksheet.getCell(`E${currentRow}`).value = "GRAND TOTAL (USD):";
  worksheet.getCell(`E${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getCell(`E${currentRow}`).font = { size: 11, bold: true, color: { argb: 'FF000000' } };
  worksheet.getCell(`E${currentRow}`).border = { top: { style: 'medium', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'medium', color: { argb: 'FFCBD5E1' } } };
  
  worksheet.mergeCells(`G${currentRow}:J${currentRow}`);
  worksheet.getCell(`G${currentRow}`).value = grandTotal;
  worksheet.getCell(`G${currentRow}`).numFmt = '"$"#,##0.00';
  worksheet.getCell(`G${currentRow}`).font = { size: 12, bold: true, color: { argb: 'FFB91C1C' } };
  worksheet.getCell(`G${currentRow}`).alignment = { horizontal: 'right', vertical: 'middle' };
  worksheet.getCell(`G${currentRow}`).border = { top: { style: 'medium', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'medium', color: { argb: 'FFCBD5E1' } } };
  worksheet.getRow(currentRow).height = 25;
  currentRow += 2;

  // 8. REMARKS (Red border box)
  worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "REMARKS";
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
  currentRow++;

  let remarkLines = ["① This is a basic price. Prices are subject to change based on your additional requests.", "② Shipping cost may vary monthly depending on the carrier's current conditions."];
  if (piData.remarks !== undefined && piData.remarks !== null) {
    remarkLines = piData.remarks ? piData.remarks.split('\n') : [];
  }

  const remarksStartRow = currentRow;
  remarkLines.forEach(line => {
    worksheet.mergeCells(`A${currentRow}:J${currentRow}`);
    worksheet.getCell(`A${currentRow}`).value = line;
    worksheet.getCell(`A${currentRow}`).font = { size: 9, color: { argb: 'FF334155' } };
    currentRow++;
  });
  
  // Apply red border around remarks
  const remarksEndRow = currentRow - 1;
  for (let r = remarksStartRow; r <= remarksEndRow; r++) {
    const topBorder = r === remarksStartRow ? { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFFCA5A5' } } : undefined;
    const bottomBorder = r === remarksEndRow ? { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFFCA5A5' } } : undefined;
    const leftBorder = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFFCA5A5' } };
    const rightBorder = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFFCA5A5' } };

    for(let c=1; c<=10; c++) {
      worksheet.getCell(r, c).border = {
        top: topBorder,
        bottom: bottomBorder,
        left: c === 1 ? leftBorder : undefined,
        right: c === 10 ? rightBorder : undefined
      };
    }
  }
  
  currentRow += 2;

  // 9. BANK DETAILS & SIGNATURES (Side by side)
  // Left: BANK DETAILS (A to E)
  worksheet.mergeCells(`A${currentRow}:E${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = "BANK DETAILS";
  worksheet.getCell(`A${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFD97706' } };
  
  // Right: SIGNATURES (F to J)
  worksheet.mergeCells(`F${currentRow}:J${currentRow}`);
  worksheet.getCell(`F${currentRow}`).value = "SIGNATURES";
  worksheet.getCell(`F${currentRow}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
  worksheet.getCell(`F${currentRow}`).alignment = { horizontal: 'right' };
  currentRow++;

  const startBankRow = currentRow;
  const writeBank = (lbl: string, val: string, r: number) => {
    worksheet.mergeCells(`A${r}:B${r}`);
    worksheet.getCell(`A${r}`).value = lbl;
    worksheet.getCell(`A${r}`).font = { bold: true, size: 9, color: { argb: 'FF475569' } };
    worksheet.getCell(`A${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    
    worksheet.mergeCells(`C${r}:E${r}`);
    worksheet.getCell(`C${r}`).value = val;
    worksheet.getCell(`C${r}`).font = { size: 9, bold: true };
    worksheet.getCell(`C${r}`).alignment = { wrapText: true, vertical: 'middle' };

    const thinBorder = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFCBD5E1' } };
    worksheet.getCell(`A${r}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder };
    worksheet.getCell(`B${r}`).border = { top: thinBorder, bottom: thinBorder, right: thinBorder };
    
    worksheet.getCell(`C${r}`).border = { top: thinBorder, left: thinBorder, bottom: thinBorder };
    worksheet.getCell(`D${r}`).border = { top: thinBorder, bottom: thinBorder };
    worksheet.getCell(`E${r}`).border = { top: thinBorder, bottom: thinBorder, right: thinBorder };
  };

  const bankName = "INDUSTRIAL BANK OF KOREA, SEOUL, KOREA";
  const bankAddress = "50, ULCHIRO 2-GA, CHUNG-GU, SEOUL, 100-758, SOUTH KOREA";
  let bankBeneficiary = isYS ? "YS ACC" : "YSACC Co., LTD";
  const bankAccountNo = isYS ? "940-013901-56-00011" : "143-129260-56-00012";
  const swiftCode = isYS ? "IBKOKRSE" : "IBKOKRSEXXX";
  let beneficiaryAddress = isYS 
    ? "111-201, 76, Wolmyeong-ro, Heungdeok-gu, Cheongju-si, Chungcheongbuk-do, 28589, Korea" 
    : "201-1HO, 1251, GAROSU-RO, HEUNGDEOK-GU, CHEONGJU-SI, CHUNGCHEONGBUK-DO, 28420, SOUTH KOREA";
  let sellerSignature = `${isYS ? 'YS ACC' : 'YSACC CO., LTD.'} (SELLER)\n\n\n\n\nAuthorized Signature`;
  let issuerName = isYS ? 'YS ACC' : 'YSACC CO., LTD.';

  try {
    const compDoc = await getDoc(doc(db, "companies", "YSACC", "my_companies", isYS ? "YS" : "YSACC"));
    if (compDoc.exists()) {
      const data = compDoc.data();
      if (data.nameEn) issuerName = data.nameEn;
      else if (data.nameKo) issuerName = data.nameKo;
      else if (data.name) issuerName = data.name;
      
      bankBeneficiary = issuerName;
      sellerSignature = `${issuerName} (SELLER)\n\n\n\n\nAuthorized Signature`;
      
      if (data.addressEn) beneficiaryAddress = data.addressEn;
    }
  } catch (e) {
    // ignore
  }

  writeBank("Bank Name", bankName, currentRow); 
  worksheet.getRow(currentRow).height = 18;
  currentRow++;
  
  writeBank("Bank Address", bankAddress, currentRow); 
  worksheet.getRow(currentRow).height = 25; // multi-line address space
  currentRow++;
  
  writeBank("Beneficiary", bankBeneficiary, currentRow); 
  worksheet.getRow(currentRow).height = 18;
  currentRow++;
  
  writeBank("Beneficiary Addr", beneficiaryAddress, currentRow); 
  worksheet.getRow(currentRow).height = 25; // multi-line address space
  currentRow++;
  
  writeBank("Account No.", bankAccountNo, currentRow); 
  worksheet.getRow(currentRow).height = 18;
  currentRow++;

  writeBank("SWIFT Code", swiftCode, currentRow); 
  worksheet.getRow(currentRow).height = 18;

  // Add Signatures on the right side of the bank details
  const sigStartRow = startBankRow;
  
  // Buyer Signature Box (F to H)
  worksheet.mergeCells(`F${sigStartRow}:H${sigStartRow+5}`);
  const buyerBox = worksheet.getCell(`F${sigStartRow}`);
  buyerBox.value = "CONSIGNEE (BUYER)\n\n\n\n\nAuthorized Signature";
  buyerBox.font = { size: 8, color: { argb: 'FF94A3B8' } };
  buyerBox.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
  buyerBox.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8F8' } };

  // Seller Signature Box (I to J)
  worksheet.mergeCells(`I${sigStartRow}:J${sigStartRow+5}`);
  const sellerBox = worksheet.getCell(`I${sigStartRow}`);
  sellerBox.value = sellerSignature;
  sellerBox.font = { size: 8, color: { argb: 'FF94A3B8' } };
  sellerBox.alignment = { horizontal: 'center', vertical: 'top', wrapText: true };
  sellerBox.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };

  // Apply borders around signature boxes
  const borderLight = { style: 'thin' as ExcelJS.BorderStyle, color: { argb: 'FFCBD5E1' } };
  for (let r = sigStartRow; r <= sigStartRow + 5; r++) {
    // Buyer (F to H)
    worksheet.getCell(`F${r}`).border = {
      top: r === sigStartRow ? borderLight : undefined,
      bottom: r === sigStartRow + 5 ? borderLight : undefined,
      left: borderLight
    };
    worksheet.getCell(`H${r}`).border = {
      top: r === sigStartRow ? borderLight : undefined,
      bottom: r === sigStartRow + 5 ? borderLight : undefined,
      right: borderLight
    };

    // Seller (I to J)
    worksheet.getCell(`I${r}`).border = {
      top: r === sigStartRow ? borderLight : undefined,
      bottom: r === sigStartRow + 5 ? borderLight : undefined,
      left: borderLight
    };
    worksheet.getCell(`J${r}`).border = {
      top: r === sigStartRow ? borderLight : undefined,
      bottom: r === sigStartRow + 5 ? borderLight : undefined,
      right: borderLight
    };
  }
  
  // Add signature image over seller signature box
  try {
    const sigResponse = await fetch('/signature.png');
    const sigArrayBuffer = await sigResponse.arrayBuffer();
    const sigImageId = workbook.addImage({
      buffer: sigArrayBuffer,
      extension: 'png'
    });
    worksheet.addImage(sigImageId, {
      tl: { col: 8.15, row: sigStartRow + 1.2 },
      ext: { width: 110, height: 50 },
      editAs: 'absolute'
    });
  } catch (e) {
    console.error("Failed to load signature image for Excel:", e);
  }

  // ── Sheet 2: Internal Profit Analysis Worksheet ──
  const ws2 = workbook.addWorksheet('내부 손익 및 정산 분석');
  ws2.columns = [
    { width: 6 },   // A: NO
    { width: 25 },  // B: 품목명
    { width: 25 },  // C: 규격
    { width: 10 },  // D: 수량
    { width: 8 },   // E: 단위
    { width: 16 },  // F: 매입단가
    { width: 16 },  // G: 총 매입금액($)
    { width: 16 },  // H: 판매단가($)
    { width: 16 },  // I: 총 매출금액($)
    { width: 16 },  // J: 영업이익($)
    { width: 12 },  // K: 마진율(%)
  ];

  // Title Banner
  ws2.mergeCells('A1:K1');
  const tCell = ws2.getCell('A1');
  tCell.value = "📊 PROFORMA INVOICE 내부 손익 및 정산 분석표";
  tCell.font = { name: '맑은 고딕', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  tCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws2.getRow(1).height = 32;

  // Metadata Box
  ws2.getCell('A3').value = `PI 번호: ${piData.piNumber || '-'}`;
  ws2.getCell('A3').font = { name: '맑은 고딕', bold: true, size: 10, color: { argb: 'FF1E293B' } };
  ws2.getCell('D3').value = `고객사: ${piData.customerName || '-'}`;
  ws2.getCell('D3').font = { name: '맑은 고딕', bold: true, size: 10, color: { argb: 'FF1E293B' } };
  ws2.getCell('H3').value = `발행일자: ${piData.piDate || '-'}`;
  ws2.getCell('H3').font = { name: '맑은 고딕', bold: true, size: 10, color: { argb: 'FF1E293B' } };
  ws2.getCell('J3').value = `기준환율: ₩${(piData.exchangeRate || 1400).toLocaleString()}`;
  ws2.getCell('J3').font = { name: '맑은 고딕', bold: true, size: 10, color: { argb: 'FF1E293B' } };

  // Table headers
  const s2Headers = ['NO', '품목명 (PRODUCT)', '규격 (SPEC)', '수량', '단위', '매입단가', '총 매입금액($)', '판매단가($)', '총 매출금액($)', '영업이익($)', '마진율(%)'];
  const s2HeaderRow = ws2.getRow(5);
  s2Headers.forEach((h, i) => {
    const cell = s2HeaderRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: '맑은 고딕', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });
  s2HeaderRow.height = 24;

  let rIdx = 6;
  if (items && items.length > 0) {
    items.forEach((item, idx) => {
      const exRate = item.exchangeRate || piData.exchangeRate || 1400;
      const curSym = item.purchasePriceUsd > 0 ? '$' : '₩';
      const unitCost = item.purchasePriceUsd > 0 ? item.purchasePriceUsd : (item.purchasePriceKrw || 0);
      const costUsd = item.purchasePriceUsd > 0 ? item.purchasePriceUsd : ((item.purchasePriceKrw || 0) / exRate);
      const totalCostUsd = costUsd * (item.quantity || 0);
      const salePriceUsd = item.salePriceUsd || 0;
      const totalSaleUsd = item.lineTotalUsd || (salePriceUsd * (item.quantity || 0));
      const profitUsd = totalSaleUsd - totalCostUsd;
      const marginPct = totalSaleUsd > 0 ? (profitUsd / totalSaleUsd) * 100 : 0;

      const row = ws2.getRow(rIdx);
      row.getCell(1).value = idx + 1;
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      
      let prodName = item.productName || item.productCode || '';
      row.getCell(2).value = prodName;
      row.getCell(2).font = { name: '맑은 고딕', bold: true };
      row.getCell(2).alignment = { vertical: 'middle' };

      row.getCell(3).value = item.spec || item.description || '';
      row.getCell(3).alignment = { vertical: 'middle' };
      
      row.getCell(4).value = item.quantity || 0;
      row.getCell(4).numFmt = '#,##0';
      row.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };

      row.getCell(5).value = item.unit || '';
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

      row.getCell(6).value = `${curSym}${unitCost.toLocaleString()}`;
      row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };

      row.getCell(7).value = totalCostUsd;
      row.getCell(7).numFmt = '"$"#,##0.00';
      row.getCell(7).font = { color: { argb: 'FF1E40AF' } };
      row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };

      row.getCell(8).value = salePriceUsd;
      row.getCell(8).numFmt = '"$"#,##0.00';
      row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };

      row.getCell(9).value = totalSaleUsd;
      row.getCell(9).numFmt = '"$"#,##0.00';
      row.getCell(9).font = { bold: true };
      row.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };

      row.getCell(10).value = profitUsd;
      row.getCell(10).numFmt = '"$"#,##0.00';
      row.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(10).font = { bold: true, color: { argb: profitUsd >= 0 ? 'FF15803D' : 'FFDC2626' } };

      row.getCell(11).value = `${marginPct.toFixed(1)}%`;
      row.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(11).font = { bold: true, color: { argb: profitUsd >= 0 ? 'FF15803D' : 'FFDC2626' } };

      for(let c=1; c<=11; c++) {
        row.getCell(c).border = { top: {style:'thin', color:{argb:'FFCBD5E1'}}, left: {style:'thin', color:{argb:'FFCBD5E1'}}, bottom: {style:'thin', color:{argb:'FFCBD5E1'}}, right: {style:'thin', color:{argb:'FFCBD5E1'}} };
      }
      row.height = 22;
      rIdx++;
    });
  }

  // Sheet 2 Totals Summary Box
  rIdx += 2;
  ws2.mergeCells(`H${rIdx}:I${rIdx}`);
  ws2.getCell(`H${rIdx}`).value = "총 매출금액 (Grand Total):";
  ws2.getCell(`H${rIdx}`).font = { name: '맑은 고딕', bold: true, size: 10 };
  ws2.getCell(`H${rIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
  ws2.getCell(`J${rIdx}`).value = grandTotal;
  ws2.getCell(`J${rIdx}`).numFmt = '"$"#,##0.00';
  ws2.getCell(`J${rIdx}`).font = { name: '맑은 고딕', bold: true, size: 11, color: { argb: 'FF0F172A' } };
  ws2.getCell(`J${rIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
  rIdx++;

  ws2.mergeCells(`H${rIdx}:I${rIdx}`);
  ws2.getCell(`H${rIdx}`).value = "총 매입금액 (Total Cost):";
  ws2.getCell(`H${rIdx}`).font = { name: '맑은 고딕', bold: true, size: 10, color: { argb: 'FF1E40AF' } };
  ws2.getCell(`H${rIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
  ws2.getCell(`J${rIdx}`).value = totalCostUsdSum;
  ws2.getCell(`J${rIdx}`).numFmt = '"$"#,##0.00';
  ws2.getCell(`J${rIdx}`).font = { name: '맑은 고딕', bold: true, size: 11, color: { argb: 'FF1E40AF' } };
  ws2.getCell(`J${rIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
  rIdx++;

  const netProfit = grandTotal - totalCostUsdSum - freightTotal - (piData.insurance || 0);
  const netMargin = grandTotal > 0 ? (netProfit / grandTotal) * 100 : 0;

  ws2.mergeCells(`H${rIdx}:I${rIdx}`);
  ws2.getCell(`H${rIdx}`).value = "최종 예상 영업이익:";
  ws2.getCell(`H${rIdx}`).font = { name: '맑은 고딕', bold: true, size: 11, color: { argb: 'FF15803D' } };
  ws2.getCell(`H${rIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
  ws2.mergeCells(`J${rIdx}:K${rIdx}`);
  ws2.getCell(`J${rIdx}`).value = `$${netProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${netMargin.toFixed(1)}%)`;
  ws2.getCell(`J${rIdx}`).font = { name: '맑은 고딕', bold: true, size: 12, color: { argb: 'FF15803D' } };
  ws2.getCell(`J${rIdx}`).alignment = { horizontal: 'right', vertical: 'middle' };
  
  // Write to file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  let filename = piData.piNumber || 'PI';
  if (piData.currentVersion && piData.currentVersion > 1) {
    filename += ` R${piData.currentVersion - 1}`;
  }
  filename += `.xlsx`;

  saveAs(blob, filename);
};
