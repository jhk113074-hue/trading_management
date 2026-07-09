import React, { useRef } from 'react';

export interface DateInputProps {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  placeholder?: string;
  className?: string;
  id?: string;
}

export const DateInput: React.FC<DateInputProps> = ({
  value,
  onChange,
  disabled = false,
  style,
  placeholder = 'YYYY-MM-DD',
  className,
  id
}) => {
  const dateInputRef = useRef<HTMLInputElement>(null);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    // Allow digits and hyphens
    const digits = val.replace(/\D/g, '');
    if (digits.length === 8 && !val.includes('-')) {
      val = `${digits.substring(0, 4)}-${digits.substring(4, 6)}-${digits.substring(6, 8)}`;
    }
    onChange({ target: { value: val } });
  };

  const handleCalendarClick = () => {
    if (disabled) return;
    if (dateInputRef.current) {
      try {
        dateInputRef.current.showPicker();
      } catch (err) {
        dateInputRef.current.click();
      }
    }
  };

  // Base YSACC input style rules
  const baseStyle: React.CSSProperties = {
    padding: '6px 10px',
    border: '1px solid #cbd5e1',
    borderRadius: '4px',
    fontSize: '13px',
    height: '34px',
    outline: 'none',
    background: disabled ? '#f1f5f9' : '#fff',
    color: disabled ? '#64748b' : '#1e293b',
    boxSizing: 'border-box',
    width: '100%',
    fontFamily: 'inherit',
    fontWeight: 600,
    ...style,
    paddingRight: '34px', // Space for calendar icon
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative', width: style?.width || '100%', boxSizing: 'border-box' }}>
      <input
        type="text"
        id={id}
        className={className}
        value={value || ''}
        onChange={handleTextChange}
        disabled={disabled}
        placeholder={placeholder}
        style={baseStyle}
      />
      <button
        type="button"
        onClick={handleCalendarClick}
        disabled={disabled}
        style={{
          position: 'absolute',
          right: '8px',
          background: 'none',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748b',
          fontSize: '14px',
          lineHeight: 1,
          userSelect: 'none',
          outline: 'none'
        }}
        title="달력 열기"
      >
        📅
      </button>
      <input
        type="date"
        ref={dateInputRef}
        value={value || ''}
        onChange={(e) => onChange({ target: { value: e.target.value } })}
        disabled={disabled}
        tabIndex={-1}
        style={{
          position: 'absolute',
          width: '0',
          height: '0',
          opacity: 0,
          border: 'none',
          padding: 0,
          pointerEvents: 'none'
        }}
      />
    </div>
  );
};
