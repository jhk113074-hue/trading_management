const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  const snap = await db.collection('companies').doc('YSACC').collection('suppliers').get();
  const suppliers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  console.log(`Total loaded from DB: ${suppliers.length}`);
  
  const searchQuery = '';
  const sortKey = 'supplierCode';
  const sortDir = 1;
  
  let filtered = suppliers.filter(s => {
    const q = searchQuery.toLowerCase();
    return (
      String(s.name || "").toLowerCase().includes(q) ||
      String(s.supplierCode || "").toLowerCase().includes(q) ||
      String(s.bizNumber || "").toLowerCase().includes(q) ||
      String(s.managerName || "").toLowerCase().includes(q)
    );
  });
  
  filtered.sort((a, b) => {
    let va = a[sortKey] ?? "";
    let vb = b[sortKey] ?? "";
    return String(va).localeCompare(String(vb), "ko") * sortDir;
  });
  
  console.log("\n=== SORTED AND FILTERED RESULT ===");
  filtered.forEach(s => {
    console.log(`Code: ${s.supplierCode}, Name: ${s.name}`);
  });
}

run().catch(console.error);
