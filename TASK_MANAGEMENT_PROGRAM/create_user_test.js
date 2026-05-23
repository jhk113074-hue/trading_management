import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

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

const testCreate = async () => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, "jhkim1130@naver.com", "ysacc1234!");
    console.log(`SUCCESS: User created with UID: ${userCredential.user.uid}`);
    process.exit(0);
  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  }
};

testCreate();
