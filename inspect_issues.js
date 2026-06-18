const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  console.log("=== ISSUES ===");
  const snap = await db.collection('companies').doc('YSACC').collection('issues').get();
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`-----------------------------------`);
    console.log(`ID: ${doc.id}`);
    console.log(`Title: ${data.title}`);
    console.log(`Category: ${data.category}`);
    console.log(`Priority: ${data.priority}`);
    console.log(`Status: ${data.status}`);
    console.log(`CreatedBy: ${data.createdBy}`);
    console.log(`CreatedAt: ${data.createdAt ? data.createdAt.toDate().toISOString() : 'null'}`);
    console.log(`Content:\n${data.content}`);
    if (data.attachments) {
      console.log(`Attachments:`, data.attachments);
    }
  });
}

run().catch(console.error);
