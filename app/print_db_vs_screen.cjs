const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function printDbVsScreenComparison() {
  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();
  const dbItems = docSnap.data().items;

  console.log("=== DB ARRAY VS SCREEN ROW MISMATCH DETAILS ===");

  const screenPrices = [63200, 31800, 88400, 54000, 53900, 47000, 66000, 58000, 80000];

  dbItems.forEach((it, idx) => {
    const sPrice = screenPrices[idx];
    console.log(`[Item ${idx + 1}] name: "${it.name}"`);
    console.log(`  - DB purchaseUnitPrice: ₩${it.purchaseUnitPrice.toLocaleString()}`);
    console.log(`  - Screen PO Table Price: ₩${sPrice.toLocaleString()}`);
    console.log(`  - Matches? ${it.purchaseUnitPrice === sPrice ? 'MATCH ✅' : 'MISMATCH ❌'}\n`);
  });
}

printDbVsScreenComparison().catch(console.error);
