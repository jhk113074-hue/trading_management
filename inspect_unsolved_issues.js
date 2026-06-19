const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const companyId = 'YSACC';
  const issuesRef = db.collection('companies').doc(companyId).collection('issues');
  const snapshot = await issuesRef.where('status', '==', '미해결').get();
  console.log(`Found ${snapshot.size} unsolved issues:`);
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`===================================`);
    console.log(`ID: ${doc.id}`);
    console.log(`Title: ${data.title}`);
    console.log(`Content: ${data.content}`);
  });
}

run().catch(console.error);
