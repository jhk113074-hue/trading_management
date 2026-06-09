const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  const docSnap = await db.collection('companies').doc('YSACC').collection('products').doc('P0152').get();
  console.log("=== PRODUCT P0152 ===");
  console.log(docSnap.exists ? docSnap.data() : "NOT FOUND");
}

run().catch(console.error);
