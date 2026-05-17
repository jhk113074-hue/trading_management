// Firestore 상품 마스터 초기 데이터 시딩 스크립트
// 실행: node db/seed_products.js

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

let app;
try {
  // 워크스페이스 루트의 json 파일 사용
  const serviceAccount = require("../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json");
  app = initializeApp({ credential: cert(serviceAccount) });
} catch (e) {
  try {
    const serviceAccount = require("./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json");
    app = initializeApp({ credential: cert(serviceAccount) });
  } catch (err) {
    app = initializeApp({ projectId: "tradingmanagement-c1cf4" });
  }
}

const db = getFirestore(app);
const COMPANY_ID = "YSACC";

const sampleProducts = [
  {
    // 기본 정보
    nameKo: "유리섬유 직물 (파이버글라스)",
    nameEn: "E-Glass Fiber Woven Roving",
    productCode: "PROD-FG-EWR600",
    categoryL: "화학/소재",
    categoryM: "유리섬유",
    categoryS: "로빙",
    description: "복합소재 보강재용 고밀도 유리섬유 로빙 직물",
    imageUrl: "https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&w=300&q=80",
    
    // 구매/공급정보
    supplierName: "GUANGDONG MANUFACTURING CO., LTD.",
    supplierCode: "SUPP-GD-01",
    supplierContact: "Mr. Wang",
    supplierPhone: "+86 755 1234 5678",
    supplierEmail: "sales@gd-mfg.cn",
    supplierAddress: "Plot No. 45, Nanshan Science Park, Shenzhen, China",
    moq: 1000,
    
    // 가격정보
    purchasePrice: 1550, // KRW 기준
    currency: "KRW",
    validityStart: "2026-01-01",
    validityEnd: "2026-12-31",
    discountRate: 5,
    includeShipping: false,
    
    // 상품규격
    unit: "KG",
    width: "1000",
    length: "100000",
    height: "2",
    weight: 60,
    color: "White / White-yellowish",
    material: "E-Glass",
    origin: "China",
    
    // 재고/납기
    currentStock: 5000,
    leadTimeDays: 21,
    stockLocation: "A-Warehouse Zone 3",
    tempCondition: "15-25℃",
    humidityCondition: "Under 60%",
    
    // 품질/규정
    manufacturer: "GUANGDONG RAW MATERIALS LTD.",
    manufactureDate: "2026-03-01",
    expiryDate: "2028-03-01",
    certification: "CE, ISO9001, SGS",
    msdsFlag: true,
    
    createdAt: FieldValue.serverTimestamp()
  },
  {
    // 기본 정보
    nameKo: "보강용 불포화 폴리에스터 수지",
    nameEn: "Unsaturated Polyester Resin (GP)",
    productCode: "PROD-CH-UPR200",
    categoryL: "화학/소재",
    categoryM: "폴리에스터 수지",
    categoryS: "일반 액상형",
    description: "FRP 성형 및 적층용 범용 액상 폴리에스터 수지",
    imageUrl: "https://images.unsplash.com/photo-1603126857599-f6e157fa2fe6?auto=format&fit=crop&w=300&q=80",
    
    // 구매/공급정보
    supplierName: "EPP CHEMICALS PVT. LTD.",
    supplierCode: "SUPP-EPP-02",
    supplierContact: "Mr. Patel",
    supplierPhone: "+91 281 1234567",
    supplierEmail: "purchase@epp.in",
    supplierAddress: "Plot No. 2646, GIDC Lodhika, Rajkot, India",
    moq: 200,
    
    // 가격정보
    purchasePrice: 2.25, // USD 기준
    currency: "USD",
    validityStart: "2026-02-15",
    validityEnd: "2026-08-15",
    discountRate: 0,
    includeShipping: true,
    
    // 상품규격
    unit: "KG",
    width: "0",
    length: "0",
    height: "900",
    weight: 220,
    color: "Amber Transparent",
    material: "Liquid Polyester Resin",
    origin: "India",
    
    // 재고/납기
    currentStock: 1200,
    leadTimeDays: 30,
    stockLocation: "Hazardous Material Zone B",
    tempCondition: "5-30℃ (Keep away from flame)",
    humidityCondition: "Under 70%",
    
    // 품질/규정
    manufacturer: "INDIAN ORG-CHEM LTD.",
    manufactureDate: "2026-04-10",
    expiryDate: "2026-10-10",
    certification: "ISO14001, OHSAS18001",
    msdsFlag: true,
    
    createdAt: FieldValue.serverTimestamp()
  },
  {
    // 기본 정보
    nameKo: "에폭시 경화제",
    nameEn: "Epoxy Hardener (Amine Type)",
    productCode: "PROD-CH-EHD050",
    categoryL: "화학/소재",
    categoryM: "에폭시 수지",
    categoryS: "경화제",
    description: "상온 속경화형 저점도 아민계 에폭시 경화제",
    imageUrl: "https://images.unsplash.com/photo-1532187643603-ba119ca4109e?auto=format&fit=crop&w=300&q=80",
    
    // 구매/공급정보
    supplierName: "EPP CHEMICALS PVT. LTD.",
    supplierCode: "SUPP-EPP-02",
    supplierContact: "Mr. Patel",
    supplierPhone: "+91 281 1234567",
    supplierEmail: "purchase@epp.in",
    supplierAddress: "Plot No. 2646, GIDC Lodhika, Rajkot, India",
    moq: 100,
    
    // 가격정보
    purchasePrice: 4.80, // USD 기준
    currency: "USD",
    validityStart: "2026-03-01",
    validityEnd: "2027-03-01",
    discountRate: 3,
    includeShipping: true,
    
    // 상품규격
    unit: "EA",
    width: "350",
    length: "350",
    height: "500",
    weight: 25,
    color: "Clear Colorless",
    material: "Polyamine",
    origin: "India",
    
    // 재고/납기
    currentStock: 400,
    leadTimeDays: 25,
    stockLocation: "Hazardous Material Zone B",
    tempCondition: "10-25℃",
    humidityCondition: "Under 50%",
    
    // 품질/규정
    manufacturer: "INDIAN ORG-CHEM LTD.",
    manufactureDate: "2026-04-12",
    expiryDate: "2027-04-12",
    certification: "ISO9001, FDA Approval",
    msdsFlag: true,
    
    createdAt: FieldValue.serverTimestamp()
  }
];

async function run() {
  console.log("🌱 Firestore 상품 마스터 초기화 시작...");
  const colRef = db.collection("companies").doc(COMPANY_ID).collection("products");

  for (const prod of sampleProducts) {
    const docRef = colRef.doc(prod.productCode);
    await docRef.set(prod);
    console.log(`✅ 상품 주입 성공: ${prod.productCode} (${prod.nameKo})`);
  }

  console.log("🎉 모든 상품 데이터 시딩 완료!");
  process.exit(0);
}

run().catch(e => {
  console.error("❌ 시딩 중 치명적 오류 발생:", e);
  process.exit(1);
});
