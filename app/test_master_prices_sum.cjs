const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function testMasterProductPriceSum() {
  const productsSnap = await db.collection('companies').doc(COMPANY_ID).collection('products').get();
  const productsMap = new Map();
  productsSnap.docs.forEach(d => {
    const p = d.data();
    const code = p.productCode || d.id;
    productsMap.set(code, p);
  });

  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();
  const dbItems = docSnap.data().items;

  console.log("=== CALCULATING SUM WITH MASTER PRODUCT / HISTORY PRICES ===");

  let sumMasterPrices = 0;

  dbItems.forEach((it, idx) => {
    const match = (it.name || '').match(/^\[(.*?)\]\s*(.*)$/);
    const itemCode = match ? match[1] : '-';
    const matchedProd = productsMap.get(itemCode);

    let defaultPrice = matchedProd ? (matchedProd.purchasePrice || 0) : (it.unitPrice || 0);

    if (matchedProd && matchedProd.purchasePrices && matchedProd.purchasePrices.length > 0) {
      const activeSup = (it.supplier || '').trim();
      let matchedHists = matchedProd.purchasePrices.filter(p => (p.supplierName || '').trim() === activeSup || p.supplierCode === activeSup);
      if (matchedHists.length === 0 && matchedProd.suppliers && matchedProd.suppliers.length > 0) {
        const def = matchedProd.suppliers.find(s => s.isDefault) || matchedProd.suppliers[0];
        matchedHists = matchedProd.purchasePrices.filter(p => p.supplierCode === def.supplierCode || p.supplierName === def.supplierName);
      }
      if (matchedHists.length > 0) {
        matchedHists.sort((a, b) => (b.validFrom || '').localeCompare(a.validFrom || ''));
        defaultPrice = matchedHists[0].price;
      }
    }

    const qty = it.qty || 1;
    const lineAmt = qty * defaultPrice;
    sumMasterPrices += lineAmt;

    console.log(`Item [${idx+1}] Code: ${itemCode} | qty: ${qty} * defaultPrice: ₩${defaultPrice.toLocaleString()} = ₩${lineAmt.toLocaleString()}`);
  });

  console.log("==========================================");
  console.log(`SUM USING MASTER PRODUCT PRICES: ₩${sumMasterPrices.toLocaleString()}`);
  console.log(`Matches ₩30,746,400? ${sumMasterPrices === 30746400}`);
  console.log("==========================================");
}

testMasterProductPriceSum().catch(console.error);
