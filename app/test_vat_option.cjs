const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function testVatOption() {
  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();
  const data = docSnap.data();

  console.log("=== Testing VAT and Price combinations for 30,746,400 ===");

  const items = data.items;
  let sumKrw = 0;
  items.forEach(it => {
    sumKrw += (it.qty || 0) * (it.purchaseUnitPrice || 0);
  });

  console.log(`Pure sum (qty * purchaseUnitPrice): ₩${sumKrw.toLocaleString()}`);
  console.log(`With 10% VAT: ₩${(sumKrw * 1.1).toLocaleString()}`);
  console.log(`With 39.31% VAT/Margin?: ₩${(sumKrw * 1.3931).toLocaleString()}`);

  // What if $25,522 (sales total) * 1380 = 35,220,360?
  // What if 30,746,400 is derived from $22,070.40 * 1393.1048?
  
  // Let's check if 30,746,400 is equal to:
  // sum(qty * unitPrice USD * 1380) for some items + sum(qty * purchaseUnitPrice)?
  // Or is 30,746,400 from another order or old loose matching result?
  console.log(`\nIs ₩30,746,400 from the current code (v2.8.121/122)?`);
  console.log(`Current code calculates: ₩${sumKrw.toLocaleString()}`);
  console.log(`Difference between current code (22,070,400) and 30,746,400: ₩${(30746400 - sumKrw).toLocaleString()}`);
}

testVatOption().catch(console.error);
