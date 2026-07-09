import React from 'react';

export interface TableColumn<T> {
  key: keyof T & string;
  header: string;
  render?: (row: T) => React.ReactNode;
  width?: string;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  style?: React.CSSProperties;
}

/** 커스텀 셀 렌더러를 지원하는 제네릭 데이터 테이블 — Orders/Customers/Suppliers 목록용. */
export function Table<T>({ columns, rows, rowKey, onRowClick, style }: TableProps<T>) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', ...style }}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              style={{
                textAlign: 'left',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: '10.5px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-muted)',
                padding: '8px 12px',
                borderBottom: '1px solid var(--border-color)',
                width: col.width,
              }}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            style={{ cursor: onRowClick ? 'pointer' : 'default' }}
          >
            {columns.map((col) => (
              <td
                key={col.key}
                style={{ padding: '12px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              >
                {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
