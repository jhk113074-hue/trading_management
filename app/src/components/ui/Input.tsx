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

export interface TextareaProps extends BaseFieldProps, Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {}

/** 여러 줄 입력 — PI/Product 모달의 비고, 협업 범위 설명 등에 사용. */
export const Textarea: React.FC<TextareaProps> = ({
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
  rows = 3,
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
        <label htmlFor={autoId} style={{ fontWeight: 600, color: labelColor || 'var(--text-secondary)', ...sizes.label }}>
          {label}
          {required && <span style={{ color: 'var(--primary-color)', marginLeft: '2px' }}>*</span>}
        </label>
      )}
      <textarea
        id={autoId}
        rows={rows}
        disabled={disabled}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        aria-invalid={!!error}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          fontFamily: 'inherit',
          resize: 'vertical',
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

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
}

/** 공용 체크박스 — accent-color로 브랜드 레드 적용. */
export const Checkbox: React.FC<CheckboxProps> = ({ label, id, style, ...rest }) => {
  const autoId = id || `checkbox-${label.replace(/\s+/g, '-')}`;
  return (
    <label
      htmlFor={autoId}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: rest.disabled ? 'not-allowed' : 'pointer', ...style }}
    >
      <input id={autoId} type="checkbox" style={{ width: '16px', height: '16px', accentColor: 'var(--primary-color)' }} {...rest} />
      {label}
    </label>
  );
};

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
}

/** 공용 라디오 버튼. */
export const Radio: React.FC<RadioProps> = ({ label, id, style, ...rest }) => {
  const autoId = id || `radio-${label.replace(/\s+/g, '-')}`;
  return (
    <label
      htmlFor={autoId}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: rest.disabled ? 'not-allowed' : 'pointer', ...style }}
    >
      <input id={autoId} type="radio" style={{ width: '16px', height: '16px', accentColor: 'var(--primary-color)' }} {...rest} />
      {label}
    </label>
  );
};

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label': string;
}

/** 온/오프 토글 스위치 — 알림 설정 등. 켜지면 브랜드 레드로 채워짐. */
export const Switch: React.FC<SwitchProps> = ({ checked, onChange, disabled, ...rest }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    style={{
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      width: '40px',
      height: '22px',
      borderRadius: 'var(--radius-pill)',
      background: checked ? 'var(--primary-color)' : 'var(--border-default)',
      border: 'none',
      padding: 0,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'background-color var(--dur-med, 200ms)',
    }}
    {...rest}
  >
    <span
      style={{
        position: 'absolute',
        top: '2px',
        left: '2px',
        width: '18px',
        height: '18px',
        borderRadius: '50%',
        background: '#fff',
        boxShadow: 'var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.15))',
        transform: checked ? 'translateX(18px)' : 'translateX(0)',
        transition: 'transform var(--dur-med, 200ms)',
      }}
    />
  </button>
);

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
