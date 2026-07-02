const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

try {
  admin.initializeApp({
    projectId: 'tradingmanagement-c1cf4'
  });
} catch (e) {
  console.log("Initialization info:", e.message);
}

const db = getFirestore();

async function run() {
  try {
    const snap = await db.collection('companies').doc('YSACC').collection('issues').get();
    console.log(`=== Found ${snap.size} Issues via Admin SDK ===`);
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
    console.error("Fetch failed:", e);
    process.exit(1);
  }
}

run();
