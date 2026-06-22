import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc } from 'firebase/firestore';

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
  
  console.log(`Total products fetched: ${snap.size}`);
  
  const codeMap = {};
  snap.docs.forEach(d => {
    const data = d.data();
    const code = data.productCode || 'NO_CODE';
    const id = d.id;
    if (!codeMap[code]) {
      codeMap[code] = [];
    }
    codeMap[code].push({
      id,
      nameKo: data.nameKo,
      supplierName: data.supplierName,
      createdAt: data.createdAt ? (data.createdAt.seconds ? new Date(data.createdAt.seconds * 1000).toISOString() : data.createdAt) : 'N/A'
    });
  });
  
  console.log('\n--- Duplicate Codes Analysis ---');
  let duplicatesCount = 0;
  for (const [code, docs] of Object.entries(codeMap)) {
    if (docs.length > 1) {
      duplicatesCount++;
      console.log(`\nProduct Code: [${code}] (Count: ${docs.length})`);
      docs.forEach((d, idx) => {
        console.log(`  ${idx + 1}. Document ID (Firestore ID): "${d.id}"`);
        console.log(`     - Name: "${d.nameKo}"`);
        console.log(`     - Supplier: "${d.supplierName}"`);
        console.log(`     - CreatedAt: ${d.createdAt}`);
      });
    }
  }
  
  if (duplicatesCount === 0) {
    console.log('\nNo duplicate productCodes found!');
  }
}

run().catch(console.error);
