const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function main() {
  const importsRef = db.collection('companies').doc(COMPANY_ID).collection('imports');
  const docSnap = await importsRef.doc('847131').get();

  if (!docSnap.exists) {
    console.error("Import doc 847131 not found!");
    process.exit(1);
  }

  const d = docSnap.data();
  console.log("=== 847131 Firestore Document Fields ===");
  console.log("id:", d.id);
  console.log("poNumber:", d.poNumber);
  console.log("blAwb:", d.blAwb);
  console.log("importerName:", d.importerName);
  console.log("supplierCode:", d.supplierCode);
  console.log("supplierId:", d.supplierId);
  console.log("piItems length:", d.piItems?.length);
  console.log("piItems sample:", JSON.stringify(d.piItems, null, 2));
  console.log("payments:", JSON.stringify(d.payments, null, 2));
  console.log("paymentStatus:", d.paymentStatus);
  console.log("costBreakdown:", JSON.stringify(d.costBreakdown, null, 2));
  console.log("actualCostBreakdown:", JSON.stringify(d.actualCostBreakdown, null, 2));
  console.log("forwarderName:", d.forwarderName);
  console.log("documents:", JSON.stringify(d.documents, null, 2));
  console.log("taxInvoiceNumber:", d.taxInvoiceNumber);
  console.log("taxInvoiceIssuedDate:", d.taxInvoiceIssuedDate);
  console.log("collections:", JSON.stringify(d.collections, null, 2));
  console.log("profitReviewCompleted:", d.profitReviewCompleted);
  console.log("profitReviewedDate:", d.profitReviewedDate);
  console.log("profitReviewedBy:", d.profitReviewedBy);

  process.exit(0);
}

main().catch(console.error);
