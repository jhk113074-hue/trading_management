const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const path = require("path");

// 서비스 계정 키 파일 경로
const serviceAccount = require("../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json");

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = "YSACC";

const seedCustomers = [
  {
    id: "AL-SHIRAWAI",
    customerCode: "AL-SHIRAWAI",
    name: "AL SHIRAWAI TRADING CO. LLC",
    nameKo: "알 시라와이 트레이딩 LLC",
    customerType: "Buyer",
    countryCode: "AE",
    countryName: "United Arab Emirates",
    city: "Dubai",
    representative: "Humaid Al Shirawi",
    industryType: "Industrial Composite Distribution",
    
    phone: "+971-4-340-4752",
    fax: "+971-4-340-4753",
    email: "procurement@alshirawi.ae",
    website: "https://www.alshirawi.com",
    
    addressEn: "Plot 597-206, Al Quoz Industrial Area 4, P.O. Box 2125, Dubai",
    zipCode: "00000",
    shippingAddressEn: "Jebel Ali Free Zone South, Warehouse No. S30211, Dubai",
    shippingZipCode: "00000",
    
    contactPerson: "Amir Rafiq (Procurement Manager)",
    contactPhone: "+971-50-482-9104",
    contactEmail: "amir.rafiq@alshirawi.ae",
    
    tradeStartDate: "2024-01-15",
    tradeStatus: "Active",
    tradeGrade: "S",
    paymentTerms: "L/C 90 days from B/L date",
    creditLimit: 500000,
    currency: "USD",
    tradeTeam: "해외영업 1팀",
    
    taxId: "TRN-10020485900003",
    businessLicense: "LIC-589204",
    entityType: "Corporation",
    
    bankName: "Emirates NBD Bank PJSC",
    bankAccount: "AE530260000000109485903",
    swiftCode: "EBILAEADXXX",
    iban: "AE530260000000109485903",
    bankHolder: "AL SHIRAWAI TRADING CO. LLC",
    
    shippingPort: "JEBEL ALI PORT, DUBAI",
    preferredIncoterms: "CIF",
    customsBroker: "Gulf Clearing Agent Co.",
    customsInfo: "Original Invoice and C/O must be attested by UAE Embassy/Chamber.",
    hsCodeManaged: "Y",
    
    registrar: "홍길동 부장",
    remarks: "UAE 내 최대의 단골 고객. 납기 준수가 최우선이며 매 분기 30만불 이상 정기 발주 진행 중."
  },
  {
    id: "KRONOS-COMP",
    customerCode: "KRONOS-COMP",
    name: "KRONOS COMPOSITES GMBH",
    nameKo: "크로노스 컴포지트 GMBH",
    customerType: "Distributor",
    countryCode: "DE",
    countryName: "Germany",
    city: "Munich",
    representative: "Dieter Mueller",
    industryType: "Aerospace and Automotive Supplies",
    
    phone: "+49-89-4829-1002",
    fax: "+49-89-4829-1003",
    email: "info@kronos-composites.de",
    website: "https://www.kronos-composites.de",
    
    addressEn: "Leopoldstrasse 244, 80807 Muenchen",
    zipCode: "80807",
    shippingAddressEn: "Gewerbepark Nord 12, 85748 Garching bei Muenchen",
    shippingZipCode: "85748",
    
    contactPerson: "Sarah Wagner (Sourcing Director)",
    contactPhone: "+49-172-849-2041",
    contactEmail: "s.wagner@kronos-composites.de",
    
    tradeStartDate: "2024-05-10",
    tradeStatus: "Active",
    tradeGrade: "A",
    paymentTerms: "T/T 30 days after Invoice Date",
    creditLimit: 200000,
    currency: "EUR",
    tradeTeam: "해외영업 2팀",
    
    taxId: "DE-811193859",
    businessLicense: "HRB-948592 (Munich)",
    entityType: "Corporation",
    
    bankName: "Deutsche Bank AG",
    bankAccount: "DE89700700100495829400",
    swiftCode: "DEUTDEDBMUX",
    iban: "DE89700700100495829400",
    bankHolder: "KRONOS COMPOSITES GMBH",
    
    shippingPort: "HAMBURG PORT",
    preferredIncoterms: "FOB",
    customsBroker: "Schenker DE Logistics",
    customsInfo: "EU VAT ID validation required before every shipment. MSDS must be in German.",
    hsCodeManaged: "Y",
    
    registrar: "이영희 차장",
    remarks: "유럽 자동차 협력사 향 탄소섬유 등 원자재 공급 대리점. 품질 성적서(COA) 필수 동봉 요청."
  },
  {
    id: "APEX-LOG",
    customerCode: "APEX-LOG",
    name: "APEX LOGISTICS INC",
    nameKo: "에이펙스 로지스틱스",
    customerType: "Partner",
    countryCode: "US",
    countryName: "United States",
    city: "Houston",
    representative: "John Carter",
    industryType: "Oil & Gas Industrial Supplies",
    
    phone: "+1-713-948-2049",
    fax: "+1-713-948-2050",
    email: "contact@apexlog-usa.com",
    website: "https://www.apexlog-usa.com",
    
    addressEn: "1200 Travis St, Houston, TX 77002",
    zipCode: "77002",
    shippingAddressEn: "Houston Port Terminal 4, Gate 12, Houston, TX 77012",
    shippingZipCode: "77012",
    
    contactPerson: "Michael Green",
    contactPhone: "+1-832-495-2019",
    contactEmail: "mgreen@apexlog-usa.com",
    
    tradeStartDate: "2025-02-01",
    tradeStatus: "Active",
    tradeGrade: "B",
    paymentTerms: "100% T/T in advance",
    creditLimit: 50000,
    currency: "USD",
    tradeTeam: "해외영업 1팀",
    
    taxId: "EIN-47-2948590",
    businessLicense: "TX-94850",
    entityType: "Corporation",
    
    bankName: "Chase Bank N.A.",
    bankAccount: "US12CHAS9485029485029",
    swiftCode: "CHASUS33XXX",
    iban: "US12CHAS9485029485029",
    bankHolder: "APEX LOGISTICS INC",
    
    shippingPort: "HOUSTON PORT",
    preferredIncoterms: "EXW",
    customsBroker: "Apex US Custom House Broker",
    customsInfo: "EXW pick-up. Coordinate with freight forwarder 10 days before shipment.",
    hsCodeManaged: "N",
    
    registrar: "김준수 대리",
    remarks: "텍사스 오일 메이저 공급 벤더사. 대금 지급은 항상 선금(T/T in advance)으로 정확히 선입금 처리함."
  }
];

async function seed() {
  console.log("🌱 해외 거래처 3개사 시딩 시작...");
  for (const cust of seedCustomers) {
    const docRef = db.collection("companies").doc(COMPANY_ID).collection("customers").doc(cust.id);
    await docRef.set({
      ...cust,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    console.log(`✅ 등록 완료: ${cust.name} [${cust.customerCode}]`);
  }
  console.log("🎉 시딩 작업이 성공적으로 완결되었습니다!");
  process.exit(0);
}

seed().catch(e => {
  console.error("❌ 시딩 중 오류 발생:", e);
  process.exit(1);
});
