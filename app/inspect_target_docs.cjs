const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function inspectTargetDocs() {
  console.log("=== Inspecting Iw9ZgqOF1BaZERbwQMBT & cZSNF9oCzlyswaP8DJg7 ===");
  
  // 1. Iw9ZgqOF1BaZERbwQMBT (ciNumber: YSACC(AQS)-26-01)
  const aqsDoc = await db.collection('companies').doc(COMPANY_ID).collection('orders').doc('Iw9ZgqOF1BaZERbwQMBT').get();
  if (aqsDoc.exists) {
    const data = aqsDoc.data();
    console.log(`\n--- YSACC(AQS)-26-01 (Doc ID: Iw9ZgqOF1BaZERbwQMBT) ---`);
    console.log(`Document ID: "${aqsDoc.id}"`);
    console.log(`ciNumber: "${data.ciNumber}"`);
    console.log(`supplierName: "${data.supplierName}"`);
    console.log(`supplier: "${data.supplier}"`);
    console.log(`seller: "${data.seller}"`);
  }

  // 2. cZSNF9oCzlyswaP8DJg7 (ciNumber: YSACC(YGZ)-26-01)
  const ygzDoc = await db.collection('companies').doc(COMPANY_ID).collection('orders').doc('cZSNF9oCzlyswaP8DJg7').get();
  if (ygzDoc.exists) {
    const data = ygzDoc.data();
    console.log(`\n--- YSACC(YGZ)-26-01 (Doc ID: cZSNF9oCzlyswaP8DJg7) ---`);
    console.log(`Document ID: "${ygzDoc.id}"`);
    console.log(`ciNumber: "${data.ciNumber}"`);
    console.log(`supplierName: "${data.supplierName}"`);
    console.log(`supplier: "${data.supplier}"`);
    console.log(`seller: "${data.seller}"`);
  }
}

inspectTargetDocs().catch(console.error);
