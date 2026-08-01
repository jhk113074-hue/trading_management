import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function inspectOrder() {
  const COMPANY_ID = 'YSACC';
  const ordersRef = collection(db, 'companies', COMPANY_ID, 'orders');
  const snap = await getDocs(ordersRef);
  
  let foundDoc = null;
  snap.forEach(d => {
    const data = d.data();
    if (data.ciNumber === 'YS(AB)-26-03' || d.id === 'YS(AB)-26-03' || data.piNumber === 'PI-YS-2026-04') {
      foundDoc = { id: d.id, ...data };
    }
  });

  if (!foundDoc) {
    console.log("No matching order found!");
    return;
  }

  console.log("Found Order Document ID:", foundDoc.id);
  console.log("ciNumber:", foundDoc.ciNumber, "piNumber:", foundDoc.piNumber);
  console.log("sourcingItems length:", foundDoc.sourcingItems?.length);
  console.log("sourcingItems sample:", JSON.stringify(foundDoc.sourcingItems?.slice(0, 5), null, 2));
  console.log("items length:", foundDoc.items?.length);
  console.log("items sample:", JSON.stringify(foundDoc.items?.slice(0, 5), null, 2));
}

inspectOrder().catch(console.error);
