const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function checkSpecificDocs() {
  console.log("=== 1. Checking YSACC(AQS)-26-01 & YSACC(YGZ)-26-01 ===");
  const targetDocIds = ['YSACC(AQS)-26-01', 'YSACC(YGZ)-26-01'];
  
  for (const docId of targetDocIds) {
    // Check orders
    const orderDoc = await db.collection('companies').doc(COMPANY_ID).collection('orders').doc(docId).get();
    if (orderDoc.exists) {
      const data = orderDoc.data();
      console.log(`[FOUND in 'orders'] ID: ${docId}`, {
        supplierName: data.supplierName !== undefined ? data.supplierName : 'undefined',
        supplier: data.supplier !== undefined ? data.supplier : 'undefined',
        seller: data.seller !== undefined ? data.seller : 'undefined',
        sourcingSupplier: data.sourcingSupplier !== undefined ? data.sourcingSupplier : 'undefined'
      });
    } else {
      console.log(`[NOT in 'orders'] ID: ${docId}`);
    }

    // Check domesticTrades
    const domDoc = await db.collection('companies').doc(COMPANY_ID).collection('domesticTrades').doc(docId).get();
    if (domDoc.exists) {
      const data = domDoc.data();
      console.log(`[FOUND in 'domesticTrades'] ID: ${docId}`, {
        supplierName: data.supplierName !== undefined ? data.supplierName : 'undefined',
        supplier: data.supplier !== undefined ? data.supplier : 'undefined',
        seller: data.seller !== undefined ? data.seller : 'undefined',
        supplierCode: data.supplierCode !== undefined ? data.supplierCode : 'undefined'
      });
    } else {
      console.log(`[NOT in 'domesticTrades'] ID: ${docId}`);
    }
  }

  console.log("\n=== 2. Checking YS-2026-UNK-01 items[0].supplier ===");
  const unkDoc = await db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01').get();
  if (unkDoc.exists) {
    const data = unkDoc.data();
    const items = data.items || [];
    console.log(`YS-2026-UNK-01 items count: ${items.length}`);
    if (items.length > 0) {
      console.log("items[0] full object:", items[0]);
      console.log(`items[0].supplier value: "${items[0].supplier}"`);
      console.log(`items[0].supplierName value: "${items[0].supplierName}"`);
    } else {
      console.log("items array is empty!");
    }
  } else {
    console.log("YS-2026-UNK-01 document not found in orders!");
  }
}

checkSpecificDocs().catch(console.error);
