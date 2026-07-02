// Use local workspace dependencies via CJS require
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

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
  try {
    const snap = await getDocs(collection(db, 'companies', 'YSACC', 'issues'));
    console.log(`=== Found ${snap.size} Issues in YSACC DB ===`);
    snap.forEach(doc => {
      const data = doc.data();
      if (data.status !== '해결됨') {
        console.log(`\nID: ${doc.id}`);
        console.log(`상태: [${data.status}] | 분류: [${data.category}] | 제목: ${data.title}`);
        console.log(`내용: ${data.content}`);
      }
    });
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
