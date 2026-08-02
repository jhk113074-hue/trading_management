const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function inspectImport847131() {
  console.log("=== Inspecting imports document 847131 ===");
  
  const importsRef = db.collection('companies').doc(COMPANY_ID).collection('imports');
  
  // Try doc ID '847131' or query
  const directDoc = await importsRef.doc('847131').get();
  if (directDoc.exists) {
    console.log("Found direct doc ID '847131':", JSON.stringify(directDoc.data(), null, 2));
  } else {
    console.log("Doc ID '847131' not found directly. Searching imports collection...");
    const snap = await importsRef.get();
    snap.docs.forEach(d => {
      const data = d.data();
      if (d.id.includes('847131') || data.importNo === '847131' || data.managementNo === '847131' || data.quoteNo?.includes('260714-318')) {
        console.log(`[FOUND IMPORT] Doc ID: "${d.id}"`);
        console.log("Fields:", JSON.stringify(data, null, 2));
      }
    });
  }
}

inspectImport847131().catch(console.error);
