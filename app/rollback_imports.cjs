const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function rollbackImports() {
  console.log("=== 1. BEFORE ROLLBACK (CURRENT STATE) ===");
  
  const doc847131Ref = db.collection('companies').doc(COMPANY_ID).collection('imports').doc('847131');
  const doc925548Ref = db.collection('companies').doc(COMPANY_ID).collection('imports').doc('925548');

  const snap847131Before = await doc847131Ref.get();
  const snap925548Before = await doc925548Ref.get();

  console.log("\n[Doc 847131 BEFORE]:", {
    totalAmount: snap847131Before.data().totalAmount,
    amount: snap847131Before.data().amount,
    totalAmountUsd: snap847131Before.data().totalAmountUsd,
    supplierCode: snap847131Before.data().supplierCode,
    supplierId: snap847131Before.data().supplierId,
    costBreakdown: snap847131Before.data().costBreakdown
  });

  console.log("\n[Doc 925548 BEFORE]:", {
    totalAmount: snap925548Before.data().totalAmount,
    amount: snap925548Before.data().amount,
    totalAmountUsd: snap925548Before.data().totalAmountUsd,
    supplierCode: snap925548Before.data().supplierCode,
    supplierId: snap925548Before.data().supplierId,
    costBreakdown: snap925548Before.data().costBreakdown
  });

  console.log("\n=== 2. EXECUTING ROLLBACK ===");

  // Rollback 847131 to original values:
  // totalAmount: undefined (delete), amount: 0, totalAmountUsd: delete, supplierCode: delete, supplierId: delete
  // costBreakdown.buyingPriceUsd: 0, costBreakdown.productCost: 0
  await doc847131Ref.update({
    totalAmount: FieldValue.delete(),
    totalAmountUsd: FieldValue.delete(),
    supplierCode: FieldValue.delete(),
    supplierId: FieldValue.delete(),
    amount: 0,
    'costBreakdown.buyingPriceUsd': 0,
    'costBreakdown.productCost': 0
  });

  // Rollback 925548 to original values:
  await doc925548Ref.update({
    totalAmount: FieldValue.delete(),
    totalAmountUsd: FieldValue.delete(),
    supplierCode: FieldValue.delete(),
    supplierId: FieldValue.delete(),
    amount: 0,
    'costBreakdown.buyingPriceUsd': 0,
    'costBreakdown.productCost': 0
  });

  console.log("\n=== 3. AFTER ROLLBACK (VERIFICATION) ===");

  const snap847131After = await doc847131Ref.get();
  const snap925548After = await doc925548Ref.get();

  console.log("\n[Doc 847131 AFTER]:", {
    totalAmount: snap847131After.data().totalAmount,
    amount: snap847131After.data().amount,
    totalAmountUsd: snap847131After.data().totalAmountUsd,
    supplierCode: snap847131After.data().supplierCode,
    supplierId: snap847131After.data().supplierId,
    costBreakdown: snap847131After.data().costBreakdown
  });

  console.log("\n[Doc 925548 AFTER]:", {
    totalAmount: snap925548After.data().totalAmount,
    amount: snap925548After.data().amount,
    totalAmountUsd: snap925548After.data().totalAmountUsd,
    supplierCode: snap925548After.data().supplierCode,
    supplierId: snap925548After.data().supplierId,
    costBreakdown: snap925548After.data().costBreakdown
  });

  console.log("\n✅ ROLLBACK COMPLETED SUCCESSFULLY!");
}

rollbackImports().catch(console.error);
