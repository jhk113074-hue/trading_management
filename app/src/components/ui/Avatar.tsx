import React from 'react';

export interface AvatarProps {
  name: string;
  src?: string;
  size?: number;
  style?: React.CSSProperties;
}

/** 이미지가 없으면 이름 이니셜(최대 2글자)을 브랜드 톤 배경에 표시 — 담당자/거래처 아바타용. */
export const Avatar: React.FC<AvatarProps> = ({ name, src, size = 32, style }) => {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <span
      title={name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: 'var(--radius-pill)',
        background: 'rgba(189,23,35,0.10)',
        color: 'var(--primary-color)',
        fontSize: `${Math.max(10, size * 0.36)}px`,
        fontWeight: 700,
        overflow: 'hidden',
        flexShrink: 0,
        ...style,
      }}
    >
      {src ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials}
    </span>
  );
};
