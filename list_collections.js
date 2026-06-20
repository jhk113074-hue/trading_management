const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const collections = await db.listCollections();
  console.log("Root collections:");
  for (const c of collections) {
    console.log(`- ${c.id}`);
  }

  const companiesSnap = await db.collection('companies').get();
  console.log(`\nCompanies count: ${companiesSnap.size}`);
  for (const doc of companiesSnap.docs) {
    console.log(`Company ID: "${doc.id}"`);
    const subColls = await doc.ref.listCollections();
    console.log("Sub-collections:");
    for (const sc of subColls) {
      const docsSnap = await sc.get();
      console.log(`  - ${sc.id} (documents count: ${docsSnap.size})`);
    }
  }
}

run().catch(console.error);
