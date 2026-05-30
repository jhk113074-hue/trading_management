import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { EmailAuthProvider, reauthenticateWithCredential, updateEmail, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getMicrosoftLoginUrl } from '../utils/microsoftTodo';

export const ProfileSettings: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleMsDisconnect = async () => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        microsoftConnected: false,
        microsoftAccessToken: null,
        microsoftTokenExpiresAt: null,
        microsoftConnectedEmail: null,
        microsoftTodoListId: null
      });
      alert('Microsoft To Do 연동이 해제되었습니다.');
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert('연동 해제 중 오류가 발생했습니다.');
    }
  };

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
      <h2 style={{ fontSize: '1.8rem', color: '#1e293b', marginBottom: '8px', fontWeight: 800 }}>⚙️ 내 정보 수정</h2>
      <p style={{ color: '#64748b', marginBottom: '32px' }}>이메일 및 접속 비밀번호를 안전하게 변경하세요.</p>

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
          <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>현재 로그인 계정</div>
            <div style={{ fontWeight: 700, color: '#334155' }}>{userProfile?.email}</div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
              현재 비밀번호 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input 
              type="password" 
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="본인 확인을 위해 현재 비밀번호를 입력하세요"
              style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#f8fafc', padding: '24px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>새로운 이메일 (선택)</label>
              <input 
                type="email" 
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="변경할 이메일 주소"
                style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
              />
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>* 이메일을 변경하지 않으려면 비워두세요.</div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>새로운 비밀번호 (선택)</label>
              <input 
                type="password" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="새로운 비밀번호 (6자리 이상)"
                style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
              />
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px' }}>* 비밀번호를 변경하지 않으려면 비워두세요.</div>
            </div>

            {newPassword && (
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>새 비밀번호 확인</label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="새로운 비밀번호 재입력"
                  style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
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

      {/* Microsoft To Do 연동 섹션 */}
      <div style={{ marginTop: '24px', backgroundColor: '#ffffff', padding: '32px', borderRadius: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
        <h3 style={{ fontSize: '1.2rem', color: '#1e293b', marginBottom: '8px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>☑️ Microsoft To Do 연동 설정</span>
          <span style={{ fontSize: '0.65rem', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>생산성 시너지</span>
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: '20px' }}>YSACC 업무포탈의 할 일 리스트를 개인 스마트폰 및 PC의 MS To Do 앱과 실시간 자동 동기화합니다.</p>

        {userProfile && (userProfile as any).microsoftConnected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
              <span style={{ fontSize: '1.5rem' }}>✅</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#16a34a', fontSize: '0.9rem' }}>Microsoft To Do와 연결됨</div>
                <div style={{ fontSize: '0.75rem', color: '#15803d', marginTop: '2px' }}>
                  연결된 계정: {(userProfile as any).microsoftConnectedEmail || '회사/개인 계정'}
                </div>
              </div>
              <button
                onClick={handleMsDisconnect}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#fee2e2',
                  color: '#ef4444',
                  border: '1px solid #fca5a5',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                연동 해제
              </button>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              * 이제 업무를 등록, 수정 또는 완료할 때마다 Microsoft To Do의 'YSACC 업무포탈' 리스트에 실시간 자동 연동됩니다.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.82rem', color: '#475569', lineHeight: '1.5' }}>
              • 연동 시 MS To Do 앱 내에 <strong>"YSACC 업무포탈"</strong> 리스트가 자동 생성됩니다.<br />
              • YSACC에서 할 일을 추가하면 즉시 폰의 MS To Do 앱으로 알림이 오며 자동 동기화됩니다.<br />
              • 무료로 제한 없이 평생 사용 가능합니다.
            </div>
            <button
              onClick={async () => {
                window.location.href = await getMicrosoftLoginUrl();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                width: '100%',
                padding: '14px',
                backgroundColor: '#2f2f2f',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 23 23">
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#80bb0a" d="M12 1h10v10H12z"/>
                <path fill="#00a1f1" d="M1 12h10v10H1z"/>
                <path fill="#ffb900" d="M12 12h10v10H12z"/>
              </svg>
              Microsoft To Do 연동 시작하기
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
