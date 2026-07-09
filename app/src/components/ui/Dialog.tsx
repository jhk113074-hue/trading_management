import React from 'react';

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  maxWidth?: string;
}

/**
 * 공용 모달 다이얼로그 — index.css의 기존 .modal-overlay / .modal-content 클래스를 그대로 사용해
 * TaskModal 등과 톤을 맞춤. 새로 만드는 단순 폼/확인 모달에 적합.
 * PIFormModal처럼 이미 자체 모달 마크업이 있는 대형 화면은 그대로 두어도 됨.
 */
export const Dialog: React.FC<DialogProps> = ({ open, title, onClose, children, actions, maxWidth = '480px' }) => {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ maxWidth }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
          {title}
        </div>
        <div style={{ flex: 1 }}>{children}</div>
        {actions && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
