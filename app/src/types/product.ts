export interface ProductPriceHistory {
  validFrom: string;
  validTo: string;
  currency: string;
  price: number;
  minQty: number;
  discountRate: number;
  remarks: string;
}

export interface Product {
  id: string; // The Firestore document ID, typically same as productCode
  
  // 1. 기본 정보
  productCode: string;
  nameKo: string;
  nameEn: string;
  categoryLarge: string;
  categoryMedium: string;
  categorySmall: string;
  description: string;
  imageUrl: string;

  // 2. 구매/공급 정보 - 공급사
  supplierName: string;
  supplierCode: string;
  supplierContact: string;
  supplierPhone: string;
  supplierEmail: string;
  supplierAddress: string;
  minOrderQty: number;

  // 2. 구매/공급 정보 - 제조사
  manufacturerName?: string;
  manufacturerCode?: string;
  manufacturerContact?: string;
  manufacturerPhone?: string;
  manufacturerEmail?: string;
  manufacturerAddress?: string;

  // 3. 가격 정보
  purchasePrice: number;
  currency: string;
  priceValidFrom: string;
  priceValidTo: string;
  discountRate: number;
  freightIncluded: string;
  purchasePrices?: ProductPriceHistory[];

  // 4. 상품 규격 및 파렛트 적재 정보
  unit: string;
  packageType: string;
  qtyPerPallet: number;
  
  // 메인 사양 (하위 호환 유지)
  specWidth: number;
  specLength: number;
  specHeight: number;
  weight: number;
  grossWeight: number;

  // 제품별 규격 분리 저장
  unitWidth: number;
  unitLength: number;
  unitHeight: number;
  unitWeight: number;
  unitGrossWeight: number;

  // 파렛트별 규격 분리 저장
  palletWidth: number;
  palletLength: number;
  palletHeight: number;
  palletWeight: number;
  palletGrossWeight: number;

  stackable: string;
  rotation: string;
  color: string;
  material: string;
  origin: string;

  // 5. 재고/납기
  stockQty: number;
  leadTimeDays: number;
  storageLocation: string;
  storageTemp: string;
  storageHumidity: string;

  // 6. 품질/규정
  manufacturer?: string;  // legacy - use manufacturerName
  manufactureDate: string;
  expiryDate: string;
  certifications: string;
  msdsManaged: string;

  createdAt?: any;
  updatedAt?: any;
  packingMethods?: PackingMethod[];
}

export interface PackingMethod {
  id: string;
  name: string; // 예: "Pail 단품", "Pail + Pallet 적재"
  packageType: string; // 'Single', 'Pail', 'Drum', 'Pail + Pallet', 'Drum + Pallet', 'Pallet', 'Carton', etc.
  unit: string;
  isDefault: boolean;
  qtyPerPallet?: number;
  unitWidth?: number;
  unitLength?: number;
  unitHeight?: number;
  unitWeight?: number;
  unitGrossWeight?: number;
  palletWidth?: number;
  palletLength?: number;
  palletHeight?: number;
  palletWeight?: number;
  palletGrossWeight?: number;
}

