// Firestore 초기 데이터 삽입 스크립트 (Node.js로 실행)
// 실행: node db/seed_firestore.js

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// Firebase Admin SDK 초기화 (서비스 계정 키 없이 기본 설정 사용)
// ⚠️ Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 후 파일 다운로드
// 아래 경로에 저장: e:\무역관리프로그램\firebase\serviceAccountKey.json
let app;
try {
  const serviceAccount = require("../firebase/tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-00445e0fa7.json");
  app = initializeApp({ credential: cert(serviceAccount) });
} catch (e) {
  // 서비스 계정 키가 없을 경우 환경변수 사용
  app = initializeApp({
    projectId: "tradingmanagement-c1cf4"
  });
}

const db = getFirestore(app);
const COMPANY_ID = "YSACC";

async function seed() {
  console.log("🌱 Firestore 초기 데이터 삽입 시작...");
  const companyRef = db.collection("companies").doc(COMPANY_ID);

  // 1. 회사 기본 정보
  await companyRef.set({
    companyCode: "YSACC",
    companyName: "(주)와이에스에이씨씨",
    companyType: "corporation",
    businessNumber: "2022-12345678",
    status: "active",
    createdAt: FieldValue.serverTimestamp()
  });
  console.log("✅ 회사 정보 저장 완료");

  // 2. PI 번호 카운터 초기화
  await companyRef.collection("meta").doc("pi_counter").set({
    count_2026: 0
  });
  console.log("✅ PI 카운터 초기화 완료");

  // 3. 고객 데이터
  const customers = [
    {
      name: "THERMOSET TECHNOLOGIES MIDDLE EAST L.L.C",
      country: "UAE",
      city: "DUBAI",
      address: "P.O BOX 118157, 37 STREET, DUBAI INVESTMENT PARK - 1, DUBAI, UAE",
      contactPerson: "Contact Name",
      email: "contact@thermoset.ae",
      phone: "+971 4 885228",
      paymentTerms: "100% LC 90 days from BL date",
      preferredIncoterms: "DOOR TO DOOR",
      preferredPort: "JEBEL ALI",
      preferredShippingMethod: "Sea Freight",
      status: "active",
      createdAt: FieldValue.serverTimestamp()
    },
    {
      name: "EPP COMPOSITES PVT. LTD.",
      country: "INDIA",
      city: "Rajkot",
      address: "Plot No. 2646, GIDC Lodhika, Rajkot, India",
      contactPerson: "Manager",
      email: "purchase@epp.in",
      phone: "+91 281 1234567",
      paymentTerms: "TT in advance",
      preferredIncoterms: "EXW",
      preferredPort: "NHAVA SHEVA",
      preferredShippingMethod: "Sea Freight",
      status: "active",
      createdAt: FieldValue.serverTimestamp()
    }
  ];

  for (const customer of customers) {
    await companyRef.collection("customers").add(customer);
    console.log(`✅ 고객 저장: ${customer.name}`);
  }

  // 4. 공급업체 데이터
  await companyRef.collection("suppliers").add({
    name: "GUANGDONG MANUFACTURING CO., LTD.",
    country: "CHINA",
    city: "Shenzhen",
    contactPerson: "Mr. Wang",
    email: "sales@gd-mfg.cn",
    phone: "+86 755 1234 5678",
    incoterms: "FOB SHENZHEN",
    paymentTerms: "30% TT in advance, 70% before shipment",
    leadTime: "3 weeks",
    status: "active",
    createdAt: FieldValue.serverTimestamp()
  });
  console.log("✅ 공급업체 저장 완료");

  console.log("\n🎉 초기 데이터 삽입 완료!");
  console.log("Firebase Console에서 확인: https://console.firebase.google.com/project/tradingmanagement-c1cf4/firestore");
  process.exit(0);
}

seed().catch(e => { console.error("❌ 오류:", e); process.exit(1); });
