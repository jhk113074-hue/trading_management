import * as XLSX from 'xlsx';

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
  totalPackages?: number;
  totalNetWeight?: number;
  totalGrossWeight?: number;
  totalCbm?: number;
}

export const exportCiPlToExcel = (data: CiPlData) => {
  const wb = XLSX.utils.book_new();

  // 1. COMMERCIAL INVOICE GENERATION
  const ciData: any[][] = [];
  
  // Fill spaces for title and header block
  for (let i = 0; i < 22; i++) {
    ciData.push(new Array(8).fill(""));
  }

  // Set Title
  ciData[1][0] = "Commercial Invoice";

  // Fill Header fields
  const companyName = data.issuingCompany === 'YSACC' ? 'YSACC CO., LTD.' : 'YS CO., LTD.';
  const shipperInfo = `${companyName}\nSuite 408, Dae-il Bldg, 12, Mapo-daero 4-gil,\nMapo-gu, Seoul, 04175, Korea`;
  ciData[3][0] = shipperInfo;
  ciData[3][4] = `Invoice No. & Date : ${data.invoiceNo} / ${data.invoiceDate}`;
  ciData[5][4] = `L/C No. & Date : ${data.lcNo || 'N/A'} ${data.lcDate ? `/ ${data.lcDate}` : ''}`;
  
  const applicantInfo = `${data.customerName}\n${data.customerAddress || ''}`;
  ciData[8][0] = applicantInfo;
  ciData[8][4] = `L/C Issuing Bank : ${data.lcIssuingBank || 'N/A'}`;
  
  ciData[13][0] = data.notifyParty || 'SAME AS APPLICANT';
  ciData[13][4] = data.remarks || '';
  
  ciData[17][0] = data.portOfLoading || '';
  ciData[17][2] = data.portOfDischarge || '';
  ciData[17][4] = data.paymentTerms || '';
  
  ciData[19][0] = data.vesselName || '';
  ciData[19][2] = data.etd || '';
  ciData[19][4] = data.deliveryTerms || '';

  // Items Headers
  ciData[21] = ["Shipping Mark", "Description of Goods", "HS CODE", "Quantity", "", "Unit Price", "Amount", ""];

  // Push items
  let currentRaw = 22;
  let totalQty = 0;
  let totalAmount = 0;

  data.items.forEach(item => {
    ciData.push([
      data.shippingMarks || "N/M",
      item.name,
      item.hsCode || "",
      item.qty,
      item.unit,
      item.unitPrice,
      item.amount,
      ""
    ]);
    totalQty += item.qty;
    totalAmount += item.amount;
    currentRaw++;
  });

  // Total amount line
  ciData.push(["TOTAL AMOUNT", "", "", totalQty, "", "", totalAmount, ""]);
  currentRaw++;

  // HS CODE disclaimer
  ciData.push(["A) RELEVANT HARMONIZED SYSTEM COMMODITY CODE NUMBER(S) APPLICABLE TO EACH ITEM SHIPPED", "", "", "", "", "", "", ""]);
  currentRaw++;

  // Add item HS Codes as text explicitly
  const hsCodesText = data.items.map(it => `${it.name}: ${it.hsCode || 'N/A'}`).join(', ');
  ciData.push([hsCodesText, "", "", "", "", "", "", ""]);
  currentRaw++;

  // Signature space
  ciData.push(["", "", "", "", "", "", "", ""]);
  ciData.push(["", "", "", "", "", "", "Signed by", ""]);
  ciData.push(["", "", "", "", "", "", "______________________", ""]);
  ciData.push(["", "", "", "", "", "", companyName, ""]);

  // Create CI Worksheet
  const wsCi = XLSX.utils.aoa_to_sheet(ciData);

  // Setup CI mergers
  const ciMerges = [
    // Shipper
    { s: { r: 3, c: 0 }, e: { r: 7, c: 3 } },
    // Invoice details
    { s: { r: 3, c: 4 }, e: { r: 4, c: 7 } },
    { s: { r: 5, c: 4 }, e: { r: 6, c: 7 } },
    // Applicant
    { s: { r: 8, c: 0 }, e: { r: 12, c: 3 } },
    { s: { r: 8, c: 4 }, e: { r: 12, c: 7 } },
    // Notify
    { s: { r: 13, c: 0 }, e: { r: 16, c: 3 } },
    { s: { r: 13, c: 4 }, e: { r: 16, c: 7 } },
    // Port of loading/discharge
    { s: { r: 17, c: 0 }, e: { r: 18, c: 1 } },
    { s: { r: 17, c: 2 }, e: { r: 17, c: 3 } },
    { s: { r: 17, c: 4 }, e: { r: 18, c: 7 } },
    // Vessel
    { s: { r: 19, c: 0 }, e: { r: 20, c: 1 } },
    { s: { r: 19, c: 2 }, e: { r: 19, c: 3 } },
    { s: { r: 19, c: 4 }, e: { r: 20, c: 7 } },
    // Header labels
    { s: { r: 1, c: 0 }, e: { r: 2, c: 7 } }
  ];
  wsCi['!merges'] = ciMerges;
  XLSX.utils.book_append_sheet(wb, wsCi, "Commercial Invoice");

  // 2. PACKING LIST GENERATION
  const plData: any[][] = [];
  
  for (let i = 0; i < 22; i++) {
    plData.push(new Array(8).fill(""));
  }

  // Set Title
  plData[1][0] = "Packing List";

  // Fill Header fields
  plData[3][0] = shipperInfo;
  plData[3][4] = `Packing List No. & Date : ${data.invoiceNo} / ${data.invoiceDate}`;
  plData[5][4] = `L/C No. & Date : ${data.lcNo || 'N/A'} ${data.lcDate ? `/ ${data.lcDate}` : ''}`;
  plData[8][0] = applicantInfo;
  plData[8][4] = `L/C Issuing Bank : ${data.lcIssuingBank || 'N/A'}`;
  plData[13][0] = data.notifyParty || 'SAME AS APPLICANT';
  plData[13][4] = data.remarks || '';
  plData[17][0] = data.portOfLoading || '';
  plData[17][2] = data.portOfDischarge || '';
  plData[17][4] = data.paymentTerms || '';
  plData[19][0] = data.vesselName || '';
  plData[19][2] = data.etd || '';
  plData[19][4] = data.deliveryTerms || '';

  // Items Headers
  plData[21] = ["Shipping Marks", "Description of Goods", "Quantity / Packages", "Net Weight (Kg)", "Gross Weight (Kg)", "Measurement (CBM)", "", ""];

  // Push items
  let plQty = 0;
  let plNet = 0;
  let plGross = 0;
  let plCbm = 0;
  let pkCount = 0;

  data.items.forEach(item => {
    const itemNet = item.netWeight || 0;
    const itemGross = item.grossWeight || 0;
    const itemCbm = item.cbm || 0;
    const packages = item.packagesCount || item.qty;

    plData.push([
      data.shippingMarks || "N/M",
      item.name,
      `${packages} ${item.packageType || 'Pallet'} (${item.qty} ${item.unit})`,
      itemNet,
      itemGross,
      itemCbm,
      "",
      ""
    ]);
    plQty += item.qty;
    plNet += itemNet;
    plGross += itemGross;
    plCbm += itemCbm;
    pkCount += packages;
  });

  // Total line
  plData.push(["TOTAL", "", `${pkCount} PLT`, plNet, plGross, plCbm, "", ""]);
  
  // Signature space
  plData.push(["", "", "", "", "", "", "", ""]);
  plData.push(["", "", "", "", "", "", "Signed by", ""]);
  plData.push(["", "", "", "", "", "", "______________________", ""]);
  plData.push(["", "", "", "", "", "", companyName, ""]);

  const wsPl = XLSX.utils.aoa_to_sheet(plData);
  
  // Clone CI merges for PL as the layout is identical
  const plMerges = JSON.parse(JSON.stringify(ciMerges));
  wsPl['!merges'] = plMerges;
  XLSX.utils.book_append_sheet(wb, wsPl, "Packing List");

  // Save Excel file
  XLSX.writeFile(wb, `CI_PL_${data.invoiceNo}.xlsx`);
};
