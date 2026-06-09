const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  const snap = await db.collection('companies').doc('YSACC').collection('products').get();
  let emptyCount = 0;
  let totalCount = 0;
  
  snap.forEach(doc => {
    totalCount++;
    const data = doc.data();
    if (!data.supplierName || data.supplierName.trim() === '') {
      emptyCount++;
      console.log(`Empty supplier for Product: ${doc.id} - ${data.nameKo || data.nameEn}`);
    }
  });
  
  console.log(`\nTotal products: ${totalCount}`);
  console.log(`Products with empty supplierName: ${emptyCount}`);
}

run().catch(console.error);
