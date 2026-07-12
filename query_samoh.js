const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function check() {
  try {
    const snap = await db.collection('companies').doc('YSACC').collection('customers').get();
    console.log(`Found ${snap.size} total customers in Firestore:`);
    snap.forEach(d => {
      const data = d.data();
      if (d.id.includes('삼오') || (data.name && data.name.includes('삼오')) || (data.nameKo && data.nameKo.includes('삼오'))) {
        console.log(`MATCHED ID: ${d.id}`);
        console.log(`Data:`, JSON.stringify(data, null, 2));
      }
    });
  } catch (err) {
    console.error('Error:', err);
  }
}

check();
