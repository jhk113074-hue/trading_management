const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('./tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function main() {
  const ordersRef = db.collection('companies').doc(COMPANY_ID).collection('orders');
  const docSnap = await ordersRef.doc('YS-2026-UNK-01').get();
  
  if (!docSnap.exists) {
    console.error("Order YS-2026-UNK-01 not found!");
    process.exit(1);
  }

  const data = docSnap.data();
  const historyLogs = data.history_logs || data.historyLogs || data.changeHistory || [];

  console.log(`=== Total history_logs in YS-2026-UNK-01: ${historyLogs.length} ===\n`);

  historyLogs.forEach((log, index) => {
    console.log(`[${index}] timestamp: ${log.timestamp || log.date} | user: ${log.user || log.userName || log.userEmail} | actionType: ${log.actionType || log.type} | desc: ${JSON.stringify(log.description || log.content || log.action)}`);
  });

  process.exit(0);
}

main().catch(console.error);
