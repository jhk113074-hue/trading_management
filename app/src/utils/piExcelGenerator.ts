import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { ProformaInvoice, PIItem } from '../types/pi';

export const generatePIExcel = async (piData: ProformaInvoice, items: PIItem[]) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Proforma Invoice');

  // Set column widths
  sheet.columns = [
    { header: '', key: 'A', width: 5 },
    { header: '', key: 'B', width: 40 },
    { header: '', key: 'C', width: 15 },
    { header: '', key: 'D', width: 10 },
    { header: '', key: 'E', width: 15 },
    { header: '', key: 'F', width: 15 },
    { header: '', key: 'G', width: 25 },
  ];

  // Header Title
  sheet.mergeCells('A1:G1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'PROFORMA INVOICE';
  titleCell.font = { name: 'Arial', size: 24, bold: true };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Issuer Information
  sheet.mergeCells('A3:C3');
  sheet.getCell('A3').value = piData.issuingCompany === 'YS' ? 'YS ACC' : 'YSACC CO., LTD.';
  sheet.getCell('A3').font = { bold: true, size: 14 };

  // Invoice Details
  sheet.getCell('E3').value = 'Date:';
  sheet.getCell('F3').value = piData.piDate;
  sheet.getCell('E4').value = 'Invoice No:';
  sheet.getCell('F4').value = piData.piNumber;
  sheet.getCell('E5').value = 'Valid Until:';
  sheet.getCell('F5').value = piData.validUntilDate;

  // Customer Information
  sheet.mergeCells('A5:C5');
  sheet.getCell('A5').value = 'To:';
  sheet.getCell('A5').font = { bold: true };
  
  sheet.mergeCells('A6:C6');
  sheet.getCell('A6').value = piData.customerName;
  
  sheet.mergeCells('A7:C7');
  sheet.getCell('A7').value = `Attn: ${piData.contactPerson}`;

  // Terms
  sheet.getCell('A9').value = 'Payment Terms:';
  sheet.getCell('B9').value = piData.paymentTerms;
  sheet.getCell('A10').value = 'Shipping Method:';
  sheet.getCell('B10').value = piData.shippingMethod;
  sheet.getCell('A11').value = 'Incoterms:';
  sheet.getCell('B11').value = piData.incoterms;
  sheet.getCell('A12').value = 'Port of Loading:';
  sheet.getCell('B12').value = piData.departurePort;
  sheet.getCell('A13').value = 'Port of Discharge:';
  sheet.getCell('B13').value = piData.destinationPort;

  // Items Table Header
  const headerRow = sheet.getRow(15);
  headerRow.values = ['No', 'Description', 'Quantity', 'Unit', 'Unit Price ($)', 'Total ($)', 'Remarks'];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { horizontal: 'center' };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });

  // Items Data
  let currentRow = 16;
  items.forEach((item, index) => {
    const row = sheet.getRow(currentRow);
    row.values = [
      index + 1,
      item.description,
      item.quantity,
      item.unit,
      item.salePriceUsd,
      item.lineTotalUsd,
      item.remarks || ''
    ];
    row.eachCell((cell, colNumber) => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      if (colNumber === 3 || colNumber === 5 || colNumber === 6) {
        cell.numFmt = '#,##0.00';
      }
    });
    currentRow++;
  });

  // Totals
  currentRow++;
  sheet.getCell(`E${currentRow}`).value = 'Subtotal (USD):';
  sheet.getCell(`F${currentRow}`).value = piData.subtotalUsd;
  sheet.getCell(`F${currentRow}`).numFmt = '#,##0.00';
  sheet.getCell(`F${currentRow}`).font = { bold: true };
  
  currentRow++;
  sheet.getCell(`E${currentRow}`).value = 'Extras (USD):';
  sheet.getCell(`F${currentRow}`).value = piData.extrasUsd;
  sheet.getCell(`F${currentRow}`).numFmt = '#,##0.00';
  
  currentRow++;
  sheet.getCell(`E${currentRow}`).value = 'Grand Total (USD):';
  sheet.getCell(`F${currentRow}`).value = piData.totalUsd;
  sheet.getCell(`F${currentRow}`).numFmt = '#,##0.00';
  sheet.getCell(`F${currentRow}`).font = { bold: true, color: { argb: 'FF0000FF' } };

  // Buffer and Save
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${piData.piNumber}.xlsx`);
};
