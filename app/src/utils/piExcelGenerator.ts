import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { ProformaInvoice, PIItem } from '../types/pi';

const YSACC_INFO = {
  name: 'YSACC CO., LTD.',
  address: '경기도 안산시 단원구 원시로 21 (원시동)',
  tel: 'Tel: +82-31-495-7000',
  fax: 'Fax: +82-31-495-7001',
  email: 'E-mail: jhk@ysacc.co.kr',
  web: 'www.ysacc.co.kr',
  bank: 'Woori Bank',
  account: '1005-103-475082',
  swift: 'HVBKKRSEXXX',
};

const YS_INFO = {
  name: 'YS ACC',
  address: '경기도 안산시 단원구 원시로 21 (원시동)',
  tel: 'Tel: +82-31-495-7000',
  fax: 'Fax: +82-31-495-7001',
  email: 'E-mail: jhk@ysacc.co.kr',
  web: 'www.ysacc.co.kr',
  bank: 'Woori Bank',
  account: '1005-103-475082',
  swift: 'HVBKKRSEXXX',
};

const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFB0B0B0' } };
const thick: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: 'FF1F4E78' } };

function setBorder(
  cell: ExcelJS.Cell,
  t: Partial<ExcelJS.Border> = thin,
  r: Partial<ExcelJS.Border> = thin,
  b: Partial<ExcelJS.Border> = thin,
  l: Partial<ExcelJS.Border> = thin
) {
  cell.border = { top: t as ExcelJS.Border, right: r as ExcelJS.Border, bottom: b as ExcelJS.Border, left: l as ExcelJS.Border };
}

function header(cell: ExcelJS.Cell, text: string, opts: Partial<ExcelJS.Font> = {}) {
  cell.value = text;
  cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' }, ...opts };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
}

function value(cell: ExcelJS.Cell, text: any, opts: Partial<ExcelJS.Font> = {}) {
  cell.value = text;
  cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF111827' }, bold: true, ...opts };
  cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
}

