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
  const colRef = db.collection('companies');
  const snap = await colRef.get();
  
  console.log(`Total companies: ${snap.size}`);
  snap.docs.forEach(doc => {
    console.log(`- Company ID: "${doc.id}"`);
  });
}

run().catch(console.error);
