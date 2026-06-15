import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { User } from '../types';

// ── 비활성 자동 로그아웃 시간 (분 단위) ──────────────────────────
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 60분 비활성 시 자동 로그아웃

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userProfile: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  // ── 비활성 타이머 리셋 ──────────────────────────────────────────
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      logout();
      alert('장시간 비활성으로 인해 자동 로그아웃되었습니다.');
    }, INACTIVITY_TIMEOUT_MS);
  }, [logout]);

  // ── 사용자 활동 이벤트 감지 ─────────────────────────────────────
  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    const handleActivity = () => {
      if (currentUser) resetInactivityTimer();
    };
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, handleActivity));
  }, [currentUser, resetInactivityTimer]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserProfile({ id: userDoc.id, ...userDoc.data() } as User);
          } else {
            // Fallback for users not in Firestore but in Auth
            setUserProfile({
              id: user.uid,
              name: user.email?.split('@')[0] || '사용자',
              role: '직원',
              email: user.email || ''
            } as User);
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
        }
        resetInactivityTimer();
      } else {
        setUserProfile(null);
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [resetInactivityTimer]);

  const login = async (email: string, pass: string) => {
    // 로컬 지속성: 새로고침·재방문 시에도 로그인 유지
    // 비활성 60분 자동 로그아웃으로 보안 유지
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, pass);
  };

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, loading, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
