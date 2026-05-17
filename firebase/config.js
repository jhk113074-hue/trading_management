// firebase/config.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:            "AIzaSyB6w0sak_vV3AwW6iSypq2XfRJmt-LBWPw",
  authDomain:        "tradingmanagement-c1cf4.firebaseapp.com",
  projectId:         "tradingmanagement-c1cf4",
  storageBucket:     "tradingmanagement-c1cf4.firebasestorage.app",
  messagingSenderId: "1033735327012",
  appId:             "1:1033735327012:web:b0d235d08ef2f8856cf7b1"
};

const app = initializeApp(firebaseConfig);

export const db   = getFirestore(app);
export const auth = getAuth(app);
export default app;
