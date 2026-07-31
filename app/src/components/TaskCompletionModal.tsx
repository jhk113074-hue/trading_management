import React, { useState } from 'react';

interface TaskCompletionModalProps {
  taskTitle: string;
  assigneeName?: string;
  requesterName?: string;
  onConfirm: (comment: string) => Promise<void> | void;
  onCancel: () => void;
}

export const TaskCompletionModal: React.FC<TaskCompletionModalProps> = ({
  taskTitle,
  assigneeName,
  requesterName,
  onConfirm,
  onCancel
}) => {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onConfirm(comment.trim());
    } catch (err) {
      console.error(err);
      alert('완료 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onCancel}
    >
      <div 
        onClick={e => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
          width: '420px',
          maxWidth: '90vw',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* 헤더 */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ✅ 업무 완료 보고 & 코멘트 작성
          </div>
          <button onClick={onCancel} style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        {/* 폼 본문 */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '12px', fontSize: '13px', color: '#166534' }}>
            <div style={{ fontWeight: 750, marginBottom: '4px' }}>📋 대상 업무: {taskTitle}</div>
            {assigneeName && <div style={{ fontSize: '12px', color: '#15803d' }}>담당자: {assigneeName}</div>}
            {requesterName && <div style={{ fontSize: '12px', color: '#15803d' }}>위임자: {requesterName}</div>}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 750, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
              완료 코멘트 / 진행 결과 메모 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              required
              rows={4}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="업무 완료 결과, 특이사항 및 위임자에게 전달할 메모를 작성해주세요."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                fontSize: '13.5px',
                color: '#1e293b',
                outline: 'none',
                boxSizing: 'border-box',
                resize: 'vertical'
              }}
            />
          </div>

          {/* 하단 버튼 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              style={{
                padding: '8px 16px',
                background: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: 700,
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '8px 20px',
                background: '#16a34a',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: 700,
                color: '#ffffff',
                cursor: 'pointer',
                opacity: isSubmitting ? 0.7 : 1
              }}
            >
              {isSubmitting ? '처리 중...' : '✅ 완료 보고서 제출'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
