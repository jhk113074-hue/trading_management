const admin = require('firebase-admin');
const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const docRef = db.collection('companies').doc('YSACC').collection('products').doc('P0043');
  const snap = await docRef.get();
  if (snap.exists) {
    console.log("Product P0043 Data:", JSON.stringify(snap.data(), null, 2));
  } else {
    console.log("Product P0043 not found under YSACC companies collection.");
    // Search in all documents
    const allProds = await db.collectionGroup('products').get();
    allProds.forEach(d => {
      if (d.id.includes('P0043') || (d.data().productCode && d.data().productCode.includes('P0043'))) {
        console.log(`Found product doc in path: ${d.ref.path}`);
        console.log(JSON.stringify(d.data(), null, 2));
      }
    });
  }
}

run().catch(console.error);
