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
  
  const q = 'air';
  console.log(`Searching for "${q}" among ${snap.size} products...`);
  
  snap.docs.forEach(doc => {
    const p = doc.data();
    const matchesSearch = 
      String(p.nameKo || "").toLowerCase().includes(q) ||
      String(p.nameEn || "").toLowerCase().includes(q) ||
      String(p.productCode || "").toLowerCase().includes(q) ||
      String(p.supplierName || "").toLowerCase().includes(q) ||
      String(p.categoryLarge || "").toLowerCase().includes(q) ||
      String(p.categoryMedium || "").toLowerCase().includes(q);
      
    if (matchesSearch) {
      console.log(`- Doc ID: "${doc.id}" | productCode: "${p.productCode}" | nameKo: "${p.nameKo}" | nameEn: "${p.nameEn}"`);
    }
  });
}

run().catch(console.error);
