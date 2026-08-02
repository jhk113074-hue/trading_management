const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function deepInspectAll14Imports() {
  console.log("=== INSPECTING ALL 14 IMPORTS DOCUMENTS ===");

  const importsRef = db.collection('companies').doc(COMPANY_ID).collection('imports');
  const snap = await importsRef.get();

  snap.docs.forEach((d, idx) => {
    const data = d.data();
    console.log(`\n[#${idx+1}] Doc ID: "${d.id}"`);
    console.log(`  importerName: "${data.importerName}" | supplierName: "${data.supplierName}" | sellerName: "${data.sellerName}"`);
    console.log(`  supplierCode: "${data.supplierCode}" | supplierId: "${data.supplierId}"`);
    console.log(`  piNumber: "${data.piNumber}" | poNumber: "${data.poNumber}"`);
    console.log(`  costBreakdown.buyingPriceUsd: ${data.costBreakdown?.buyingPriceUsd} | totalAmount: ${data.totalAmount}`);
    console.log(`  payments count: ${Array.isArray(data.payments) ? data.payments.length : 0}`);
  });
}

deepInspectAll14Imports().catch(console.error);
