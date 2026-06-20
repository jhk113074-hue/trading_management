const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const snap = await db.collection('companies').doc('YSACC').collection('orders').get();
  console.log(`Orders count: ${snap.size}`);
  snap.forEach(d => {
    console.log(`Order ID: ${d.id}, forwarders:`, d.data().forwarders);
  });
}

run().catch(console.error);
