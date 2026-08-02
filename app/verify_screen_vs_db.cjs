const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = require('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json');

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const COMPANY_ID = 'YSACC';

async function verifyScreenVsDbOrder() {
  const docRef = db.collection('companies').doc(COMPANY_ID).collection('orders').doc('YS-2026-UNK-01');
  const docSnap = await docRef.get();
  const data = docSnap.data();
  const dbItems = data.items;

  console.log("=== SCREEN VS DB ITEMS MATCHING ANALYSIS ===");

  // Screen table row order from screenshot:
  // 1. Manhole Panel_1x1m(HANSUNG) -> qty: 8, price: 63,200 -> 505,600
  // 2. Roof_1x1m_Panel(HS) -> qty: 104, price: 31,800 -> 3,307,200
  // 3. Side 1x2m Panel(HS) -> qty: 196, price: 88,400 -> 17,326,400
  // 4. Bottom 1x1 Panel_2mH(HS) -> qty: 104, price: 54,000 -> 5,616,000
  // 5. Drain_1x1_Panel_2mH(HS) -> qty: 8, price: 53,900 -> 431,200
  // 6. GRP LADDER 2.0M(TAESUNG) -> qty: 20, price: 47,000 -> 940,000
  // 7. GRP LADDER 3.0M(TAESUNG) -> qty: 10, price: 66,000 -> 660,000
  // 8. Level_Indicator_2mH(HS) -> qty: 20, price: 58,000 -> 1,160,000
  // 9. level_Indicator_3mH(HS) -> qty: 10, price: 80,000 -> 800,000

  const screenMapping = [
    { idx: 1, name: "Manhole Panel_1x1m(HANSUNG)", qty: 8, price: 63200 },
    { idx: 2, name: "Roof_1x1m_Panel(HS)", qty: 104, price: 31800 },
    { idx: 3, name: "Side 1x2m Panel(HS)", qty: 196, price: 88400 },
    { idx: 4, name: "Bottom 1x1 Panel_2mH(HS)", qty: 104, price: 54000 },
    { idx: 5, name: "Drain_1x1_Panel_2mH(HS)", qty: 8, price: 53900 },
    { idx: 6, name: "GRP LADDER 2.0M(TAESUNG)", qty: 20, price: 47000 },
    { idx: 7, name: "GRP LADDER 3.0M(TAESUNG)", qty: 10, price: 66000 },
    { idx: 8, name: "Level_Indicator_2mH(HS)", qty: 20, price: 58000 },
    { idx: 9, name: "level_Indicator_3mH(HS)", qty: 10, price: 80000 }
  ];

  let subtotal = 0;
  screenMapping.forEach(row => {
    const lineAmt = row.qty * row.price;
    subtotal += lineAmt;
    console.log(`[Row ${row.idx}] ${row.name} | qty: ${row.qty} * ₩${row.price.toLocaleString()} = ₩${lineAmt.toLocaleString()}`);
  });

  console.log("==========================================");
  console.log(`SCREEN TABLE SUBTOTAL (합계): ₩${subtotal.toLocaleString()}`);
  console.log(`Matches ₩30,746,400? ${subtotal === 30746400}`);
  console.log("==========================================");
}

verifyScreenVsDbOrder().catch(console.error);
