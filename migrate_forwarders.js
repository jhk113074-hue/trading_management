/**
 * 기존 주문 데이터 포워더 마이그레이션
 * freightAmount + freightCurrency => amountUsd / amountKrw 로 변환
 */
const admin = require('firebase-admin');
const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const COMPANY_ID = 'YSACC';

async function migrateForwarders() {
  const ordersRef = db.collection('companies').doc(COMPANY_ID).collection('orders');
  const snap = await ordersRef.get();

  let migratedCount = 0;
  let skippedCount = 0;

  for (const docSnap of snap.docs) {
    const order = docSnap.data();
    let needsUpdate = false;
    let updatedForwarders = [];

    // Case 1: forwarders array exists
    if (order.forwarders && order.forwarders.length > 0) {
      updatedForwarders = order.forwarders.map(f => {
        // Already migrated
        if (f.amountUsd !== undefined || f.amountKrw !== undefined) {
          return f;
        }
        // Needs migration from freightAmount/freightCurrency
        needsUpdate = true;
        return {
          name: f.name || '',
          amountUsd: f.freightCurrency === 'USD' ? (f.freightAmount || 0) : 0,
          amountKrw: f.freightCurrency !== 'USD' ? (f.freightAmount || 0) : 0,
          // Keep legacy fields for backward compat
          freightAmount: f.freightAmount,
          freightCurrency: f.freightCurrency
        };
      });
    }
    // Case 2: legacy single forwarder fields only (no forwarders array)
    else if (order.forwarderConfirmed && (!order.forwarders || order.forwarders.length === 0)) {
      needsUpdate = true;
      updatedForwarders = [{
        name: order.forwarderConfirmed,
        amountUsd: order.forwarderFreightCurrency === 'USD' ? (order.forwarderFreightAmount || 0) : 0,
        amountKrw: order.forwarderFreightCurrency !== 'USD' ? (order.forwarderFreightAmount || 0) : 0,
        freightAmount: order.forwarderFreightAmount,
        freightCurrency: order.forwarderFreightCurrency
      }];
    }

    if (needsUpdate) {
      await docSnap.ref.update({
        forwarders: updatedForwarders,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`✅ Migrated: ${docSnap.id} (${updatedForwarders.length} forwarders)`);
      migratedCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(`\n완료! 마이그레이션: ${migratedCount}건, 스킵: ${skippedCount}건`);
  process.exit(0);
}

migrateForwarders().catch(err => {
  console.error('마이그레이션 실패:', err);
  process.exit(1);
});
