const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function inspectChongqingImports() {
  console.log("=== INSPECTING ALL IMPORTS DOCUMENTS MATCHING S0068 / CHONGQING ===");

  const importsRef = db.collection('companies').doc(COMPANY_ID).collection('imports');
  const snap = await importsRef.get();

  console.log(`Total imports documents in collection: ${snap.docs.length}`);

  const targetCode = 'S0068'.toLowerCase();
  const targetName = 'chongqingshouchangnewmaterialcoltd';

  let matchCount = 0;

  snap.docs.forEach(d => {
    const data = d.data();
    const sCode = String(data.supplierCode || data.sellerCode || '').trim().toLowerCase();
    const sId = String(data.supplierId || '').trim().toLowerCase();
    const rawSName = String(data.importerName || data.sellerName || data.supplierName || '').trim();
    const sNameClean = rawSName.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

    const matchCode = sCode === targetCode || sId === targetCode;
    const matchName = sNameClean.includes('chongqing') || targetName.includes(sNameClean);

    if (matchCode || matchName) {
      matchCount++;
      console.log(`\n--- [MATCH #${matchCount}] Document ID: "${d.id}" ---`);
      console.log(`  supplierCode: "${data.supplierCode}" | sellerCode: "${data.sellerCode}" | supplierId: "${data.supplierId}"`);
      console.log(`  importerName: "${data.importerName}" | supplierName: "${data.supplierName}" | sellerName: "${data.sellerName}"`);
      console.log(`  piNumber: "${data.piNumber}" | poNumber: "${data.poNumber}" | blAwb: "${data.blAwb}" | invoiceNo: "${data.invoiceNo}" | importNo: "${data.importNo}"`);
      console.log(`  totalAmount: ${data.totalAmount} | buyingPriceUsd: ${data.costBreakdown?.buyingPriceUsd}`);
      console.log(`  paidAmount: ${data.paidAmount} | paymentStatus: "${data.paymentStatus}" | payoutStatus: "${data.payoutStatus}"`);
      console.log(`  payments array length: ${Array.isArray(data.payments) ? data.payments.length : 'none'}`);
      if (Array.isArray(data.payments) && data.payments.length > 0) {
        console.log(`  payments contents:`, JSON.stringify(data.payments));
      }
      console.log(`  importDate: "${data.importDate}" | requestDate: "${data.requestDate}" | createdAt: "${data.createdAt}"`);
    }
  });

  if (matchCount === 0) {
    console.log("No matching imports found for S0068 / CHONGQING!");
  }
}

inspectChongqingImports().catch(console.error);
