import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

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
  console.log('Starting Firestore Products Deduplication...');
  try {
    const snap = await getDocs(collection(db, 'companies', 'YSACC', 'products'));
    console.log(`Total documents found: ${snap.docs.length}`);

    const seen = new Map(); // productCode -> documentId
    let deleteCount = 0;

    for (const d of snap.docs) {
      const data = d.data();
      const code = (data.productCode || d.id || '').trim().toLowerCase();
      if (!code) continue;

      if (seen.has(code)) {
        console.log(`Duplicate found! Code: ${data.productCode} | Existing DocId: ${seen.get(code)} | Duplicate DocId: ${d.id}`);
        // Delete this duplicate document
        await deleteDoc(doc(db, 'companies', 'YSACC', 'products', d.id));
        console.log(`Deleted document: ${d.id}`);
        deleteCount++;
      } else {
        seen.set(code, d.id);
      }
    }

    console.log(`Deduplication completed. Deleted ${deleteCount} duplicate documents.`);
  } catch (err) {
    console.error('Error during deduplication:', err);
  }
}

run();
