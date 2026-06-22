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
  const docRef = db.collection('companies').doc('YSACC').collection('products').doc('P0163');
  
  console.log("Checking if P0163 exists...");
  let snap = await docRef.get();
  console.log("P0163 exists:", snap.exists);
  
  if (snap.exists) {
    console.log("Attempting to delete P0163 using Admin SDK...");
    await docRef.delete();
    console.log("Deleted. Checking again...");
    snap = await docRef.get();
    console.log("P0163 exists after delete:", snap.exists);
  }
}

run().catch(console.error);
