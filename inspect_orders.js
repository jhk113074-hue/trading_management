const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  console.log("=== ORDERS ===");
  const ordersSnap = await db.collection('companies').doc('YSACC').collection('orders').orderBy('updatedAt', 'desc').limit(5).get();
  ordersSnap.forEach(doc => {
    const data = doc.data();
    console.log(`ID: "${doc.id}", Status: "${data.status}", customer: "${data.customer}"`);
    console.log(`forwarders:`, JSON.stringify(data.forwarders, null, 2));
  });
}

run().catch(console.error);
