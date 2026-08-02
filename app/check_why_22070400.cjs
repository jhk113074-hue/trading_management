const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function checkWhy22070400() {
  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();
  const data = docSnap.data();

  console.log("=== Checking YS-2026-UNK-01 item fields for null / 0 ===");

  data.items.forEach((it, idx) => {
    console.log(`Item [${idx+1}] ${it.name}:`);
    console.log(`  purchaseUnitPrice:`, it.purchaseUnitPrice, `(type: ${typeof it.purchaseUnitPrice})`);
    console.log(`  originalPurchasePrice:`, it.originalPurchasePrice, `(type: ${typeof it.originalPurchasePrice})`);
    
    // Evaluate the expression:
    const p1 = Number(it.purchaseUnitPrice || 0);
    const p2 = Number(it.purchaseUnitPrice ?? it.originalPurchasePrice ?? 0);
    console.log(`  Number(it.purchaseUnitPrice || 0) =>`, p1);
    console.log(`  Number(it.purchaseUnitPrice ?? it.originalPurchasePrice ?? 0) =>`, p2);
  });
}

checkWhy22070400().catch(console.error);
