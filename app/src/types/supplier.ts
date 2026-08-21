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
  defaultCcEmails?: string; // 공급처별 기본 참조(CC) 이메일 (쉼표 구분)

  // ── 세금계산서/거래처 정보 보강 (옵션 필드, 기존 데이터/로직 영향 없음) ──
  // 사업자등록번호는 기존 bizNumber 필드를 그대로 사용 (중복 필드 생성 방지)
  countryType?: '국내' | '해외'; // 국내/해외 구분
  bizType?: string; // 업태
  itemName?: string; // 종목

  // ── 겸업(공급사이면서 고객사이기도 한 업체) 연결 ──
  linkedCustomerId?: string; // 동일 업체의 고객사 레코드 ID
  linkedCustomerName?: string; // 표시용 (조회 편의)
}

export interface SupplierContact {
  id: string;
  name: string;
  position?: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
  isCc?: boolean; // 기본 참조(CC) 수신 여부
  remarks?: string;
}

