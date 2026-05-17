const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// 서비스 계정 키 파일 경로
const serviceAccount = require("../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json");

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = "YSACC";

const seedSuppliers = [
  {
    id: "SUP-KUKDO",
    supplierCode: "SUP-KUKDO",
    name: "국도화학 주식회사",
    bizNumber: "110-81-12345",
    representative: "이시창",
    phone: "02-597-4750",
    purchaseEmail: "kukdo_purchase@kukdo.com",
    address: "서울특별시 서초구 남부순환로 2634 (양재동, 국도빌딩)",
    managerName: "김민수 과장",
    managerPhone: "010-4829-9104"
  },
  {
    id: "SUP-HKCARBON",
    supplierCode: "SUP-HKCARBON",
    name: "주식회사 한국카본",
    bizNumber: "610-81-98765",
    representative: "조문수",
    phone: "055-350-4820",
    purchaseEmail: "carbon_trade@hcarbon.com",
    address: "경상남도 밀양시 부북면 사포산단길 35",
    managerName: "박지영 대리",
    managerPhone: "010-1728-2041"
  }
];

async function seed() {
  console.log("🌱 공급업체 마스터 DB 시딩 시작...");
  for (const sup of seedSuppliers) {
    const docRef = db.collection("companies").doc(COMPANY_ID).collection("suppliers").doc(sup.id);
    await docRef.set({
      ...sup,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    console.log(`✅ 등록 완료: ${sup.name} [${sup.supplierCode}]`);
  }
  console.log("🎉 공급업체 시딩 작업이 성공적으로 완료되었습니다!");
  process.exit(0);
}

seed().catch(e => {
  console.error("❌ 공급업체 시딩 중 오류 발생:", e);
  process.exit(1);
});
