export interface PIItem {
  id?: string;
  lineNumber: number;
  productCode: string;
  productName?: string;
  purchasePriceCurrency?: string;
  spec?: string;
  description: string;
  quantity: number;
  unit: string;
  purchasePriceKrw: number;
  exchangeRate: number;
  purchasePriceUsd: number;
  marginRate: number;
  salePriceUsd: number;
  lineTotalUsd: number;
  palletQty: number;
  remarks: string;
  roundDigits?: number;
  selectedPackingMethodId?: string;
  packingSpecOverride?: {
    packageType: string;
    qtyPerPallet: number;
    specWidth: number;
    specLength: number;
    specHeight: number;
    weight: number;
    grossWeight: number;
  };
}

export interface PIRevision {
  id?: string;
  version: number;
  revisionReason: string;
  createdAt: any;
  updatedAt: any;
  items: PIItem[];
  exchangeRate?: number;
  remarks?: string;
  customerAddress?: string;
  incoterms?: string;
  destinationPort?: string;
  paymentTerms?: string;
  shippingMethod?: string;
  packagingSpec?: string;
  deliveryTerm?: string;
  origin?: string;
  yourRef?: string;
  attachments?: { name: string; url: string; size: number; path: string }[];
}

export interface ProformaInvoice {
  id: string; // piNumber is the ID, e.g., PI-YSACC-2026-0001
  piNumber: string;
  piDate: string;
  validityDays: number;
  validUntilDate: string;
  
  issuingCompany: 'YSACC' | 'YS';
  
  customerId: string;
  customerName: string;
  customerAddress?: string;
  contactPerson: string;
  email: string;
  
  incoterms: string;
  destinationPort: string;
  departurePort: string;
  packagingSpec: string;
  validityDesc: string;
  paymentTerms: string;
  shippingMethod: string;
  exchangeRate: number;
  remarks: string;
  deliveryTerm?: string;
  origin?: string;
  yourRef?: string;
  
  handlingFee: number;
  freightCharges: Array<{
    type: string;
    qty: number;
    price: number;
    remarks: string;
    name?: string;
    amount?: number;
  }>;
  freightTotal: number;
  insurance: number;
  
  subtotalUsd: number;
  extrasUsd: number;
  totalUsd: number;
  totalKrw: number;
  
  status: 'draft' | 'confirmed' | 'sent' | 'PO확정';
  currentVersion: number;
  
  createdBy: string;
  createdByName: string;
  
  createdAt: any;
  updatedAt: any;
  
  itemsSummary?: string[]; // Quick summary of line items
  attachments?: { name: string; url: string; size: number; path: string }[];
  containerSimulation?: {
    containerType?: string;
    volumeEfficiency?: number;
    weightEfficiency?: number;
    totalCbm?: number;
    totalWeight?: number;
    cargoCount?: number;
    simulationFileUrl?: string;
    simulationFileName?: string;
    simulationImageUrl?: string;
  };
}
