export interface Supplier {
  id: string; // Document ID (usually matches supplierCode)
  supplierCode: string;
  name: string;
  bizNumber: string;
  representative: string;
  phone: string;
  purchaseEmail: string;
  address: string;
  managerName: string;
  managerPhone: string;
  bankKrw?: string;
  bankUsd?: string;
  category?: '공급사' | '포워딩사' | '';
  createdAt?: any;
  updatedAt?: any;
  contacts?: SupplierContact[];
}

export interface SupplierContact {
  id: string;
  name: string;
  position?: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
  remarks?: string;
}

