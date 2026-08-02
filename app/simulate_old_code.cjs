const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function simulateOldCode() {
  const snap = await db.collection('companies').doc(COMPANY_ID).collection('orders').get();
  
  console.log("=== SIMULATING LOOSE MATCHING WITH USD CONVERSION LOGIC ===");
  
  let totalKrwOld = 0;
  const supplierNameClean = "주한성엠엔에스";
  const exRate = 1380;

  snap.docs.forEach(d => {
    const data = d.data();
    const items = [...(data.items || []), ...(data.sourcingItems || [])];
    
    const matched = items.filter(item => {
      const iSupp = String(item.supplier || item.supplierName || '').trim();
      if (!iSupp) return false;
      const iSuppClean = iSupp.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
      return iSuppClean.includes(supplierNameClean) || supplierNameClean.includes(iSuppClean);
    });

    if (matched.length > 0) {
      let totUsd = 0;
      let totKrw = 0;
      matched.forEach(item => {
        const qty = Number(item.qty || 1);
        const price = Number(item.purchaseUnitPrice || item.unitPrice || 0);
        if (item.purchaseUnitCurrency === 'KRW') {
          totKrw += qty * price;
        } else {
          totUsd += qty * price;
        }
      });
      const finalKrw = Math.round(totKrw + (totUsd * exRate));
      console.log(`Doc ID: ${d.id} matched ${matched.length} items -> finalKrw: ₩${finalKrw.toLocaleString()}`);
      totalKrwOld += finalKrw;
    }
  });

  console.log(`Total Old Simulated KRW: ₩${totalKrwOld.toLocaleString()}`);
}

simulateOldCode().catch(console.error);
