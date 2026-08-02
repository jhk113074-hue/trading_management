const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function listAllOrderDocIds() {
  console.log("=== Listing ALL documents in 'orders' collection ===");
  const snap = await db.collection('companies').doc(COMPANY_ID).collection('orders').get();
  console.log(`Total orders: ${snap.size}`);
  snap.docs.forEach(d => {
    const data = d.data();
    console.log(`Doc ID: "${d.id}" | piNumber: "${data.piNumber || ''}" | ciNumber: "${data.ciNumber || ''}" | supplierName: "${data.supplierName || ''}"`);
  });
}

listAllOrderDocIds().catch(console.error);
