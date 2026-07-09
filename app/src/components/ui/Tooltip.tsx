import React, { useState } from 'react';

export interface TooltipProps {
  label: string;
  children: React.ReactElement;
}

/** 최소 구현 hover 툴팁. 복잡한 위치 계산이 필요하면 floating-ui 등으로 교체 권장. */
export const Tooltip: React.FC<TooltipProps> = ({ label, children }) => {
  const [visible, setVisible] = useState(false);
  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '6px',
            background: '#262628',
            color: '#fff',
            fontSize: '11px',
            padding: '4px 8px',
            borderRadius: 'var(--radius-xs)',
            boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.1))',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 1200,
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
};
