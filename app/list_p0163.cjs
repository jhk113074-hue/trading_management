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
  
  snap.docs.forEach(doc => {
    const data = doc.data();
    const code = data.productCode || '';
    const id = doc.id;
    if (code.toLowerCase().includes('0163') || id.toLowerCase().includes('0163')) {
      console.log(`- Doc ID: "${id}"`);
      console.log(`  productCode: "${code}" (Length: ${code.length})`);
      console.log(`  nameKo: "${data.nameKo}"`);
      console.log(`  supplierName: "${data.supplierName}"`);
      console.log(`  createdAt: ${data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : 'N/A'}`);
    }
  });
}

run().catch(console.error);
