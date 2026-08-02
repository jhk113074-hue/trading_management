const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function testExRatesReverse() {
  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();
  const data = docSnap.data();

  const krwSum = 22070400;
  const target30746400 = 30746400;

  console.log("=== Testing ₩30,746,400 Reverse Formula ===");
  console.log(`krwSum (sum of purchaseUnitPrice * qty): ₩${krwSum.toLocaleString()}`);

  // Test 1: krwSum / exchangeRate ?
  console.log(`krwSum / 1380 = $${krwSum / 1380}`);
  console.log(`krwSum / 1400 = $${krwSum / 1400}`);

  // Test 2: What if $22,070.40 * 1393.1048?
  // Test 3: What if $25,522 (total sales USD) * exchangeRate? $25,522 * 1204.7...
  // Test 4: What if $22,070,400 + (sales USD $25,522 * exRate)?
  // Test 5: What if $22,070,400 + $26,022 * 180?
  
  // Test 6: Check items + sourcingItems sum in v2.8.117 when exRate applied to USD items:
  // In v2.8.117 code:
  // items = [...data.items (9), ...data.sourcingItems (9)];
  // Items 1..9 in data.items have purchaseUnitCurrency === 'KRW'.
  // Does sourcingItems have purchaseUnitCurrency === 'USD' or 'KRW'?
  const sourcingItems = data.sourcingItems || [];
  console.log("\n--- Checking sourcingItems currencies ---");
  sourcingItems.forEach((it, idx) => {
    console.log(`sourcingItems[${idx}] currency: "${it.currency}", purchaseUnitCurrency: "${it.purchaseUnitCurrency}", unitPrice: ${it.unitPrice}, purchaseUnitPrice: ${it.purchaseUnitPrice}`);
  });

  // Calculate v2.8.117 logic with data.items + data.sourcingItems
  let totUsd117 = 0;
  let totKrw117 = 0;
  const all18 = [...data.items, ...data.sourcingItems];
  const exRate1380 = 1380;
  all18.forEach(it => {
    const qty = Number(it.qty || 1);
    const price = Number(it.purchaseUnitPrice || 0);
    const currency = String(it.purchaseUnitCurrency || 'KRW').toUpperCase();
    if (currency === 'USD') {
      totUsd117 += qty * price;
    } else {
      totKrw117 += qty * price;
    }
  });

  const final117 = Math.round(totKrw117 + (totUsd117 * exRate1380));
  console.log(`\nv2.8.117 18 items calculation result: ₩${final117.toLocaleString()}`);

  // Test 7: What if 30,746,400 is sum of (unitPrice USD $25,522 * 1380 + VAT)?
  // 25,522 * 1380 = 35,220,360
  
  // Test 8: What if 30,746,400 is $22,070.40 USD converted @ 1393.1?
  // Test 9: What if 30,746,400 is 22,070,400 * 1.3931048?
  
  // Test 10: Check if 30,746,400 is (items[0..8] purchasePrice) + something else?
  // Let's check 30,746,400 - 22,070,400 = 8,676,000.
  // 8,676,000 / 1380 = 6,286.956... USD
}

testExRatesReverse().catch(console.error);
