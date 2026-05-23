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

const createAdmin = async () => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, "admin@ysacc.com", "ysacc1234!");
    console.log("SUCCESS: User created!");
    console.log("Email: admin@ysacc.com");
    console.log("Password: ysacc1234!");
    console.log("UID:", userCredential.user.uid);
    process.exit(0);
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      console.log("User already exists. You can log in with: admin@ysacc.com / ysacc1234! (If you set this password earlier)");
    } else {
      console.error("ERROR creating user:", error);
    }
    process.exit(1);
  }
};

createAdmin();
