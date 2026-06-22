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
  const colRef = db.collection('companies').doc('YSACC').collection('products');
  const snap = await colRef.get();
  
  console.log(`Total products: ${snap.size}`);
  
  let fixedCount = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const docId = doc.id;
    
    // If there is an internal 'id' field, and it does not match docId, or we want to normalize it
    if (data.id && data.id !== docId) {
      console.log(`- Document ID mismatch! Doc ID: "${docId}" | internal id field: "${data.id}"`);
      console.log(`  Fixing by updating the internal id field to match Doc ID...`);
      await doc.ref.update({ id: docId });
      fixedCount++;
    }
  }
  
  console.log(`Finished data correction. Total fixed: ${fixedCount}`);
}

run().catch(console.error);
