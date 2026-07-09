import React, { useState } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  style?: React.CSSProperties;
}

const SIZE_STYLES: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '5px 10px', fontSize: '11.5px', borderRadius: 'var(--radius-sm)', gap: '4px' },
  md: { padding: '9px 16px', fontSize: '13.5px', borderRadius: 'var(--radius-md)', gap: '6px' },
  lg: { padding: '12px 20px', fontSize: '15px', borderRadius: 'var(--radius-md)', gap: '8px' },
};

function variantStyle(variant: ButtonVariant, hover: boolean): React.CSSProperties {
  switch (variant) {
    case 'primary':
      return {
        background: hover ? 'var(--primary-hover)' : 'var(--primary-color)',
        color: '#fff',
        border: 'none',
        boxShadow: 'var(--shadow-brand)',
      };
    case 'danger':
      return {
        background: hover ? 'var(--primary-hover)' : 'var(--primary-color)',
        color: '#fff',
        border: 'none',
      };
    case 'secondary':
      return {
        background: '#fff',
        color: 'var(--text-secondary)',
        border: `1px solid ${hover ? 'var(--border-strong)' : 'var(--border-color)'}`,
      };
    case 'ghost':
    default:
      return {
        background: hover ? 'rgba(189,23,35,0.06)' : 'transparent',
        color: 'var(--text-link)',
        border: 'none',
      };
  }
}

/**
 * 공용 버튼 컴포넌트 — YSACC 디자인시스템(로그인 화면 기준) 토큰을 사용.
 * variant: primary(브랜드 레드, 주요 액션) / secondary(테두리, 보조 액션) / ghost(텍스트만, 링크성 액션) / danger(삭제 등 위험 액션)
 * size: sm(밀도 높은 모달 내부) / md(기본) / lg(전체 폭 제출 버튼 등)
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  children,
  style,
  onMouseEnter,
  onMouseLeave,
  ...rest
}) => {
  const [hover, setHover] = useState(false);
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      onMouseEnter={(e) => { setHover(true); onMouseEnter?.(e); }}
      onMouseLeave={(e) => { setHover(false); onMouseLeave?.(e); }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: fullWidth ? '100%' : undefined,
        fontFamily: 'inherit',
        fontWeight: 600,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.65 : 1,
        transition: 'background-color 120ms, border-color 120ms, transform 80ms',
        ...SIZE_STYLES[size],
        ...variantStyle(variant, hover && !isDisabled),
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
};

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  'aria-label': string;
  style?: React.CSSProperties;
}

/** 정사각형 아이콘 전용 버튼 — 테이블 행 액션, 토스트 닫기 등. */
export const IconButton: React.FC<IconButtonProps> = ({ style, disabled, children, ...rest }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        background: hover && !disabled ? '#F1F1F2' : '#fff',
        color: 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color 120ms',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
};
