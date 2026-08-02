const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function checkPiAndItems() {
  console.log("=== 1. Checking PI-YS-2026-UNG-04 in orders collection ===");
  const ordersRef = db.collection('companies').doc(COMPANY_ID).collection('orders');
  
  // Search by doc ID or piNumber
  const directDoc = await ordersRef.doc('PI-YS-2026-UNG-04').get();
  if (directDoc.exists) {
    console.log("Found direct doc ID 'PI-YS-2026-UNG-04':", directDoc.data());
  } else {
    console.log("Direct doc ID 'PI-YS-2026-UNG-04' does not exist. Searching by piNumber / ciNumber...");
    const snap = await ordersRef.get();
    let found = false;
    snap.docs.forEach(d => {
      const data = d.data();
      if (d.id === 'PI-YS-2026-UNG-04' || data.piNumber === 'PI-YS-2026-UNG-04' || data.ciNumber === 'PI-YS-2026-UNG-04') {
        found = true;
        console.log(`[FOUND] Doc ID: "${d.id}" | piNumber: "${data.piNumber}" | ciNumber: "${data.ciNumber}"`);
        const items = data.items || [];
        console.log(`items count: ${items.length}`);
        if (items.length > 0) {
          console.log(`items[0].supplier: "${items[0].supplier}"`);
          console.log(`items[0].supplierName: "${items[0].supplierName}"`);
        }
      }
    });
    if (!found) {
      console.log("PI-YS-2026-UNG-04 NOT found in orders collection!");
    }
  }

  console.log("\n=== 2. Checking YS-2026-UNK-01 items[0] full object ===");
  const unkDoc = await ordersRef.doc('YS-2026-UNK-01').get();
  if (unkDoc.exists) {
    const data = unkDoc.data();
    const items = data.items || [];
    console.log(`YS-2026-UNK-01 total items: ${items.length}`);
    if (items.length > 0) {
      console.log("items[0] FULL OBJECT Keys & Values:");
      console.dir(items[0], { depth: null });
    }
  } else {
    console.log("YS-2026-UNK-01 document not found!");
  }
}

checkPiAndItems().catch(console.error);
