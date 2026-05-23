import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBkDcT7s8HpWAKRsyVmAwrdOEHBTvYiueI",
  authDomain: "ysacc-task-management.firebaseapp.com",
  projectId: "ysacc-task-management",
  storageBucket: "ysacc-task-management.firebasestorage.app",
  messagingSenderId: "874651844108",
  appId: "1:874651844108:web:e09c723d5b19614b1cf829"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const testEdit = async () => {
  try {
    const adminUid = "NhaR6TpP4zfJYX8p2QsrEZPUfV03";
    console.log("Signing in...");
    await signInWithEmailAndPassword(auth, "admin@ysacc.com", "ysacc1234!");
    console.log("Signed in. Updating doc...");
    await updateDoc(doc(db, 'users', adminUid), {
      name: '관리자 테스트'
    });
    console.log("SUCCESS: Document updated.");
    process.exit(0);
  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  }
};

testEdit();
