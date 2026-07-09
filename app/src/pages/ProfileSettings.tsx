import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { EmailAuthProvider, reauthenticateWithCredential, updateEmail, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const ProfileSettings: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentUser || !userProfile?.email) {
      setError('로그인 정보가 유효하지 않습니다.');
      return;
    }

    if (!currentPassword) {
      setError('본인 인증을 위해 현재 비밀번호를 입력해주세요.');
      return;
    }

    if (!newEmail && !newPassword) {
      setError('변경할 이메일이나 새 비밀번호를 입력해주세요.');
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setError('새 비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. 재인증 (Re-authenticate)
      const credential = EmailAuthProvider.credential(userProfile.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);

      let isChanged = false;

      // 2. 이메일 변경 처리
      if (newEmail && newEmail !== userProfile.email) {
        await updateEmail(currentUser, newEmail);
        await updateDoc(doc(db, 'users', currentUser.uid), {
          email: newEmail
        });
        isChanged = true;
      }

      // 3. 비밀번호 변경 처리
      if (newPassword) {
        await updatePassword(currentUser, newPassword);
        isChanged = true;
      }

      if (isChanged) {
        setSuccess('계정 정보가 성공적으로 변경되었습니다!');
        setCurrentPassword('');
        setNewEmail('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('현재 비밀번호가 올바르지 않습니다.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('이미 사용 중인 이메일입니다.');
      } else if (err.code === 'auth/weak-password') {
        setError('새 비밀번호는 6자리 이상이어야 합니다.');
      } else {
        setError('정보 변경 중 오류가 발생했습니다: ' + err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.8rem', color: 'var(--text-primary)', marginBottom: '8px', fontWeight: 800 }}>⚙️ 내 정보 수정</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>이메일 및 접속 비밀번호를 안전하게 변경하세요.</p>

      <div style={{ backgroundColor: '#ffffff', padding: '32px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
        
        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '16px', borderRadius: '8px', marginBottom: '24px', fontWeight: 'bold' }}>
            {error}
          </div>
        )}
        
        {success && (
          <div style={{ backgroundColor: '#d1fae5', color: '#10b981', padding: '16px', borderRadius: '8px', marginBottom: '24px', fontWeight: 'bold' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* 현재 계정 정보 안내 */}
          <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>현재 로그인 계정</div>
            <div style={{ fontWeight: 700, color: '#334155' }}>{userProfile?.email}</div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>
              현재 비밀번호 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input 
              type="password" 
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="본인 확인을 위해 현재 비밀번호를 입력하세요"
              style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-default)', fontSize: '0.95rem' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#f8fafc', padding: '24px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>새로운 이메일 (선택)</label>
              <input 
                type="email" 
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="변경할 이메일 주소"
                style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-default)', fontSize: '0.95rem' }}
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>* 이메일을 변경하지 않으려면 비워두세요.</div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>새로운 비밀번호 (선택)</label>
              <input 
                type="password" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="새로운 비밀번호 (6자리 이상)"
                style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-default)', fontSize: '0.95rem' }}
              />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>* 비밀번호를 변경하지 않으려면 비워두세요.</div>
            </div>

            {newPassword && (
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>새 비밀번호 확인</label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="새로운 비밀번호 재입력"
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-default)', fontSize: '0.95rem' }}
                />
              </div>
            )}
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting}
            style={{ 
              marginTop: '8px',
              width: '100%', 
              padding: '16px', 
              backgroundColor: '#10b981', 
              color: 'white', 
              border: 'none', 
              borderRadius: '8px', 
              fontSize: '1rem', 
              fontWeight: 700, 
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? '저장 중...' : '변경 사항 저장하기'}
          </button>
        </form>
      </div>
    </div>
  );
};