export const generatePIExcel = async (piData: ProformaInvoice, items: PIItem[]) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'YSACC Trading System';
  const ws = workbook.addWorksheet('Proforma Invoice', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } }
  });

  const info = piData.issuingCompany === 'YS' ? YS_INFO : YSACC_INFO;

  // Column widths: A=3, B=22, C=8, D=7, E=12, F=12, G=12
  ws.columns = [
    { key: 'A', width: 3 },
    { key: 'B', width: 28 },
    { key: 'C', width: 10 },
    { key: 'D', width: 7 },
    { key: 'E', width: 14 },
    { key: 'F', width: 14 },
    { key: 'G', width: 18 },
  ];

  // ── Row 1: Title ──────────────────────────────────────────────────
  ws.mergeCells('A1:G1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'PROFORMA INVOICE';
  titleCell.font = { name: 'Calibri', size: 22, bold: true, color: { argb: 'FF1F4E78' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;

  // ── Row 2: Blue separator ─────────────────────────────────────────
  ws.mergeCells('A2:G2');
  ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  ws.getRow(2).height = 4;

  // ── Rows 3-7: Issuer + Invoice details side by side ───────────────
  ws.getRow(3).height = 16;
  ws.getRow(4).height = 14;
  ws.getRow(5).height = 14;
  ws.getRow(6).height = 14;
  ws.getRow(7).height = 14;

  // Issuer (left: A-C)
  ws.mergeCells('A3:C3');
  const compCell = ws.getCell('A3');
  compCell.value = info.name;
  compCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF1F4E78' } };
  compCell.alignment = { vertical: 'middle' };

  ws.mergeCells('A4:C4'); ws.getCell('A4').value = info.address;
  ws.mergeCells('A5:C5'); ws.getCell('A5').value = info.tel + '  |  ' + info.fax;
  ws.mergeCells('A6:C6'); ws.getCell('A6').value = info.email;
  ws.mergeCells('A7:C7'); ws.getCell('A7').value = info.web;
  ['A4','A5','A6','A7'].forEach(c => { ws.getCell(c).font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } }; });

  // Invoice meta (right: E-G)
  const metaRows: [string, string, any][] = [
    ['E3', 'Invoice No.', piData.piNumber || ''],
    ['E4', 'Date',        piData.piDate || ''],
    ['E5', 'Valid Until', piData.validUntilDate || ''],
    ['E6', 'Author',      piData.createdByName || ''],
  ];
  metaRows.forEach(([cell, lbl, val]) => {
    ws.getCell(cell).value = lbl + ' :';
    ws.getCell(cell).font = { name: 'Calibri', size: 9, color: { argb: 'FF6b7280' } };
    ws.getCell(cell).alignment = { horizontal: 'right', vertical: 'middle' };
    ws.mergeCells(cell.replace('E', 'F') + ':G' + cell.slice(1));
    const vc = ws.getCell(cell.replace('E', 'F'));
    vc.value = val;
    vc.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF111827' } };
    vc.alignment = { horizontal: 'left', vertical: 'middle' };
  });

  // ── Row 8: separator ─────────────────────────────────────────────
  ws.mergeCells('A8:G8');
  ws.getCell('A8').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  ws.getRow(8).height = 2;

  // ── Rows 9-12: Buyer + Terms ──────────────────────────────────────
  ws.getRow(9).height = 13;
  ws.getRow(10).height = 16;
  ws.getRow(11).height = 14;
  ws.getRow(12).height = 14;

  // Buyer
  header(ws.getCell('A9'), 'BUYER / CONSIGNEE', { bold: true, size: 8, color: { argb: 'FF1F4E78' } });
  ws.mergeCells('A10:C10');
  value(ws.getCell('A10'), piData.customerName || '', { size: 12, color: { argb: 'FF1F4E78' } });
  ws.mergeCells('A11:C11');
  ws.getCell('A11').value = 'Attn: ' + (piData.contactPerson || '');
  ws.getCell('A11').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  ws.mergeCells('A12:C12');
  ws.getCell('A12').value = piData.email || '';
  ws.getCell('A12').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };

  // Terms (right)
  const termsData: [string, string][] = [
    ['Payment Terms', piData.paymentTerms || ''],
    ['Incoterms',     (piData.incoterms || '') + (piData.destinationPort ? '  ' + piData.destinationPort : '')],
    ['Port of Loading', piData.departurePort || ''],
    ['Shipping Method', piData.shippingMethod || ''],
  ];
  // display in E9-G12
  termsData.forEach(([lbl, val], i) => {
    const row = 9 + i;
    ws.getCell(`E${row}`).value = lbl + ' :';
    ws.getCell(`E${row}`).font = { name: 'Calibri', size: 9, color: { argb: 'FF6b7280' } };
    ws.getCell(`E${row}`).alignment = { horizontal: 'right', vertical: 'middle' };
    ws.mergeCells(`F${row}:G${row}`);
    const vc = ws.getCell(`F${row}`);
    vc.value = val;
    vc.font = { name: 'Calibri', size: 9, bold: true };
    vc.alignment = { horizontal: 'left', vertical: 'middle' };
  });

  // ── Row 13: Table header ──────────────────────────────────────────
  ws.getRow(13).height = 20;
  const tHeaders = ['No.', 'Description', 'Q\'ty', 'Unit', 'Unit Price\n(USD)', 'Amount\n(USD)', 'Remarks'];
  ['A','B','C','D','E','F','G'].forEach((col, i) => {
    const cell = ws.getCell(`${col}13`);
    cell.value = tHeaders[i];
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    setBorder(cell, thick, thick, thick, thick);
  });

  // ── Item rows ─────────────────────────────────────────────────────
  let r = 14;
  items.forEach((item, idx) => {
    ws.getRow(r).height = 18;
    const rowBg = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC';

    const cellData: [string, any, string, boolean][] = [
      ['A', idx + 1,           'center', false],
      ['B', item.description || '', 'left', false],
      ['C', item.quantity,     'center', false],
      ['D', item.unit,         'center', false],
      ['E', item.salePriceUsd, 'right',  true],
      ['F', item.lineTotalUsd, 'right',  true],
      ['G', item.remarks || '', 'left',  false],
    ];

    cellData.forEach(([col, val, align, isNum]) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.value = val;
      cell.font = { name: 'Calibri', size: 9 };
      cell.alignment = { horizontal: align as any, vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      if (isNum) cell.numFmt = '#,##0.00';
      setBorder(cell);
    });
    r++;
  });

  // ── Totals section ─────────────────────────────────────────────────
  r++; // blank row
  ws.getRow(r).height = 4;
  r++;

  const totals: [string, number | undefined, boolean][] = [
    ['Subtotal (USD)',     piData.subtotalUsd, false],
    ['Freight & Others (USD)', piData.extrasUsd, false],
    ['GRAND TOTAL (USD)', piData.totalUsd, true],
  ];

  totals.forEach(([lbl, val, isGrand]) => {
    ws.mergeCells(`A${r}:D${r}`);
    ws.getRow(r).height = isGrand ? 22 : 16;

    const lc = ws.getCell(`E${r}`);
    lc.value = lbl;
    lc.font = { name: 'Calibri', size: isGrand ? 11 : 9, bold: true, color: { argb: isGrand ? 'FF1F4E78' : 'FF475569' } };
    lc.alignment = { horizontal: 'right', vertical: 'middle' };
    if (isGrand) lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4FD' } };

    ws.mergeCells(`F${r}:G${r}`);
    const vc = ws.getCell(`F${r}`);
    vc.value = val ?? 0;
    vc.numFmt = '"$"#,##0.00';
    vc.font = { name: 'Calibri', size: isGrand ? 13 : 10, bold: true, color: { argb: isGrand ? 'FF1F4E78' : 'FF111827' } };
    vc.alignment = { horizontal: 'right', vertical: 'middle' };
    if (isGrand) vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F4FD' } };

    [lc, vc].forEach(c => setBorder(c, isGrand ? thick : thin, isGrand ? thick : thin, isGrand ? thick : thin, isGrand ? thick : thin));
    r++;
  });

  // KRW equivalent
  ws.mergeCells(`E${r}:E${r}`);
  ws.getCell(`E${r}`).value = '원화 환산액 (참고)';
  ws.getCell(`E${r}`).font = { name: 'Calibri', size: 8, color: { argb: 'FF9CA3AF' } };
  ws.getCell(`E${r}`).alignment = { horizontal: 'right' };
  ws.mergeCells(`F${r}:G${r}`);
  const krwCell = ws.getCell(`F${r}`);
  krwCell.value = piData.totalKrw ?? 0;
  krwCell.numFmt = '"₩"#,##0';
  krwCell.font = { name: 'Calibri', size: 8, color: { argb: 'FF9CA3AF' } };
  krwCell.alignment = { horizontal: 'right' };
  r += 2;

  // ── Remarks ───────────────────────────────────────────────────────
  if (piData.remarks) {
    ws.getRow(r).height = 13;
    ws.mergeCells(`A${r}:G${r}`);
    ws.getCell(`A${r}`).value = 'REMARKS';
    ws.getCell(`A${r}`).font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1F4E78' } };
    r++;

    const remarksLines = piData.remarks.split('\n');
    remarksLines.forEach(line => {
      ws.mergeCells(`A${r}:G${r}`);
      ws.getRow(r).height = 13;
      ws.getCell(`A${r}`).value = line;
      ws.getCell(`A${r}`).font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
      r++;
    });
    r++;
  }

  // ── Banking Info ──────────────────────────────────────────────────
  ws.mergeCells(`A${r}:G${r}`);
  ws.getCell(`A${r}`).value = 'BANKING DETAILS';
  ws.getCell(`A${r}`).font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1F4E78' } };
  ws.getRow(r).height = 14;
  r++;

  const bankRows: [string, string][] = [
    ['Bank Name', info.bank],
    ['Account No.', info.account],
    ['SWIFT Code', info.swift],
    ['Beneficiary', info.name],
  ];
  bankRows.forEach(([lbl, val]) => {
    ws.getRow(r).height = 13;
    ws.mergeCells(`A${r}:B${r}`);
    ws.getCell(`A${r}`).value = lbl + ' :';
    ws.getCell(`A${r}`).font = { name: 'Calibri', size: 8.5, color: { argb: 'FF6B7280' } };
    ws.getCell(`A${r}`).alignment = { horizontal: 'right' };
    ws.mergeCells(`C${r}:G${r}`);
    ws.getCell(`C${r}`).value = val;
    ws.getCell(`C${r}`).font = { name: 'Calibri', size: 8.5, bold: true };
    r++;
  });

  r += 2;
  // ── Signature block ───────────────────────────────────────────────
  ws.mergeCells(`E${r}:G${r}`);
  ws.getCell(`E${r}`).value = 'Authorized Signature';
  ws.getCell(`E${r}`).font = { name: 'Calibri', size: 9, color: { argb: 'FF6B7280' } };
  ws.getCell(`E${r}`).alignment = { horizontal: 'center' };
  ws.getRow(r).height = 13;
  r++;

  ws.mergeCells(`E${r}:G${r}`);
  ws.getRow(r).height = 40;
  ws.getCell(`E${r}`).value = info.name;
  ws.getCell(`E${r}`).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1F4E78' } };
  ws.getCell(`E${r}`).alignment = { horizontal: 'center', vertical: 'bottom' };
  setBorder(ws.getCell(`E${r}`), thin, thin, thick, thin);

  // ── Footer line ───────────────────────────────────────────────────
  r += 2;
  ws.mergeCells(`A${r}:G${r}`);
  ws.getCell(`A${r}`).value = `This document is computer-generated and valid without signature unless otherwise stated. | ${info.name} | ${info.web}`;
  ws.getCell(`A${r}`).font = { name: 'Calibri', size: 7.5, color: { argb: 'FF9CA3AF' }, italic: true };
  ws.getCell(`A${r}`).alignment = { horizontal: 'center' };

  // ── Print area / freeze ──────────────────────────────────────────
  ws.views = [{ state: 'frozen', ySplit: 13 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `${piData.piNumber || 'PI'}_${piData.customerName || 'Customer'}.xlsx`);
};
