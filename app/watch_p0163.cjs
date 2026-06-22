const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const keyPath = 'e:/무역관리프로그램/firebase/tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-00445e0fa7.json';
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

console.log("Starting real-time watch on YSACC/products/P0163...");

const docRef = db.collection('companies').doc('YSACC').collection('products').doc('P0163');

docRef.onSnapshot(docSnap => {
  if (docSnap.exists) {
    console.log(`[WATCH] P0163 EXISTS:`, docSnap.data().nameKo || docSnap.data().productCode);
    console.log(`        updatedAt:`, docSnap.data().updatedAt);
  } else {
    console.log(`[WATCH] P0163 DELETED/DOES NOT EXIST!`);
  }
}, err => {
  console.error("Watch error:", err);
});
