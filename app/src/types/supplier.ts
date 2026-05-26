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
  createdAt?: any;
  updatedAt?: any;
}
