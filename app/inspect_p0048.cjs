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
  const docSnap = await db.collection('companies').doc('YSACC').collection('products').doc('P0048').get();
  if (docSnap.exists) {
    console.log("P0048 exists:", docSnap.data());
  } else {
    console.log("P0048 does not exist in YSACC products!");
  }
}

run().catch(console.error);
