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
  
  const results = [];
  snap.docs.forEach(doc => {
    const data = doc.data();
    results.push({
      id: doc.id,
      productCode: data.productCode,
      nameKo: data.nameKo,
      supplierName: data.supplierName
    });
  });
  
  fs.writeFileSync('C:/Users/jhk01/.gemini/antigravity/brain/a17fb235-61ce-446d-a48e-b782175253ef/scratch/all_db_products.json', JSON.stringify(results, null, 2), 'utf8');
  console.log(`Saved all ${results.length} products to scratch/all_db_products.json`);
}

run().catch(console.error);
