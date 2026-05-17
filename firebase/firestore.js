// firebase/firestore.js
// Firestore CRUD 헬퍼 함수 모음
// PostgreSQL 테이블 구조 → Firestore 컬렉션 구조로 대응

import {
  collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy,
  serverTimestamp, Timestamp, runTransaction
} from "firebase/firestore";
import { db } from "./config.js";

const COMPANY_ID = "YSACC"; // 회사 코드 (고정)

// ─────────────────────────────────────────
// 📁 Firestore 컬렉션 구조
// ─────────────────────────────────────────
// companies/{companyId}
//   └─ customers/{customerId}
//   └─ suppliers/{supplierId}
//   └─ proforma_invoices/{piId}
//         └─ revisions/{revisionId}
//               └─ line_items/{lineItemId}
//   └─ purchase_orders/{poId}
//         └─ line_items/{lineItemId}
//   └─ negotiations/{negotiationId}
// ─────────────────────────────────────────

const companyRef = () => doc(db, "companies", COMPANY_ID);
const subCol = (col) => collection(companyRef(), col);
const piRef  = (piId) => doc(subCol("proforma_invoices"), piId);

// ══════════════════════════════════════════
// 고객 (Customers)
// ══════════════════════════════════════════
export async function getCustomers() {
  const q = query(subCol("customers"), where("status", "==", "active"), orderBy("name"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addCustomer(data) {
  return await addDoc(subCol("customers"), {
    ...data,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateCustomer(customerId, data) {
  return await updateDoc(doc(subCol("customers"), customerId), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

// ══════════════════════════════════════════
// 공급업체 (Suppliers)
// ══════════════════════════════════════════
export async function getSuppliers() {
  const q = query(subCol("suppliers"), where("status", "==", "active"), orderBy("name"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addSupplier(data) {
  return await addDoc(subCol("suppliers"), {
    ...data,
    status: "active",
    createdAt: serverTimestamp()
  });
}

// ══════════════════════════════════════════
// PI 번호 자동 생성 (YSACC-2026-01 형식)
// ══════════════════════════════════════════
async function generatePINumber(piDate) {
  const year   = new Date(piDate).getFullYear();
  const metaRef = doc(db, "companies", COMPANY_ID, "meta", "pi_counter");
  
  let newNum;
  await runTransaction(db, async (tx) => {
    const metaSnap = await tx.get(metaRef);
    const current  = metaSnap.exists() ? (metaSnap.data()[`count_${year}`] || 0) : 0;
    newNum = current + 1;
    tx.set(metaRef, { [`count_${year}`]: newNum }, { merge: true });
  });
  
  return `PI-${COMPANY_ID}-${year}-${String(newNum).padStart(2, "0")}`;
}

// ══════════════════════════════════════════
// Proforma Invoice
// ══════════════════════════════════════════
export async function getPIs() {
  const q = query(subCol("proforma_invoices"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getPIById(piId) {
  const piSnap = await getDoc(piRef(piId));
  if (!piSnap.exists()) throw new Error("PI not found");
  
  // Revision 목록도 함께 가져오기
  const revSnap = await getDocs(
    query(collection(piRef(piId), "revisions"), orderBy("createdAt", "asc"))
  );
  const revisions = revSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  return { id: piSnap.id, ...piSnap.data(), revisions };
}

export async function createPI(piData, lineItems) {
  // 1. PI Number 자동 생성
  const piNumber    = await generatePINumber(piData.piDate);
  const validUntil  = new Date(piData.piDate);
  validUntil.setDate(validUntil.getDate() + (piData.validityDays || 30));

  // 2. 금액 계산
  let subtotal = 0;
  const processedItems = lineItems.map(item => {
    const costUsd      = item.costKrw / piData.exchangeRate;
    const margin       = item.profitMargin / 100;
    const salePriceUsd = costUsd / (1 - margin);
    const lineTotalUsd = salePriceUsd * item.quantity;
    subtotal += lineTotalUsd;
    return { ...item, costUsd, salePriceUsd, lineTotalUsd };
  });
  const grandTotal = subtotal
    + (piData.handlingCharges || 0)
    + (piData.freightCharges  || 0)
    + (piData.insuranceCharges|| 0);

  // 3. Firestore 트랜잭션으로 PI + Revision A + Line Items 동시 저장
  let newPiId;
  await runTransaction(db, async (tx) => {
    // PI 헤더 저장
    const newPiRef = doc(subCol("proforma_invoices"));
    newPiId = newPiRef.id;
    tx.set(newPiRef, {
      ...piData,
      piNumber,
      validUntilDate: validUntil.toISOString().split("T")[0],
      currentVersion: "A",
      status:         "draft",
      subtotalUsd:    parseFloat(subtotal.toFixed(4)),
      totalUsd:       parseFloat(grandTotal.toFixed(4)),
      createdAt:      serverTimestamp(),
      updatedAt:      serverTimestamp()
    });

    // Revision A 저장
    const revRef = doc(collection(newPiRef, "revisions"));
    tx.set(revRef, {
      version:        "A",
      revisionNumber: 1,
      status:         "draft",
      subtotalUsd:    parseFloat(subtotal.toFixed(4)),
      totalUsd:       parseFloat(grandTotal.toFixed(4)),
      createdAt:      serverTimestamp()
    });

    // Line Items 저장
    processedItems.forEach((item, idx) => {
      const liRef = doc(collection(revRef, "line_items"));
      tx.set(liRef, {
        lineNumber:   idx + 1,
        description:  item.description,
        costKrw:      item.costKrw,
        quantity:     item.quantity,
        unit:         item.unit,
        exchangeRate: piData.exchangeRate,
        profitMargin: item.profitMargin,
        costUsd:      parseFloat(item.costUsd.toFixed(4)),
        salePriceUsd: parseFloat(item.salePriceUsd.toFixed(4)),
        lineTotalUsd: parseFloat(item.lineTotalUsd.toFixed(4))
      });
    });
  });

  return { piId: newPiId, piNumber, totalUsd: grandTotal };
}

export async function updatePIStatus(piId, status) {
  const updates = { status, updatedAt: serverTimestamp() };
  if (status === "confirmed") updates.confirmedAt = serverTimestamp();
  if (status === "sent")      updates.sentAt      = serverTimestamp();
  return await updateDoc(piRef(piId), updates);
}

// ══════════════════════════════════════════
// Revision 추가 (B, C, D...)
// ══════════════════════════════════════════
export async function createNextRevision(piId, reason, updatedLineItems, updatedPIData) {
  const revSnap = await getDocs(
    query(collection(piRef(piId), "revisions"), orderBy("createdAt", "desc"))
  );
  const lastRev    = revSnap.docs[0].data();
  const nextVersion= String.fromCharCode(lastRev.version.charCodeAt(0) + 1);

  let subtotal = 0;
  const exchangeRate = updatedPIData?.exchangeRate || lastRev.exchangeRate;
  const items = updatedLineItems.map(item => {
    const costUsd      = item.costKrw / exchangeRate;
    const margin       = item.profitMargin / 100;
    const salePriceUsd = costUsd / (1 - margin);
    const lineTotalUsd = salePriceUsd * item.quantity;
    subtotal += lineTotalUsd;
    return { ...item, costUsd, salePriceUsd, lineTotalUsd };
  });

  await runTransaction(db, async (tx) => {
    const revRef = doc(collection(piRef(piId), "revisions"));
    tx.set(revRef, {
      version:        nextVersion,
      revisionNumber: revSnap.docs.length + 1,
      revisionReason: reason,
      status:         "draft",
      subtotalUsd:    parseFloat(subtotal.toFixed(4)),
      createdAt:      serverTimestamp()
    });
    items.forEach((item, idx) => {
      const liRef = doc(collection(revRef, "line_items"));
      tx.set(liRef, { lineNumber: idx + 1, ...item });
    });
    tx.update(piRef(piId), { currentVersion: nextVersion, updatedAt: serverTimestamp() });
  });

  return nextVersion;
}

// ══════════════════════════════════════════
// 대시보드 통계
// ══════════════════════════════════════════
export async function getDashboardStats() {
  const pis  = await getPIs();
  const now  = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;

  const thisMonthPIs  = pis.filter(p => p.piDate?.startsWith(thisMonth));
  const confirmedPIs  = pis.filter(p => p.status === "confirmed");
  const confirmedRev  = confirmedPIs.reduce((s, p) => s + (p.totalUsd || 0), 0);
  const winRate       = pis.length ? Math.round(confirmedPIs.length / pis.length * 100) : 0;

  return {
    thisMonthCount:   thisMonthPIs.length,
    confirmedRevenue: confirmedRev.toFixed(2),
    winRate,
    totalPIs:         pis.length
  };
}
