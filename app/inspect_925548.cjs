const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function inspect925548() {
  console.log("=== INSPECTING DOCUMENT 925548 IN DETAIL ===");
  const docSnap = await db.collection('companies').doc(COMPANY_ID).collection('imports').doc('925548').get();
  console.dir(docSnap.data(), { depth: null });
}

inspect925548().catch(console.error);
