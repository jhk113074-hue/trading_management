const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

// Path to the actual service account key in firebase/ directory
const keyPath = 'e:/무역관리프로그램/firebase/tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-00445e0fa7.json';
console.log('Reading service account from path:', keyPath);
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
  const colRef = db.collection('companies').doc('YSACC').collection('products');
  const snap = await colRef.get();
  
  console.log(`Total products in DB: ${snap.size}`);
  
  const codeMap = {};
  snap.docs.forEach(doc => {
    const data = doc.data();
    const code = (data.productCode || 'NO_CODE').trim().toUpperCase();
    const id = doc.id;
    if (!codeMap[code]) {
      codeMap[code] = [];
    }
    codeMap[code].push({
      id,
      nameKo: data.nameKo,
      supplierName: data.supplierName,
      createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : 'N/A'
    });
  });
  
  const toDelete = [];
  console.log('\n--- Analysis of duplicates ---');
  for (const [code, docs] of Object.entries(codeMap)) {
    if (docs.length > 1) {
      console.log(`\nProduct Code: [${code}] has ${docs.length} documents:`);
      
      // Sort docs to determine which one to keep
      docs.sort((a, b) => {
        // Prioritize doc ID matching the code exactly (case-insensitive)
        const aMatches = a.id.toUpperCase() === code ? 1 : 0;
        const bMatches = b.id.toUpperCase() === code ? 1 : 0;
        if (aMatches !== bMatches) return bMatches - aMatches;
        
        // Otherwise keep oldest
        return a.createdAt.localeCompare(b.createdAt);
      });
      
      console.log(`  -> Keeping: ID "${docs[0].id}" | Name: "${docs[0].nameKo}"`);
      
      // Mark others for deletion
      const redundant = docs.slice(1);
      redundant.forEach(d => {
        console.log(`  -> Mark to Delete: ID "${d.id}" | Name: "${d.nameKo}"`);
        toDelete.push(d.id);
      });
    }
  }
  
  console.log(`\nDeleting ${toDelete.length} duplicate/redundant documents...`);
  
  for (const id of toDelete) {
    const docRef = colRef.doc(id);
    await docRef.delete();
    console.log(`Successfully deleted doc: "${id}"`);
  }
  
  console.log('\nAdmin SDK Cleanup completed successfully!');
}

run().catch(console.error);
