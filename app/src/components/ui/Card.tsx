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
