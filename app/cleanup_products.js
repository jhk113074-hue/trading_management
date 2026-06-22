import { initializeApp } from 'firebase/app';
import { getFirestore, doc, deleteDoc, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB6w0sak_vV3AwW6iSypq2XfRJmt-LBWPw',
  authDomain: 'tradingmanagement-c1cf4.firebaseapp.com',
  projectId: 'tradingmanagement-c1cf4',
  storageBucket: 'tradingmanagement-c1cf4.firebasestorage.app',
  messagingSenderId: '1033735327012',
  appId: '1:1033735327012:web:b0d235d08ef2f8856cf7b1',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  const colRef = collection(db, 'companies', 'YSACC', 'products');
  const snap = await getDocs(colRef);
  
  console.log(`Initial total products: ${snap.size}`);
  
  const toDelete = [];
  
  snap.docs.forEach(d => {
    const id = d.id;
    // Delete if id contains '_copied_'
    if (id.includes('_copied_')) {
      toDelete.push(id);
    }
    // Delete if id starts with lowercase 'p' followed by numbers (e.g. 'p0048', 'p0163')
    else if (/^p\d+$/.test(id)) {
      toDelete.push(id);
    }
  });
  
  console.log('\n--- Documents to Delete ---');
  toDelete.forEach((id, idx) => {
    console.log(`${idx + 1}. Doc ID: "${id}"`);
  });
  
  console.log(`\nDeleting ${toDelete.length} duplicate/redundant documents...`);
  
  for (const id of toDelete) {
    const docRef = doc(db, 'companies', 'YSACC', 'products', id);
    await deleteDoc(docRef);
    console.log(`Deleted doc: ${id}`);
  }
  
  console.log('\nCleanup completed successfully!');
}

run().catch(console.error);
