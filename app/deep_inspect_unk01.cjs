const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function deepInspectUnk01() {
  console.log("=== Deep Inspection of YS-2026-UNK-01 items & formulas ===");

  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();
  const data = docSnap.data();

  // 1. Show items[0] full object keys and values
  console.log("--- 1. items[0] FULL OBJECT ---");
  console.dir(data.items[0], { depth: null });

  // 2. Check all items for purchase price fields
  console.log("\n--- 2. All 9 items price fields summary ---");
  data.items.forEach((it, idx) => {
    console.log(`Item [${idx + 1}] ${it.name}:`, {
      qty: it.qty,
      unitPrice: it.unitPrice,
      purchaseUnitPrice: it.purchaseUnitPrice,
      purchaseUnitCurrency: it.purchaseUnitCurrency,
      originalPurchasePrice: it.originalPurchasePrice,
      originalPurchaseCurrency: it.originalPurchaseCurrency,
      amount: it.amount,
      currency: it.currency
    });
  });

  // 3. Formula reverse engineering for 30,746,400
  console.log("\n--- 3. Reverse engineering formula for ₩30,746,400 ---");

  // Formula A: sum(qty * purchaseUnitPrice)
  const sumA = data.items.reduce((acc, it) => acc + (it.qty || 0) * (it.purchaseUnitPrice || 0), 0);
  console.log(`Formula A: sum(qty * purchaseUnitPrice) = ₩${sumA.toLocaleString()}`);

  // Formula B: sum(qty * purchaseUnitPrice) * 1.3931...
  // Let's test if there is an exchange rate applied to unitPrice ($48 USD * exRate + purchaseUnitPrice) or something!
  const sumUnitPriceUsd = data.items.reduce((acc, it) => acc + (it.qty || 0) * (it.unitPrice || 0), 0);
  console.log(`Sum of sales unitPrice (USD): $${sumUnitPriceUsd.toLocaleString()}`);

  const exRate1380 = 1380;
  console.log(`Sales Amount in KRW @ 1380: ₩${(sumUnitPriceUsd * exRate1380).toLocaleString()}`);

  // Formula C: items + sourcingItems duplicate calculation
  const itemsPlusSourcing = [...(data.items || []), ...(data.sourcingItems || [])];
  const sumC = itemsPlusSourcing.reduce((acc, it) => acc + (it.qty || 0) * (it.purchaseUnitPrice || 0), 0);
  console.log(`Formula C: (items + sourcingItems) sum(qty * purchaseUnitPrice) = ₩${sumC.toLocaleString()}`);

  // Formula D: What if 30,746,400 is VAT included of something? 30746400 / 1.1 = 27951272.7
  // What if 30746400 is items[0..N] with custom exRate or sourcingItems?
  console.log(`\nIs ₩30,746,400 equal to 22,070,400 + something else in doc?`);
  console.log(`Difference: 30,746,400 - 22,070,400 = ₩${(30746400 - 22070400).toLocaleString()}`);

  // Check if doc has sourcingAmountUsd, buyingPriceUsd, etc.
  console.log("\nOrder level financial fields:", {
    totalAmount: data.totalAmount,
    currency: data.currency,
    exchangeRate: data.exchangeRate,
    sourcingAmountUsd: data.sourcingAmountUsd,
    buyingPriceUsd: data.buyingPriceUsd,
    supplierQuoteAmount: data.supplierQuoteAmount
  });
}

deepInspectUnk01().catch(console.error);
