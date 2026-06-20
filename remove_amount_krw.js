const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const COMPANY_ID = 'YSACC';

async function cleanupAmountKrw() {
  const ordersRef = db.collection('companies').doc(COMPANY_ID).collection('orders');
  const snap = await ordersRef.get();
  console.log(`Total orders fetched: ${snap.size}`);

  let cleanedCount = 0;
  let skippedCount = 0;

  for (const docSnap of snap.docs) {
    const order = docSnap.data();
    let needsUpdate = false;
    let updatedForwarders = [];

    if (order.forwarders && order.forwarders.length > 0) {
      updatedForwarders = order.forwarders.map(f => {
        const newF = { ...f };
        // Check if amountKrw is present
        if ('amountKrw' in newF) {
          // If status is PO/Sourcing or the value is 0/undefined/null, remove it
          if (
            order.status === '주문' ||
            order.status === '발주' ||
            newF.amountKrw === 0 ||
            newF.amountKrw === undefined ||
            newF.amountKrw === null
          ) {
            console.log(`- Removing amountKrw from forwarder in order ${docSnap.id}: was ${newF.amountKrw}`);
            delete newF.amountKrw;
            needsUpdate = true;
          }
        }
        return newF;
      });
    }

    if (needsUpdate) {
      await docSnap.ref.update({
        forwarders: updatedForwarders
      });
      cleanedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\nCleanup complete! Cleaned: ${cleanedCount} orders, Skipped: ${skippedCount} orders`);
  process.exit(0);
}

cleanupAmountKrw().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
