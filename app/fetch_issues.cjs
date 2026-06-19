const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const companyId = 'YSACC';
  const issuesRef = db.collection('companies').doc(companyId).collection('issues');
  const snapshot = await issuesRef.get();
  console.log(`Found ${snapshot.size} issues.`);
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`[${data.status}] No.${data.issueNo} - Title: ${data.title}`);
  });
}

run().catch(console.error);
