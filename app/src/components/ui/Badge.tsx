import React from 'react';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const TONE_STYLES: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: '#F1F1F2', fg: 'var(--text-secondary)' },
  brand: { bg: 'rgba(189,23,35,0.08)', fg: 'var(--primary-color)' },
  success: { bg: '#dcfce7', fg: '#15803d' },
  warning: { bg: '#fef3c7', fg: '#b45309' },
  danger: { bg: '#fee2e2', fg: '#b91c1c' },
  info: { bg: 'rgba(42,162,177,0.12)', fg: '#158C9B' },
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/** 상태/카운트 표시용 공용 배지 */
export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', children, style }) => {
  const t = TONE_STYLES[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        fontSize: '11px',
        fontWeight: 700,
        background: t.bg,
        color: t.fg,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
};
