const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function checkProductsPurchasePrice() {
  const productsSnap = await db.collection('companies').doc(COMPANY_ID).collection('products').get();
  console.log(`Total products in collection: ${productsSnap.docs.length}`);

  const productsMap = new Map();
  productsSnap.docs.forEach(d => {
    const p = d.data();
    const code = p.productCode || d.id;
    productsMap.set(code, p);
  });

  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();
  const dbItems = docSnap.data().items;

  console.log("\n=== SIMULATING getSupplierPurchaseInfo LOGIC FROM OrderDetail.tsx ===");

  let sumWithMasterProd = 0;

  dbItems.forEach((it, idx) => {
    const match = (it.name || '').match(/^\[(.*?)\]\s*(.*)$/);
    const itemCode = match ? match[1] : '-';
    const matchedProd = productsMap.get(itemCode);

    let defaultPrice = matchedProd ? (matchedProd.purchasePrice || 0) : (it.unitPrice || 0);
    let defaultCurrency = matchedProd ? (matchedProd.currency || 'USD') : 'USD';

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
        defaultCurrency = matchedHists[0].currency;
      }
    }

    // Notice: in OrderDetail.tsx line 415:
    // const originalPurchasePrice = it.originalPurchasePrice != null ? it.originalPurchasePrice : (it.purchaseUnitPrice != null ? it.purchaseUnitPrice : defaultPrice);
    // const purchasePrice = it.purchaseUnitPrice != null ? it.purchaseUnitPrice : originalPurchasePrice;
    
    // BUT what if in OrderDetail PO table rendering:
    // How does the PO table get 63,200 for Manhole Panel vs 31,800 for Roof panel?
    // Let's print defaultPrice from matchedProd vs it.purchaseUnitPrice:
    console.log(`Item [${idx+1}] Code: ${itemCode} | name: "${it.name}"`);
    console.log(`  it.qty: ${it.qty}`);
    console.log(`  it.purchaseUnitPrice (in DB order item): ${it.purchaseUnitPrice}`);
    console.log(`  matchedProd.purchasePrice (in master product):`, matchedProd ? matchedProd.purchasePrice : 'N/A');
    console.log(`  defaultPrice (from history/master):`, defaultPrice);
  });
}

checkProductsPurchasePrice().catch(console.error);
