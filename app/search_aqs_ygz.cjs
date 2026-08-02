const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function searchDocIds() {
  console.log("=== Searching for YSACC(AQS)-26-01 & YSACC(YGZ)-26-01 across all collections ===");
  const collections = ['orders', 'domesticTrades', 'imports', 'proforma_invoices'];
  
  for (const colName of collections) {
    const snap = await db.collection('companies').doc(COMPANY_ID).collection(colName).get();
    snap.docs.forEach(d => {
      if (d.id.includes('AQS') || d.id.includes('YGZ')) {
        const data = d.data();
        console.log(`[Collection: ${colName}] Match ID: "${d.id}"`, {
          supplierName: data.supplierName !== undefined ? data.supplierName : 'undefined',
          supplier: data.supplier !== undefined ? data.supplier : 'undefined',
          seller: data.seller !== undefined ? data.seller : 'undefined',
          sourcingSupplier: data.sourcingSupplier !== undefined ? data.sourcingSupplier : 'undefined',
          piNumber: data.piNumber !== undefined ? data.piNumber : 'undefined',
          ciNumber: data.ciNumber !== undefined ? data.ciNumber : 'undefined'
        });
      }
    });
  }
}

searchDocIds().catch(console.error);
