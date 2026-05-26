import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../index.css'; // For basic styling if needed

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);
    
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      console.error(err);
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '40px', backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '48px', height: '48px', backgroundColor: '#10b981', color: 'white', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 'bold', margin: '0 auto 16px' }}>
            Y
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b', margin: '0 0 8px 0' }}>YSACC 업무 시스템</h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>직원 계정으로 로그인해 주세요</p>
        </div>

        {error && (
          <div style={{ backgroundColor: '#fee2e2', color: '#ef4444', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '20px', textAlign: 'center', fontWeight: '600' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>이메일</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="employee@ysacc.com"
              style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', outline: 'none', transition: 'border-color 0.2s' }}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>비밀번호</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.95rem', outline: 'none', transition: 'border-color 0.2s' }}
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoggingIn}
            style={{ 
              marginTop: '10px',
              width: '100%', 
              padding: '14px', 
              backgroundColor: '#10b981', 
              color: 'white', 
              border: 'none', 
              borderRadius: '8px', 
              fontSize: '1rem', 
              fontWeight: 700, 
              cursor: isLoggingIn ? 'not-allowed' : 'pointer',
              opacity: isLoggingIn ? 0.7 : 1,
              transition: 'background-color 0.2s'
            }}
          >
            {isLoggingIn ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
          계정 발급 문의는 관리자에게 연락 바랍니다.
        </div>
      </div>
    </div>
  );
};
