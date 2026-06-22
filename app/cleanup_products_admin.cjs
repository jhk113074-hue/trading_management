const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

// Read service account using fs.readFileSync to avoid CJS loader issues
const keyPath = path.join(__dirname, 'serviceAccountKey.json');
console.log('Reading service account from path:', keyPath);
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function run() {
  const colRef = db.collection('companies').doc('YSACC').collection('products');
  const snap = await colRef.get();
  
  console.log(`Total products: ${snap.size}`);
  
  const toDelete = [];
  snap.docs.forEach(doc => {
    const id = doc.id;
    if (id.includes('_copied_')) {
      toDelete.push(id);
    } else if (/^p\d+$/.test(id)) {
      toDelete.push(id);
    }
  });
  
  console.log('\n--- Documents to Delete via Admin SDK ---');
  toDelete.forEach((id, idx) => {
    console.log(`${idx + 1}. Doc ID: "${id}"`);
  });
  
  for (const id of toDelete) {
    const docRef = colRef.doc(id);
    await docRef.delete();
    console.log(`Successfully deleted doc: ${id}`);
  }
  
  console.log('\nAdmin SDK Cleanup completed successfully!');
}

run().catch(console.error);
