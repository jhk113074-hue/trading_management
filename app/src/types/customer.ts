export interface Customer {
  id: string; // Document ID (usually matches customerCode)

  // 1. 기본 정보
  customerCode: string;
  name: string;
  nameKo: string;
  customerType: string;
  countryCode: string;
  countryName: string;
  city: string;
  representative: string;
  industryType: string;

  // 2. 연락처 정보
  phone: string;
  fax: string;
  email: string;
  website: string;

  // 3. 주소 정보
  addressEn: string;
  zipCode: string;
  shippingAddressEn: string;
  shippingZipCode: string;

  // 4. 담당자 정보
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;

  // 5. 거래 정보
  tradeStartDate: string;
  tradeStatus: string;
  tradeGrade: string;
  paymentTerms: string;
  creditLimit: number;
  currency: string;
  tradeTeam: string;

  // 6. 세금/법률 정보
  taxId: string;
  businessLicense: string;
  entityType: string;

  // 7. 결제/금융 정보
  bankName: string;
  bankAccount: string;
  swiftCode: string;
  iban: string;
  bankHolder: string;

  // 8. 배송/물류 정보
  shippingPort: string;
  preferredIncoterms: string;
  customsBroker: string;
  customsInfo: string;
  hsCodeManaged: string;

  // 9. 기타 정보
  registrar: string;
  remarks: string;

  createdAt?: any;
  updatedAt?: any;
  contacts?: CustomerContact[];

  // ── 세금계산서/거래처 정보 보강 (옵션 필드, 기존 데이터/로직 영향 없음) ──
  addressKo?: string; // 한글 사업장주소 (국내 고객사 세금계산서용)
  bizRegNumber?: string; // 사업자등록번호 (taxId와 별개로 신규 추가, 명칭 통일용)
  bizType?: string; // 업태
  itemName?: string; // 종목

  // ── 겸업(고객사이면서 공급사이기도 한 업체) 연결 ──
  linkedSupplierId?: string; // 동일 업체의 공급사 레코드 ID
  linkedSupplierName?: string; // 표시용 (조회 편의)
}

export interface CustomerContact {
  id: string;
  name: string;
  position?: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
  remarks?: string;
}

