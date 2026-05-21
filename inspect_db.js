const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  console.log("=== CUSTOMERS ===");
  const custSnap = await db.collection('companies').doc('YSACC').collection('customers').get();
  custSnap.forEach(doc => {
    console.log(`ID: "${doc.id}", Code: "${doc.data().customerCode}", Name: "${doc.data().name}"`);
  });
  
  console.log("\n=== PRODUCTS ===");
  const prodSnap = await db.collection('companies').doc('YSACC').collection('products').get();
  prodSnap.forEach(doc => {
    console.log(`ID: "${doc.id}", Code: "${doc.data().productCode}", Name: "${doc.data().nameKo}"`);
  });
  
  console.log("\n=== SUPPLIERS ===");
  const supSnap = await db.collection('companies').doc('YSACC').collection('suppliers').get();
  supSnap.forEach(doc => {
    console.log(`ID: "${doc.id}", Code: "${doc.data().supplierCode}", Name: "${doc.data().name}"`);
  });
}

run().catch(console.error);
