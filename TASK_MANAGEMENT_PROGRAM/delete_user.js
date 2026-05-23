import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, deleteUser } from 'firebase/auth';

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

const deleteOldUser = async () => {
  try {
    const emailToDelete = "jhkim1130@ysacc.co.kr";
    // We assume the password is the default one since it was created earlier
    const userCredential = await signInWithEmailAndPassword(auth, emailToDelete, "ysacc1234!");
    await deleteUser(userCredential.user);
    console.log(`SUCCESS: User ${emailToDelete} completely deleted from Auth.`);
    process.exit(0);
  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  }
};

deleteOldUser();
