import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, getDocs, orderBy } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBkDcT7s8HpWAKRsyVmAwrdOEHBTvYiueI",
  authDomain: "ysacc-task-management.firebaseapp.com",
  projectId: "ysacc-task-management",
  storageBucket: "ysacc-task-management.firebasestorage.app",
  messagingSenderId: "874651844108",
  appId: "1:874651844108:web:e09c723d5b19614b1cf829"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const testQuery = async () => {
  try {
    console.log("Running query...");
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const membersData = [];
    querySnapshot.forEach((d) => {
      membersData.push({ id: d.id, ...d.data() });
    });
    console.log("Query success. Members count:", membersData.length);
    console.log(membersData);
    process.exit(0);
  } catch (error) {
    console.error("ERROR:", error);
    process.exit(1);
  }
};

testQuery();
