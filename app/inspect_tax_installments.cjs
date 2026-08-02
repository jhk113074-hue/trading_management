const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function inspectTaxAndInstallments() {
  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();
  const data = docSnap.data();

  console.log("=== INSPECTING basicForm FIELDS IN YS-2026-UNK-01 ===");
  const basicForm = data.basicForm || {};

  console.log("1. supplierTaxInvoices:", JSON.stringify(basicForm.supplierTaxInvoices, null, 2));
  console.log("2. supplierPaymentInstallments:", JSON.stringify(basicForm.supplierPaymentInstallments, null, 2));
  console.log("3. supplierPayments:", JSON.stringify(basicForm.supplierPayments, null, 2));
  console.log("4. supplierTaxTypes:", JSON.stringify(basicForm.supplierTaxTypes, null, 2));
}

inspectTaxAndInstallments().catch(console.error);
