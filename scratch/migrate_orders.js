const admin = require('firebase-admin');
const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const COMPANY_ID = 'YSACC';

async function run() {
  console.log("Fetching orders...");
  const ordersSnap = await db.collection('companies').doc(COMPANY_ID).collection('orders').get();
  
  console.log("Fetching proforma invoices...");
  const pisSnap = await db.collection('companies').doc(COMPANY_ID).collection('proforma_invoices').get();
  
  const piMap = {};
  pisSnap.forEach(doc => {
    piMap[doc.id] = doc.data();
  });

  console.log(`Processing ${ordersSnap.size} orders...`);
  let updatedCount = 0;

  for (const doc of ordersSnap.docs) {
    const order = doc.data();
    const qId = order.quotationId;
    if (!qId) {
      continue;
    }

    const pi = piMap[qId];
    if (!pi) {
      console.log(`[Order: ${doc.id}] linked PI "${qId}" not found.`);
      continue;
    }

    const freightTotal = pi.freightTotal || 0;
    if (freightTotal <= 0) {
      continue;
    }

    // Check if forwarders already set
    const hasForwarder = order.forwarders && order.forwarders.some(f => f.name === '포워딩업체-운송비');
    if (!hasForwarder) {
      console.log(`[Order: ${doc.id}] Updating with freightTotal = ${freightTotal}`);
      
      const newForwarders = [
        ...(order.forwarders || []),
        {
          name: '포워딩업체-운송비',
          freightAmount: freightTotal,
          freightCurrency: 'USD'
        }
      ];

      await doc.ref.update({
        forwarders: newForwarders,
        forwarderConfirmed: order.forwarderConfirmed || '포워딩업체-운송비',
        forwarderFreightAmount: order.forwarderFreightAmount || freightTotal,
        forwarderFreightCurrency: order.forwarderFreightCurrency || 'USD',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      updatedCount++;
    }
  }

  console.log(`Migration completed. Updated ${updatedCount} orders.`);
}

run().catch(console.error);
