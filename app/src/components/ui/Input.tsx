import React, { useState } from 'react';

export type FieldSize = 'sm' | 'md' | 'lg';

interface BaseFieldProps {
  label?: string;
  required?: boolean;
  error?: string;
  size?: FieldSize;
  labelColor?: string;
}

const SIZE_STYLES: Record<FieldSize, { label: React.CSSProperties; input: React.CSSProperties }> = {
  sm: {
    label: { fontSize: '9px', letterSpacing: '0.04em', textTransform: 'uppercase' },
    input: { padding: '5px 8px', fontSize: '11.5px', borderRadius: 'var(--radius-xs)' },
  },
  md: {
    label: { fontSize: '13px' },
    input: { padding: '9px 12px', fontSize: '14px', borderRadius: 'var(--radius-md)' },
  },
  lg: {
    label: { fontSize: '13px' },
    input: { padding: '9px 12px', fontSize: '15px', borderRadius: 'var(--radius-md)' },
  },
};

export interface InputProps extends BaseFieldProps, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {}

/**
 * 공용 인풋 컴포넌트 — YSACC 디자인시스템 토큰 사용.
 * size="sm" 은 정보 밀도가 높은 관리자 모달용(기존 관행 유지), "md"/"lg"는 로그인처럼 여유 있는 폼용.
 */
export const Input: React.FC<InputProps> = ({
  label,
  required = false,
  error,
  size = 'md',
  labelColor,
  disabled,
  style,
  onFocus,
  onBlur,
  id,
  ...rest
}) => {
  const [focused, setFocused] = useState(false);
  const sizes = SIZE_STYLES[size];
  const autoId = id || (label ? `field-${label.replace(/\s+/g, '-')}` : undefined);

  const borderColor = error
    ? 'var(--primary-color)'
    : focused
    ? 'var(--focus-ring)'
    : 'var(--border-default)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: size === 'sm' ? '2px' : '6px' }}>
      {label && (
        <label
          htmlFor={autoId}
          style={{
            fontWeight: 600,
            color: labelColor || 'var(--text-secondary)',
            ...sizes.label,
          }}
        >
          {label}
          {required && <span style={{ color: 'var(--primary-color)', marginLeft: '2px' }}>*</span>}
        </label>
      )}
      <input
        id={autoId}
        disabled={disabled}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        aria-invalid={!!error}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          fontFamily: 'inherit',
          border: `1px solid ${borderColor}`,
          background: disabled ? '#F8F8F9' : '#fff',
          color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
          outline: 'none',
          boxShadow: focused && !error ? 'var(--shadow-focus)' : 'none',
          transition: 'border-color 120ms, box-shadow 120ms',
          ...sizes.input,
          ...style,
        }}
        {...rest}
      />
      {error && (
        <span style={{ fontSize: size === 'sm' ? '10px' : '12px', color: 'var(--primary-color)', fontWeight: 600 }}>
          {error}
        </span>
      )}
    </div>
  );
};

export interface SelectProps extends BaseFieldProps, Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  options: Array<string | { label: string; value: string }>;
}

export const Select: React.FC<SelectProps> = ({
  label,
  required = false,
  error,
  size = 'md',
  labelColor,
  options,
  style,
  id,
  ...rest
}) => {
  const sizes = SIZE_STYLES[size];
  const autoId = id || (label ? `field-${label.replace(/\s+/g, '-')}` : undefined);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: size === 'sm' ? '2px' : '6px' }}>
      {label && (
        <label htmlFor={autoId} style={{ fontWeight: 600, color: labelColor || 'var(--text-secondary)', ...sizes.label }}>
          {label}
          {required && <span style={{ color: 'var(--primary-color)', marginLeft: '2px' }}>*</span>}
        </label>
      )}
      <select
        id={autoId}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          fontFamily: 'inherit',
          border: `1px solid ${error ? 'var(--primary-color)' : 'var(--border-default)'}`,
          background: '#fff',
          color: 'var(--text-primary)',
          outline: 'none',
          ...sizes.input,
          ...style,
        }}
        {...rest}
      >
        {options.map((opt) => {
          const value = typeof opt === 'string' ? opt : opt.value;
          const optLabel = typeof opt === 'string' ? opt : opt.label;
          return <option key={value} value={value}>{optLabel}</option>;
        })}
      </select>
      {error && (
        <span style={{ fontSize: size === 'sm' ? '10px' : '12px', color: 'var(--primary-color)', fontWeight: 600 }}>
          {error}
        </span>
      )}
    </div>
  );
};
