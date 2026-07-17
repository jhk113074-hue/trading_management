const admin = require('firebase-admin');
const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  const companyId = 'YSACC';
  
  console.log("Searching orders...");
  const ordersSnap = await db.collection('companies').doc(companyId).collection('orders').get();
  ordersSnap.forEach(doc => {
    const data = doc.data();
    const str = JSON.stringify(data);
    if (str.includes("WBT-1035") || str.includes("Hex Bolt") || str.includes("Paer name")) {
      console.log(`Found in order: ${doc.id}`);
      // Find where exactly
      if (data.orderItems) {
        console.log(`  orderItems match:`, data.orderItems.filter(it => JSON.stringify(it).includes("WBT-1035") || JSON.stringify(it).includes("Hex Bolt")));
      }
      if (data.packingList) {
        console.log(`  packingList exists`);
      }
    }
  });

  console.log("Searching proforma invoices...");
  const piSnap = await db.collection('companies').doc(companyId).collection('proforma_invoices').get();
  piSnap.forEach(doc => {
    const data = doc.data();
    const str = JSON.stringify(data);
    if (str.includes("WBT-1035") || str.includes("Hex Bolt")) {
      console.log(`Found in PI: ${doc.id}`);
    }
  });

  console.log("Done.");
}

run().catch(console.error);
