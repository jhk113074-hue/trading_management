import React from 'react';

export type StatusVariant = 'success' | 'warning' | 'info' | 'danger';

const TONE_STYLES: Record<StatusVariant, { bg: string; accent: string }> = {
  success: { bg: 'var(--color-success-bg, #E7F5EE)', accent: 'var(--color-success, #178A54)' },
  warning: { bg: 'var(--color-warning-bg, #FBF0DD)', accent: 'var(--color-warning, #C77D00)' },
  info: { bg: 'var(--color-info-bg, #E4EFF6)', accent: 'var(--color-info, #2A6F9E)' },
  danger: { bg: 'var(--color-danger-bg, #FBE9EA)', accent: 'var(--primary-color)' },
};

export interface AlertProps {
  variant: StatusVariant;
  title: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** 좌측 브랜드 컬러 액센트 바가 있는 인라인 배너 — "선적서류 미비" 등 상태 안내용. */
export const Alert: React.FC<AlertProps> = ({ variant, title, children, style }) => {
  const t = TONE_STYLES[variant];
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        borderLeft: `3px solid ${t.accent}`,
        background: t.bg,
        fontSize: '13px',
        ...style,
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
      {children && <div style={{ color: 'var(--text-secondary)' }}>{children}</div>}
    </div>
  );
};

export interface ToastProps {
  title: string;
  children?: React.ReactNode;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}

/** 자동저장/알림 등 뜨는 알림 카드 — 좌측 브랜드 레드 액센트 바 + 흰 배경. */
export const Toast: React.FC<ToastProps> = ({ title, children, onDismiss, style }) => (
  <div
    style={{
      display: 'flex',
      gap: '8px',
      alignItems: 'flex-start',
      background: '#fff',
      border: '1px solid var(--border-color)',
      borderLeft: '3px solid var(--primary-color)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md, 0 4px 10px rgba(0,0,0,0.08))',
      padding: '12px 14px',
      minWidth: '260px',
      ...style,
    }}
  >
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{title}</div>
      {children && <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{children}</div>}
    </div>
    {onDismiss && (
      <button
        type="button"
        onClick={onDismiss}
        aria-label="닫기"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1 }}
      >
        ×
      </button>
    )}
  </div>
);
