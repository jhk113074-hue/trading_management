const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function update925548() {
  console.log("=== Updating imports document 925548 ===");
  
  const importRef = db.collection('companies').doc(COMPANY_ID).collection('imports').doc('925548');
  
  // Update totalAmount = 6450, supplierCode = S0068, supplierId = S0068, supplierName
  const updateData = {
    totalAmount: 6450,
    amount: 6450,
    totalAmountUsd: 6450,
    supplierCode: 'S0068',
    supplierId: 'S0068',
    supplierName: 'CHONGQING SHOUCHANG NEW MATERIAL CO., LTD.',
    sellerName: 'CHONGQING SHOUCHANG NEW MATERIAL CO., LTD.',
    costBreakdown: {
      todayExchangeRate: 1450,
      appliedExchangeRate: 1450,
      buyingPriceUsd: 6450,
      buyingQty: 1000,
      productCost: 9352500,
      freightCost: 0,
      customsCost: 0,
      otherCost: 0,
      localTransportCost: 0,
      importDeclareFee: 0,
      transferFee: 0,
      antiDumpingRate: 0,
      ftaTaxRate: 0
    }
  };

  await importRef.update(updateData);
  console.log("Successfully updated import 925548 with totalAmount = 6450 and supplierCode = S0068!");
}

update925548().catch(console.error);
