const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function findTaxInvoicesField() {
  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();
  const data = docSnap.data();

  console.log("=== ALL ROOT KEYS IN YS-2026-UNK-01 ===");
  console.log(Object.keys(data));

  // Find any key related to tax, invoice, payment, installment
  Object.keys(data).forEach(k => {
    if (k.toLowerCase().includes('tax') || k.toLowerCase().includes('pay') || k.toLowerCase().includes('settle') || k.toLowerCase().includes('bill') || k.toLowerCase().includes('form')) {
      console.log(`\nKey "${k}":`, JSON.stringify(data[k], null, 2));
    }
  });
}

findTaxInvoicesField().catch(console.error);
