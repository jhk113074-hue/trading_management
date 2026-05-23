import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBkDcT7s8HpWAKRsyVmAwrdOEHBTvYiueI",
  authDomain: "ysacc-task-management.firebaseapp.com",
  projectId: "ysacc-task-management",
  storageBucket: "ysacc-task-management.firebasestorage.app",
  messagingSenderId: "874651844108",
  appId: "1:874651844108:web:e09c723d5b19614b1cf829"
};

import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const setAdminRole = async () => {
  try {
    const adminUid = "NhaR6TpP4zfJYX8p2QsrEZPUfV03";
    await signInWithEmailAndPassword(auth, "admin@ysacc.com", "ysacc1234!");
    
    await setDoc(doc(db, 'users', adminUid), {
      name: '관리자',
      email: 'admin@ysacc.com',
      role: '관리자',
      createdAt: new Date().toISOString(),
      status: '활성'
    });
    console.log("SUCCESS: Admin profile created in Firestore.");
    process.exit(0);
  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  }
};

setAdminRole();
