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
  
  console.log(`Total products in database: ${snap.size}`);
  
  let matchCount = 0;
  snap.docs.forEach(doc => {
    const data = doc.data();
    const nameKo = data.nameKo || '';
    if (nameKo.includes('환기구') || nameKo.includes('VENT')) {
      matchCount++;
      console.log(`[${matchCount}] Doc ID: "${doc.id}" | productCode: "${data.productCode}" | nameKo: "${nameKo}"`);
    }
  });
}

run().catch(console.error);
