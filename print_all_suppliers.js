const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  const coll = db.collection('companies').doc('YSACC').collection('suppliers');
  const snap = await coll.get();
  console.log(`Total suppliers: ${snap.size}`);
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Sort by id
  docs.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  docs.forEach(d => {
    console.log(`${d.id}: code=${d.supplierCode}, name=${d.name}, representative=${d.representative}, bizNumber=${d.bizNumber}, phone=${d.phone}, managerName=${d.managerName}, purchaseEmail=${d.purchaseEmail}, managerPhone=${d.managerPhone}`);
  });
}

run().catch(console.error);
