// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyBkDcT7s8HpWAKRsyVmAwrdOEHBTvYiueI",
  authDomain: "ysacc-task-management.firebaseapp.com",
  projectId: "ysacc-task-management",
  storageBucket: "ysacc-task-management.firebasestorage.app",
  messagingSenderId: "874651844108",
  appId: "1:874651844108:web:e09c723d5b19614b1cf829",
  measurementId: "G-8ETGWX6RZF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Trading Portal Firebase Instance (for PI and customer stats)
export const tradingConfig = {
  apiKey: "AIzaSyB6w0sak_vV3AwW6iSypq2XfRJmt-LBWPw",
  authDomain: "tradingmanagement-c1cf4.firebaseapp.com",
  projectId: "tradingmanagement-c1cf4",
  storageBucket: "tradingmanagement-c1cf4.firebasestorage.app",
  messagingSenderId: "1033735327012",
  appId: "1:1033735327012:web:b0d235d08ef2f8856cf7b1"
};

const tradingApp = initializeApp(tradingConfig, "tradingApp");
export const tradingDb = getFirestore(tradingApp);