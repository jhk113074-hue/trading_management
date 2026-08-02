const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function checkRealDbStrings() {
  console.log("=== Comparing real DB supplierName vs items[0].supplier ===");

  // 1. Get supplier master name from suppliers collection
  const supSnap = await db.collection('companies').doc(COMPANY_ID).collection('suppliers').get();
  let masterName = "";
  supSnap.docs.forEach(d => {
    const data = d.data();
    if (data.name && data.name.includes("한성")) {
      masterName = data.name;
      console.log(`Found supplier master doc ID: "${d.id}", name: "${data.name}"`);
    }
  });

  // 2. Get order items[0].supplier
  const orderDoc = await db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01').get();
  const orderItemSupplier = orderDoc.data().items[0].supplier;

  console.log(`Master Name: "${masterName}"`);
  console.log(`Item Supplier: "${orderItemSupplier}"`);

  const cleanMaster = masterName.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
  const cleanItem = orderItemSupplier.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

  console.log(`cleanMaster: "${cleanMaster}" (charCodes: ${Array.from(cleanMaster).map(c => c.charCodeAt(0)).join(',')})`);
  console.log(`cleanItem:   "${cleanItem}" (charCodes: ${Array.from(cleanItem).map(c => c.charCodeAt(0)).join(',')})`);

  console.log(`\nExact Match Result (cleanMaster === cleanItem): ${cleanMaster === cleanItem}`);
}

checkRealDbStrings().catch(console.error);
