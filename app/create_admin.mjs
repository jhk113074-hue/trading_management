import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB6w0sak_vV3AwW6iSypq2XfRJmt-LBWPw',
  authDomain: 'tradingmanagement-c1cf4.firebaseapp.com',
  projectId: 'tradingmanagement-c1cf4',
  storageBucket: 'tradingmanagement-c1cf4.firebasestorage.app',
  messagingSenderId: '1033735327012',
  appId: '1:1033735327012:web:b0d235d08ef2f8856cf7b1',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const createAdmin = async () => {
  const email = 'admin@ysacc.com';
  const password = 'ysacc1234!';

  try {
    // Try to create user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    console.log('✅ Admin user CREATED successfully!');
    console.log('  UID:', userCredential.user.uid);

    // Save user profile to Firestore
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      name: '관리자',
      email: email,
      role: '관리자',
      department: '경영지원',
      position: '대표이사',
      createdAt: new Date().toISOString(),
      status: '활성'
    });

    console.log('✅ User profile saved to Firestore!');
    console.log('');
    console.log('=================================');
    console.log('  Email:    ', email);
    console.log('  Password: ', password);
    console.log('=================================');
    process.exit(0);
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      console.log('⚠️  User already exists. Trying to sign in...');
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        console.log('✅ Sign-in SUCCESSFUL! Account exists and password is correct.');
        console.log('  UID:', cred.user.uid);
        console.log('');
        console.log('=================================');
        console.log('  Email:    ', email);
        console.log('  Password: ', password);
        console.log('=================================');
      } catch (loginErr) {
        console.error('❌ Sign-in FAILED. Password may have been changed.');
        console.error('  Error:', loginErr.message);
      }
      process.exit(0);
    } else {
      console.error('❌ ERROR creating user:', error.message);
      process.exit(1);
    }
  }
};

createAdmin();
