import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

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
const COMPANY_ID = 'YSACC';

async function run() {
  const snap = await getDocs(collection(db, 'companies', COMPANY_ID, 'suppliers'));
  let maxNum = 0;
  let targetDoc = null;

  snap.forEach(d => {
    const data = d.data();
    const code = data.supplierCode || '';
    if (code && typeof code === 'string') {
      const match = code.match(/^(?:SUP-|S)(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    if (data.name === 'SHINING STAR SEA & AIR CO., LTD') {
      targetDoc = { id: d.id, ...data };
    }
  });

  const nextCode = 'S' + String(maxNum + 1).padStart(4, '0');
  
  if (targetDoc) {
    console.log('Found target supplier: ' + targetDoc.name + ' (Doc ID: ' + targetDoc.id + ')');
    console.log('Next calculated code is: ' + nextCode);
    
    const docRef = doc(db, 'companies', COMPANY_ID, 'suppliers', targetDoc.id);
    await updateDoc(docRef, {
      supplierCode: nextCode
    });
    console.log('Successfully updated supplierCode to ' + nextCode + '!');
  } else {
    console.log("Could not find the supplier 'SHINING STAR SEA & AIR CO., LTD' in DB.");
  }
  process.exit(0);
}

run().catch(console.error);
