const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function testVatCombinations() {
  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();
  const data = docSnap.data();
  const items = data.items;

  console.log("=== Testing VAT and Price Combinations for ₩30,746,400 ===");
  const baseSum = 22070400;

  // 1. baseSum * 1.1 = 24,277,440
  // 2. baseSum * 1.1 + sales amounts?
  // 3. What if 30,746,400 is sum of (unitPrice * exRate)?
  const salesKrw1400 = 25522 * 1400; // 35,730,800
  const salesKrw1380 = 25522 * 1380; // 35,220,360
  
  // 4. Test subsets of items (e.g. items 1..7 + VAT, items 1..8, etc.)
  let partialAcc = 0;
  items.forEach((it, idx) => {
    partialAcc += it.qty * it.purchaseUnitPrice;
    console.log(`Subtotal items 1..${idx + 1}: ₩${partialAcc.toLocaleString()} | +VAT(10%): ₩${(partialAcc * 1.1).toLocaleString()} | +VAT(39.31%): ₩${(partialAcc * 1.3931).toLocaleString()}`);
  });
}

testVatCombinations().catch(console.error);
