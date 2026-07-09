import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  padding?: string;
}

/** 얇은 테두리 + 반경 + 그림자 토큰을 쓰는 공용 카드/섹션 컨테이너 */
export const Card: React.FC<CardProps> = ({ children, style, padding = '12px' }) => (
  <div
    style={{
      background: '#fff',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      padding,
      boxSizing: 'border-box',
      ...style,
    }}
  >
    {children}
  </div>
);

export interface CardHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Card 상단에 쓰는 제목/부제/우측 액션 슬롯 */
export const CardHeader: React.FC<CardHeaderProps> = ({ title, subtitle, action, style }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px', ...style }}>
    <div>
      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{subtitle}</div>}
    </div>
    {action}
  </div>
);

export interface StatProps {
  label: string;
  value: React.ReactNode;
  delta?: string;
  style?: React.CSSProperties;
}

/** 큰 숫자 + 트래킹된 대문자 라벨. 대시보드/카드 지표용 (예: "ACTIVE PROTOCOLS / 128 / +12%"). */
export const Stat: React.FC<StatProps> = ({ label, value, delta, style }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', ...style }}>
    <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>
      {label}
    </span>
    <span style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)' }}>
      {value}
    </span>
    {delta && <span style={{ fontSize: '11px', color: 'var(--color-success, #178A54)' }}>{delta}</span>}
  </div>
);
