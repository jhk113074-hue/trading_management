// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB6w0sak_vV3AwW6iSypq2XfRJmt-LBWPw",
  authDomain: "tradingmanagement-c1cf4.firebaseapp.com",
  projectId: "tradingmanagement-c1cf4",
  storageBucket: "tradingmanagement-c1cf4.firebasestorage.app",
  messagingSenderId: "1033735327012",
  appId: "1:1033735327012:web:b0d235d08ef2f8856cf7b1"
};

// Initialize Firebase using compat libraries (loaded via CDN)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Make db globally accessible for app.js
window.db = db;
