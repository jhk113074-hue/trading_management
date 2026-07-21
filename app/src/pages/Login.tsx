import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const MailIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const LockIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ArrowRightIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saveId, setSaveId] = useState(false);
  const [error, setError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  React.useEffect(() => {
    const savedEmail = localStorage.getItem('savedEmail');
    if (savedEmail) {
      setEmail(savedEmail);
      setSaveId(true);
    }
  }, []);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoggingIn(true);

    try {
      await login(email, password);
      if (saveId) {
        localStorage.setItem('savedEmail', email);
      } else {
        localStorage.removeItem('savedEmail');
      }
      navigate('/');
    } catch (err: any) {
      console.error(err);
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="yl-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

        .yl-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #F8F8F9;
          font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif;
          word-break: keep-all;
        }
        .yl-band {
          width: 100%;
          min-height: 320px;
          background: #161617;
          position: relative;
          overflow: hidden;
        }
        .yl-band::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(520px 380px at 82% 16%, rgba(21,140,155,0.38), transparent 60%),
            radial-gradient(560px 420px at 8% 92%, rgba(189,23,35,0.34), transparent 62%);
          pointer-events: none;
        }
        .yl-band-inner {
          position: relative;
          max-width: 960px;
          margin: 0 auto;
          padding: 44px 56px;
          height: 100%;
          min-height: 320px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          box-sizing: border-box;
        }
        .yl-logo {
          height: 40px;
          width: auto;
          filter: brightness(0) invert(1);
          object-fit: contain;
        }
        .yl-eyebrow {
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.55);
          margin: 0;
        }
        .yl-headline {
          font-family: 'Pretendard', sans-serif;
          font-weight: 800;
          font-size: 40px;
          line-height: 1.2;
          letter-spacing: -0.02em;
          color: #fff;
          max-width: 620px;
          margin: 12px 0 0;
        }
        .yl-card {
          width: min(460px, calc(100% - 40px));
          background: #FFFFFF;
          border: 1px solid #E4E4E6;
          border-radius: 12px;
          box-shadow: 0 12px 28px rgba(22,22,23,0.12), 0 4px 8px rgba(22,22,23,0.05);
          padding: 32px 40px 34px;
          margin-top: -128px;
          margin-bottom: 48px;
          position: relative;
          z-index: 2;
          box-sizing: border-box;
        }
        .yl-card-title {
          font-family: 'Pretendard', sans-serif;
          font-weight: 700;
          font-size: 24px;
          letter-spacing: -0.02em;
          color: #262628;
          margin: 0 0 4px;
        }
        .yl-card-subtitle {
          font-size: 14px;
          color: #8A8A8D;
          margin: 0 0 22px;
        }
        .yl-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 14px;
        }
        .yl-field-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #555555;
          margin-bottom: 6px;
        }
        .yl-field-input-wrap {
          position: relative;
        }
        .yl-field-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #8A8A8D;
          display: flex;
          pointer-events: none;
        }
        .yl-input {
          width: 100%;
          border: 1px solid #CFCFD2;
          border-radius: 8px;
          padding: 9px 12px 9px 34px;
          font-size: 15px;
          font-family: inherit;
          outline: none;
          box-sizing: border-box;
          transition: border-color 120ms, box-shadow 120ms;
        }
        .yl-input:focus {
          border-color: #2AA2B1;
          box-shadow: 0 0 0 3px rgba(42,162,177,0.35);
        }
        .yl-input.yl-input-error {
          border-color: #BD1723;
        }
        .yl-options {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }
        .yl-checkbox-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          white-space: nowrap;
        }
        .yl-checkbox {
          width: 18px;
          height: 18px;
          border-radius: 3px;
          border: 1px solid #CFCFD2;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background-color 120ms, border-color 120ms;
        }
        .yl-checkbox.checked {
          background: #BD1723;
          border-color: #BD1723;
          color: #fff;
        }
        .yl-checkbox-label {
          font-size: 13px;
          color: #555555;
          user-select: none;
        }
        .yl-link {
          font-size: 13px;
          font-weight: 600;
          color: #A5121C;
          text-decoration: none;
          white-space: nowrap;
        }
        .yl-link:hover {
          text-decoration: underline;
        }
        .yl-error-msg {
          font-size: 13px;
          color: #BD1723;
          font-weight: 600;
          margin: -8px 0 16px;
        }
        .yl-submit {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: #BD1723;
          color: #fff;
          border: none;
          border-radius: 8px;
          box-shadow: 0 6px 18px rgba(189,23,35,0.22);
          font-family: inherit;
          font-size: 15px;
          font-weight: 600;
          padding: 12px 16px;
          cursor: pointer;
          transition: background-color 120ms, transform 80ms;
        }
        .yl-submit:hover:not(:disabled) {
          background: #A5121C;
        }
        .yl-submit:active:not(:disabled) {
          transform: translateY(0.5px) scale(0.99);
        }
        .yl-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .yl-footnote {
          font-size: 13px;
          color: #8A8A8D;
          text-align: center;
          margin-top: 18px;
        }
        .yl-footnote a {
          color: #A5121C;
          font-weight: 600;
          text-decoration: none;
        }
        .yl-footnote a:hover {
          text-decoration: underline;
        }
        @media (max-width: 640px) {
          .yl-band-inner { padding: 32px 24px; }
          .yl-headline { font-size: 28px; }
          .yl-card { padding: 28px 24px 30px; }
          .yl-fields { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="yl-band">
        <div className="yl-band-inner">
          <img src="/logo.png" alt="YSACC" className="yl-logo" />
          <div>
            <p className="yl-eyebrow">YSACC 업무포탈</p>
            <h1 className="yl-headline">오늘의 업무, 여기서 시작하세요.</h1>
          </div>
        </div>
      </div>

      <form className="yl-card" onSubmit={handleLogin}>
        <h2 className="yl-card-title">업무포탈 로그인</h2>
        <p className="yl-card-subtitle">회사 이메일 계정으로 로그인하세요.</p>

        <div className="yl-fields">
          <div>
            <label className="yl-field-label" htmlFor="yl-email">회사 이메일</label>
            <div className="yl-field-input-wrap">
              <span className="yl-field-icon"><MailIcon /></span>
              <input
                id="yl-email"
                type="email"
                autoComplete="username"
                placeholder="gildong.hong@ysacc.co.kr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={`yl-input${error ? ' yl-input-error' : ''}`}
              />
            </div>
          </div>
          <div>
            <label className="yl-field-label" htmlFor="yl-password">비밀번호</label>
            <div className="yl-field-input-wrap">
              <span className="yl-field-icon"><LockIcon /></span>
              <input
                id="yl-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-describedby={error ? 'yl-error' : undefined}
                aria-invalid={!!error}
                className={`yl-input${error ? ' yl-input-error' : ''}`}
              />
            </div>
          </div>
        </div>

        {error && <p id="yl-error" className="yl-error-msg">{error}</p>}

        <div className="yl-options">
          <label className="yl-checkbox-wrap">
            <input
              type="checkbox"
              checked={saveId}
              onChange={(e) => setSaveId(e.target.checked)}
              style={{ display: 'none' }}
            />
            <span className={`yl-checkbox${saveId ? ' checked' : ''}`}>
              {saveId && <CheckIcon />}
            </span>
            <span className="yl-checkbox-label">자동 로그인</span>
          </label>
          <a href="mailto:admin@ysacc.co.kr" className="yl-link">계정 문의</a>
        </div>

        <button type="submit" className="yl-submit" disabled={isLoggingIn}>
          {isLoggingIn ? '로그인 중...' : '로그인'}
          {!isLoggingIn && <ArrowRightIcon />}
        </button>

        <p className="yl-footnote">
          계정 문제가 있으신가요? <a href="mailto:admin@ysacc.co.kr">시스템 관리자에게 문의</a>
        </p>
      </form>
    </div>
  );
};
