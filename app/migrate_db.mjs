import { initializeApp as initializeClientApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore as getClientFirestore, collection, getDocs } from 'firebase/firestore';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// 1. Initialize OLD project using Client SDK
const oldConfig = {
  apiKey: "AIzaSyBkDcT7s8HpWAKRsyVmAwrdOEHBTvYiueI",
  authDomain: "ysacc-task-management.firebaseapp.com",
  projectId: "ysacc-task-management",
  storageBucket: "ysacc-task-management.firebasestorage.app",
  messagingSenderId: "874651844108",
  appId: "1:874651844108:web:e09c723d5b19614b1cf829"
};
const oldApp = initializeClientApp(oldConfig);
const oldAuth = getAuth(oldApp);
const oldDb = getClientFirestore(oldApp);

// 2. Initialize NEW project using Admin SDK
const serviceAccount = JSON.parse(readFileSync('../tradingmanagement-c1cf4-firebase-adminsdk-fbsvc-9970ad3905.json', 'utf8'));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const newDb = admin.firestore();

function sanitizeData(data) {
  if (data === null || data === undefined) return data;
  
  if (typeof data.toDate === 'function') {
    return data.toDate();
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }
  
  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeData(value);
    }
    return sanitized;
  }
  
  return data;
}

async function migrateCollection(collectionName) {
  console.log(`Migrating ${collectionName}...`);
  const snapshot = await getDocs(collection(oldDb, collectionName));
  const batch = newDb.batch();
  let count = 0;

  snapshot.forEach((docSnap) => {
    let data = docSnap.data();
    data = sanitizeData(data);
    const newDocRef = newDb.collection(collectionName).doc(docSnap.id);
    batch.set(newDocRef, data);
    count++;
  });

  if (count > 0) {
    await batch.commit();
    console.log(`Successfully migrated ${count} documents for ${collectionName}.`);
  } else {
    console.log(`No documents found in ${collectionName}.`);
  }
}

async function run() {
  try {
    console.log("Authenticating with old project...");
    await signInWithEmailAndPassword(oldAuth, "admin@ysacc.com", "ysacc1234!");
    console.log("Authenticated successfully.");

    await migrateCollection('users');
    await migrateCollection('tasks');
    await migrateCollection('projects');
    console.log("Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Error migrating:", err);
    process.exit(1);
  }
}

run();
