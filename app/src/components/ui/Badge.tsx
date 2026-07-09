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

export interface TagProps {
  children: React.ReactNode;
  onRemove?: () => void;
  style?: React.CSSProperties;
}

/** 필터/속성 칩 — 상태 표시용 Badge와 달리 제거 가능한 속성 표시에 사용 (예: 국가, 카테고리 필터). */
export const Tag: React.FC<TagProps> = ({ children, onRemove, style }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '4px',
      padding: '2px 8px',
      borderRadius: 'var(--radius-xs)',
      fontSize: '11px',
      background: '#F1F1F2',
      color: 'var(--text-secondary)',
      border: '1px solid var(--border-color)',
      ...style,
    }}
  >
    {children}
    {onRemove && (
      <button
        type="button"
        onClick={onRemove}
        aria-label="제거"
        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', display: 'inline-flex', padding: 0, fontSize: '12px', lineHeight: 1 }}
      >
        ×
      </button>
    )}
  </span>
);
