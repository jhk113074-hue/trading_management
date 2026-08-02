const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function verifyUnk01Calculation() {
  console.log("=== Inspecting YS-2026-UNK-01 items & calculating exact sum ===");

  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();
  const data = docSnap.data();
  const items = data.items || [];

  console.log(`Total items count: ${items.length}\n`);

  let totalSum = 0;

  items.forEach((it, idx) => {
    const qty = Number(it.qty || 0);
    const price = Number(it.purchaseUnitPrice || 0);
    const lineTotal = qty * price;
    totalSum += lineTotal;

    console.log(`[Item ${idx + 1}]`);
    console.log(`  name: "${it.name}"`);
    console.log(`  qty: ${qty}`);
    console.log(`  purchaseUnitPrice: ${price}`);
    console.log(`  purchaseUnitCurrency: "${it.purchaseUnitCurrency}"`);
    console.log(`  line total (qty * purchaseUnitPrice): ₩${lineTotal.toLocaleString()}\n`);
  });

  console.log("==========================================");
  console.log(`Calculated Total Sum: ₩${totalSum.toLocaleString()} (raw: ${totalSum})`);
  console.log(`Is equal to ₩30,746,400? ${totalSum === 30746400}`);
  console.log("==========================================");
}

verifyUnk01Calculation().catch(console.error);
