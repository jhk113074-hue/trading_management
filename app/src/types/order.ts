export interface OrderItem {
  itemId: string;
  name: string;
  supplier: string;
  supplierContact: string;
  grade: string;
  qty: number;
  unit: "kg" | "MT" | "L" | "drum" | "set";
  unitPrice: number;
  amount: number;
  currency: "USD" | "KRW";
}

export interface Order {
  id: string; // PO-YYYY-NNNN
  custPo: string;
  quotationId: string;
  customer: string;
  manager: string;
  incoterms: "CIF HCM" | "FOB" | "EXW" | "CFR" | "DAP" | "DDP" | "";
  paymentTerms: string;
  poDate: string; // YYYY-MM-DD
  requestedDelivery: string;
  remark: string;
  status: "대기" | "발행완료" | "납기확인중" | "납기확정" | "부킹완료" | "선적완료" | "완료";
  items: OrderItem[];
  totalAmount: number;
  currency: "USD" | "KRW" | "mixed";
  exchangeRate?: number;
  poIssuedAt: any | null;
  createdAt: any;
  updatedAt: any;
  externalLinks?: string[]; // Dropbox / Google Drive links
  attachments?: Array<{ name: string; url: string; size: number; path: string }>;
  issuingCompany?: 'YSACC' | 'YS';
}
