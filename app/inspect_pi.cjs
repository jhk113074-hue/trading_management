const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const keyPath = 'e:/무역관리프로그램/firebase/tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-00445e0fa7.json';
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
  const colRef = db.collection('companies').doc('YSACC').collection('proforma_invoices');
  const snap = await colRef.get();
  
  console.log(`Total PIs: ${snap.size}`);
  
  for (const doc of snap.docs) {
    const pi = doc.data();
    console.log(`- PI Number: "${pi.piNumber}" | Customer: "${pi.customerName}" | subtotalUsd: ${pi.subtotalUsd}`);
    
    // Get revisions
    const revSnap = await doc.ref.collection('revisions').get();
    for (const rDoc of revSnap.docs) {
      const rev = rDoc.data();
      console.log(`  * Rev Version: ${rev.version} | updatedAt: ${rev.updatedAt}`);
      
      // Get line items
      const liSnap = await rDoc.ref.collection('line_items').get();
      liSnap.docs.forEach(liDoc => {
        const li = liDoc.data();
        console.log(`    - LineItem [${li.lineNumber}] productCode: "${li.productCode}" | qty: ${li.quantity} | unit: "${li.unit}" | salePriceUsd: ${li.salePriceUsd} | lineTotalUsd: ${li.lineTotalUsd}`);
      });
    }
  }
}

run().catch(console.error);
