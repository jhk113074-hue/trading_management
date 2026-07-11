export interface ProductPriceHistory {
  validFrom: string;      // 날짜 (시작일)
  supplierCode?: string;   // 공급사 코드
  supplierName?: string;   // 공급사 명
  currency: string;       // 통화
  price: number;          // 납품단가
  remarks: string;        // 비고
  validTo?: string;
  minQty?: number;
  discountRate?: number;

  // ── 수입원가 이력 전용 (수입관리 "정산완료" 시 자동 반영되는 항목) ──
  // 이 필드가 있으면 "수입 제품"의 실제 정산 원가 기록임을 의미하며,
  // 상품 상세 화면에서 상세내역(원가 구성)을 펼쳐볼 수 있다.
  sourceImportId?: string;   // 수입관리 문서 ID (companies/YSACC/imports/{id})
  poNumber?: string;         // 연결된 PO 번호
  exchangeRate?: number;     // 정산 시 적용환율
  incoterms?: string;        // 정산 시 인코텀즈
  importCostDetail?: {
    qty: number;                 // 이 상품에 배분된 수량
    goodsAmountKrw: number;      // 물품금액(KRW, 배분분)
    freightKrw: number;          // 국제운임(KRW, 배분분)
    insuranceKrw: number;        // 보험료(KRW, 배분분)
    originInlandKrw: number;     // 수출국 내륙운송·수출비(KRW, 배분분)
    cifKrw: number;              // CIF 과세가격(배분분)
    customsDutyRate: number;     // 관세율(%)
    customsDuty: number;         // 관세(배분분)
    clearanceFee: number;        // 통관비(배분분)
    portFee: number;             // 항만·공항비용(배분분)
    domesticTransportFee: number;// 국내운송비(배분분)
    handlingFee: number;         // 하역·장비비(배분분)
    otherFee: number;            // 기타비용(배분분)
    totalImportCost: number;     // 총 수입원가(배분분)
    unitCost: number;            // 단위당 수입원가 (= price와 동일)
  };
}

export interface ProductSupplierLink {
  supplierCode: string;
  supplierName: string;
  isDefault: boolean;
}

export interface Product {
  id: string; // The Firestore document ID, typically same as productCode
  
  // 1. 기본 정보
  productCode: string;
  nameKo: string;
  nameEn: string;
  hsCode?: string;
  customerHsCodes?: Record<string, string>;
  categoryLarge: string;
  categoryMedium: string;
  categorySmall: string;
  description: string;
  spec?: string;
  imageUrl: string;

  // 다중 유통(공급)사 정보 추가
  suppliers?: ProductSupplierLink[];

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
  technicalDocuments?: {
    name: string;
    url: string;
    size: number;
    path: string;
    category: 'TDS' | 'MSDS' | '기타';
  }[];
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
  stackable?: string; // Y/N
  rotation?: string;  // Y/N
}

