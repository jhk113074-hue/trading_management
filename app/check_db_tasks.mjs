import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  authDomain: "tradingmanagement-c1cf4.firebaseapp.com",
  projectId: "tradingmanagement-c1cf4",
  storageBucket: "tradingmanagement-c1cf4.appspot.com",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkTasks() {
  console.log("Querying Firestore tasks...");
  const querySnapshot = await getDocs(collection(db, "tasks"));
  console.log(`Found ${querySnapshot.size} total tasks.`);
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.microsoftTaskId || data.title.includes("하영VN") || data.title.includes("YGZ")) {
      console.log(`- Task ID: ${doc.id}`);
      console.log(`  Title: ${data.title}`);
      console.log(`  Status: ${data.status}`);
      console.log(`  Assignee: ${data.assigneeName} (${data.assigneeId})`);
      console.log(`  msTaskId: ${data.microsoftTaskId}`);
    }
  });
}

checkTasks().catch(console.error);
