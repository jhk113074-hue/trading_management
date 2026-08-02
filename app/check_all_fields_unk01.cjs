const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function testVatOn22070400() {
  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();
  const data = docSnap.data();

  // Test 1: 22,070,400 + VAT 10% (2,207,040) = 24,277,440
  // Test 2: What if 22,070,400 + 8,676,000 = 30,746,400?
  // Is 8,676,000 equal to sum of (qty * unitPrice USD * exRate) or freight/forwarder cost in doc?
  
  console.log("=== Checking all financial / freight / forwarder / LC fields in YS-2026-UNK-01 ===");
  console.dir(data, { depth: 2 });
}

testVatOn22070400().catch(console.error);
