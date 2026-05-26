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
}
