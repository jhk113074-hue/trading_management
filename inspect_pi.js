const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  console.log("=== ALL PIS ===");
  const snap = await db.collection('companies').doc('YSACC').collection('proforma_invoices').get();
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`\nID: "${doc.id}"`);
    console.log(`piNumber: "${data.piNumber}"`);
    console.log(`customerId: "${data.customerId}"`);
    console.log(`customerName: "${data.customerName}"`);
    console.log(`contactPerson: "${data.contactPerson}"`);
    console.log(`email: "${data.email}"`);
  });
}

run().catch(console.error);
