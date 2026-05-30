import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { SCOPES } from '../utils/microsoftTodo';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      // 1. URL Query 파라미터 파싱 (?code=...&state=...)
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');

      // 2. State 검증 (CSRF 방지)
      const storedState = localStorage.getItem('ms_auth_state');
      if (!state || state !== storedState) {
        setStatus('error');
        setErrorMessage('보안 상태 값(State)이 일치하지 않습니다. 요청을 신뢰할 수 없습니다.');
        return;
      }

      // 사용한 state 제거
      localStorage.removeItem('ms_auth_state');

      if (!code) {
        setStatus('error');
        const errorParam = params.get('error');
        const errorDesc = params.get('error_description');
        if (errorParam) {
          setErrorMessage(`Microsoft 에러: ${errorParam}\n설명: ${errorDesc}`);
        } else {
          setErrorMessage(`인증 코드(Auth Code)를 발급받지 못했습니다.\n(현재 URL: ${window.location.href})`);
        }
        return;
      }

      // Firebase 로그인 상태 확인
      if (!currentUser) {
        setStatus('error');
        setErrorMessage('YSACC 로그인 세션이 유효하지 않습니다. 먼저 로그인해 주세요.');
        return;
      }

      try {
        // 3. Authorization Code를 Access Token 및 Refresh Token으로 교환
        console.log('Microsoft 토큰 교환 요청 중...');
        
        const verifier = localStorage.getItem('ms_code_verifier') || '';
        localStorage.removeItem('ms_code_verifier');

        const tokenParams = new URLSearchParams();
        tokenParams.append('client_id', '5b6039c6-5e18-48d8-b122-7c155709d3d7');
        tokenParams.append('code', code);
        tokenParams.append('redirect_uri', 'https://tradingmanagement-c1cf4.web.app/auth-callback');
        tokenParams.append('grant_type', 'authorization_code');
        tokenParams.append('scope', SCOPES);
        tokenParams.append('code_verifier', verifier);

        const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: tokenParams.toString()
        });

        if (!tokenResponse.ok) {
          const errData = await tokenResponse.json();
          throw new Error(`토큰 교환 실패: ${errData.error_description || tokenResponse.statusText}`);
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token; // 마스터키!
        const expiresIn = tokenData.expires_in || '3600';

        if (!accessToken || !refreshToken) {
          throw new Error('필수 토큰 정보(Access/Refresh Token)가 누락되었습니다.');
        }

        // 4. Microsoft Graph API로 사용자 프로필 정보 조회
        const meResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        });

        if (!meResponse.ok) {
          throw new Error('Microsoft 사용자 프로필 조회 실패');
        }

        const meData = await meResponse.json();
        const userEmail = meData.mail || meData.userPrincipalName || 'Microsoft Account';

        // 5. Firestore에 토큰들(마스터키 포함) 저장
        const expiresAt = Date.now() + parseInt(expiresIn) * 1000;
        
        await updateDoc(doc(db, 'users', currentUser.uid), {
          microsoftConnected: true,
          microsoftAccessToken: accessToken,
          microsoftRefreshToken: refreshToken, // 평생 자동 갱신용 마스터키
          microsoftTokenExpiresAt: expiresAt,
          microsoftConnectedEmail: userEmail,
        });

        setStatus('success');
        
        // 성공 시 2초 후 프로필 화면으로 리다이렉트
        setTimeout(() => {
          navigate('/profile');
        }, 2000);

      } catch (err: any) {
        console.error('Microsoft To Do 연동 처리 에러:', err);
        setStatus('error');
        setErrorMessage(err.message || '연동 중 알 수 없는 오류가 발생했습니다.');
      }
    };

    handleCallback();
  }, [currentUser, navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      padding: '24px',
      fontFamily: "'Outfit', 'Inter', sans-serif"
    }}>
      {/* CSS Keyframes injected dynamically */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.05); opacity: 1; }
        }
      `}</style>

      <div style={{
        backgroundColor: 'rgba(30, 41, 59, 0.7)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '24px',
        padding: '48px 32px',
        width: '100%',
        maxWidth: '480px',
        textAlign: 'center',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.3s ease'
      }}>
        {/* Logo Icon */}
        <div style={{ marginBottom: '32px', display: 'inline-flex', position: 'relative' }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            boxShadow: '0 10px 25px rgba(59, 130, 246, 0.4)',
            animation: status === 'processing' ? 'pulse 2s infinite ease-in-out' : 'none'
          }}>
            {status === 'processing' && '🔄'}
            {status === 'success' && '✨'}
            {status === 'error' && '❌'}
          </div>
        </div>

        {status === 'processing' && (
          <>
            <h2 style={{ fontSize: '1.6rem', color: '#ffffff', fontWeight: 800, marginBottom: '12px' }}>
              Microsoft 계정 연동 중
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '32px' }}>
              평생 만료 없는 무제한 연동 마스터키(Refresh Token)를<br />안전하게 갱신하고 있습니다.
            </p>
            <div style={{
              display: 'inline-block',
              width: '40px',
              height: '40px',
              border: '4px solid rgba(255, 255, 255, 0.1)',
              borderTop: '4px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
          </>
        )}

        {status === 'success' && (
          <>
            <h2 style={{ fontSize: '1.6rem', color: '#10b981', fontWeight: 800, marginBottom: '12px' }}>
              연동 완료!
            </h2>
            <p style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>
              축하합니다! Microsoft To Do 무제한 연동에 성공했습니다.
            </p>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '32px' }}>
              이제 1시간 만료 없이 평생 자동으로 동기화됩니다.
            </p>
            <div style={{
              padding: '12px 20px',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              borderRadius: '12px',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'inline-block'
            }}>
              자동으로 리다이렉트 중...
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 style={{ fontSize: '1.6rem', color: '#ef4444', fontWeight: 800, marginBottom: '12px' }}>
              연동 실패
            </h2>
            <p style={{ color: '#fca5a5', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '24px', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              {errorMessage}
            </p>
            <button
              onClick={() => navigate('/profile')}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background 0.2s',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#dc2626')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ef4444')}
            >
              내 정보 페이지로 돌아가기
            </button>
          </>
        )}
      </div>
    </div>
  );
};
