const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function checkUnk01Fields() {
  console.log("=== Inspecting YS-2026-UNK-01 Firestore fields ===");

  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    console.log("Error: YS-2026-UNK-01 document does not exist!");
    return;
  }

  const data = docSnap.data();

  // 1. items array
  const items = data.items;
  console.log(`\n1. items field:`, {
    exists: items !== undefined,
    isArray: Array.isArray(items),
    count: Array.isArray(items) ? items.length : 0
  });
  if (Array.isArray(items)) {
    console.log("   items[].supplier list:");
    items.forEach((it, idx) => {
      console.log(`   [${idx}] name: "${it.name}", supplier: "${it.supplier}", supplierName: "${it.supplierName}"`);
    });
  }

  // 2. sourcingItems array
  const sourcingItems = data.sourcingItems;
  console.log(`\n2. sourcingItems field:`, {
    exists: sourcingItems !== undefined,
    isArray: Array.isArray(sourcingItems),
    count: Array.isArray(sourcingItems) ? sourcingItems.length : 0
  });
  if (Array.isArray(sourcingItems) && sourcingItems.length > 0) {
    console.log("   sourcingItems[].supplier list:");
    sourcingItems.forEach((it, idx) => {
      console.log(`   [${idx}] name: "${it.name}", supplier: "${it.supplier}"`);
    });
  }

  // 3. basicForm.supplierPaymentInstallments
  const basicForm = data.basicForm || {};
  const supplierPaymentInstallments = basicForm.supplierPaymentInstallments;
  console.log(`\n3. basicForm.supplierPaymentInstallments:`, {
    exists: supplierPaymentInstallments !== undefined,
    keys: supplierPaymentInstallments ? Object.keys(supplierPaymentInstallments) : []
  });
  if (supplierPaymentInstallments) {
    Object.entries(supplierPaymentInstallments).forEach(([k, v]) => {
      console.log(`   Key: "${k}" -> installments count: ${Array.isArray(v) ? v.length : 0}`, v);
    });
  }

  // 4. basicForm.supplierPayments
  const supplierPayments = basicForm.supplierPayments;
  console.log(`\n4. basicForm.supplierPayments:`, {
    exists: supplierPayments !== undefined,
    keys: supplierPayments ? Object.keys(supplierPayments) : []
  });
  if (supplierPayments) {
    Object.entries(supplierPayments).forEach(([k, v]) => {
      console.log(`   Key: "${k}" -> value:`, v);
    });
  }

  // 5. Check which array actually has data for allItems
  console.log(`\n5. allItems data source check:`);
  console.log(`   data.items has data: ${Array.isArray(items) && items.length > 0} (${items?.length || 0} items)`);
  console.log(`   data.sourcingItems has data: ${Array.isArray(sourcingItems) && sourcingItems.length > 0} (${sourcingItems?.length || 0} items)`);
}

checkUnk01Fields().catch(console.error);
