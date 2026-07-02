import { initializeApp, getApp } from 'firebase/app';
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// 단일 통합 Firebase 프로젝트 (tradingmanagement-c1cf4)
// Auth + Firestore 모두 이 하나의 프로젝트로 통합
export const firebaseConfig = {
  apiKey: 'AIzaSyB6w0sak_vV3AwW6iSypq2XfRJmt-LBWPw',
  authDomain: 'tradingmanagement-c1cf4.firebaseapp.com',
  projectId: 'tradingmanagement-c1cf4',
  storageBucket: 'tradingmanagement-c1cf4.firebasestorage.app',
  messagingSenderId: '1033735327012',
  appId: '1:1033735327012:web:b0d235d08ef2f8856cf7b1',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// 브라우저 종료 시 자동 로그아웃 지정 (세션 단위 보존)
setPersistence(auth, browserSessionPersistence).catch(err => {
  console.error("Firebase auth persistence initialization failed:", err);
});
export const db = getFirestore(app);
export const storage = getStorage(app);
export const COMPANY_ID = 'YSACC';

// TeamManagement에서 사용자 생성 시 관리자 로그아웃 방지를 위한 보조 앱
export const getSecondaryApp = () => {
  try {
    return initializeApp(firebaseConfig, 'SecondaryApp');
  } catch {
    // 이미 초기화된 경우
    return getApp('SecondaryApp');
  }
};