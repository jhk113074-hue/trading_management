const admin = require('firebase-admin');
const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  const rootColls = ['orders', 'projects', 'tasks', 'mails', 'meetings'];
  for (const col of rootColls) {
    console.log(`Searching root collection: ${col}...`);
    const snap = await db.collection(col).get();
    snap.forEach(doc => {
      const data = doc.data();
      const str = JSON.stringify(data);
      if (str.includes("WBT-1035") || str.includes("Hex Bolt") || str.includes("Paer name")) {
        console.log(`Found in root collection ${col}: ${doc.id}`);
        console.log(JSON.stringify(data, null, 2));
      }
    });
  }
  console.log("Done root search.");
}

run().catch(console.error);
