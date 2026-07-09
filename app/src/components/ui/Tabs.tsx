import React from 'react';

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  style?: React.CSSProperties;
}

/**
 * 언더라인 탭 네비게이션 — Orders 페이지의 list/kanban/todo 전환 같은 용도.
 * 활성 탭 아래 브랜드 레드 3px 바가 표시됨.
 */
export const Tabs: React.FC<TabsProps> = ({ items, activeKey, onChange, style }) => (
  <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--border-color)', ...style }} role="tablist">
    {items.map((item) => {
      const active = item.key === activeKey;
      return (
        <button
          key={item.key}
          role="tab"
          aria-selected={active}
          onClick={() => onChange(item.key)}
          style={{
            position: 'relative',
            background: 'none',
            border: 'none',
            padding: '8px 0',
            fontFamily: 'inherit',
            fontSize: '13.5px',
            fontWeight: 600,
            color: active ? 'var(--text-primary)' : 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          {item.label}
          {item.count !== undefined && (
            <span style={{ marginLeft: '6px', fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', color: 'var(--text-muted)' }}>
              {item.count}
            </span>
          )}
          {active && (
            <span
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: '-1px',
                height: '3px',
                background: 'var(--primary-color)',
                borderRadius: '3px 3px 0 0',
              }}
            />
          )}
        </button>
      );
    })}
  </div>
);
