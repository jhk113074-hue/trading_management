// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAQqhOPbu5om2Zg5OEWTHk1BMmuOuI7YWA",
  authDomain: "container-packer-1a187.firebaseapp.com",
  projectId: "container-packer-1a187",
  storageBucket: "container-packer-1a187.firebasestorage.app",
  messagingSenderId: "856160400299",
  appId: "1:856160400299:web:adedddfad878b33dbb98ee"
};

// Initialize Firebase using compat libraries (loaded via CDN)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Make db globally accessible for app.js
window.db = db;
