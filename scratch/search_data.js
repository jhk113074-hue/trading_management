const admin = require('firebase-admin');
const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function searchCollection(colRef, path) {
  const snap = await colRef.get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const str = JSON.stringify(data);
    if (str.includes("Paer name") || str.includes("Bolts & Nuts") || str.includes("WBT-1035")) {
      console.log(`Found match in document: ${path}/${doc.id}`);
      console.log(JSON.stringify(data, null, 2));
    }
    
    // Search subcollections
    const subColls = await doc.ref.listCollections();
    for (const sc of subColls) {
      await searchCollection(sc, `${path}/${doc.id}/${sc.id}`);
    }
  }
}

async function run() {
  console.log("Searching Firestore...");
  const collections = await db.listCollections();
  for (const c of collections) {
    await searchCollection(c, c.id);
  }
  console.log("Search finished.");
}

run().catch(console.error);
