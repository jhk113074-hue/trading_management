import React, { useState } from 'react';

interface KatalkMessageModalProps {
  message: string;
  supplierName: string;
  onClose: () => void;
  onCopySuccess?: () => void;
}

export const KatalkMessageModal: React.FC<KatalkMessageModalProps> = ({
  message,
  supplierName,
  onClose,
  onCopySuccess
}) => {
  const [copied, setCopied] = useState(false);

  const currentTimeStr = new Date().toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      if (onCopySuccess) onCopySuccess();
      setTimeout(() => setCopied(false), 2500);
      alert('📋 [카카오톡 공유 메시지 복사 완료]\n\n카카오톡 단체 채팅방에 바로 Ctrl+V 키로 붙여넣으세요!');
    }).catch(err => {
      console.error(err);
      alert('❌ 클립보드 복사에 실패했습니다.');
    });
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div 
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
          width: '460px',
          maxWidth: '92vw',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* 카카오톡 상단 옐로우 타이틀바 */}
        <div style={{ 
          padding: '14px 18px', 
          backgroundColor: '#FEE500', 
          borderBottom: '1px solid #eab308',
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#191919', display: 'flex', alignItems: 'center', gap: '8px' }}>
            💬 카카오톡 공유 메시지 미리보기 [{supplierName}]
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#191919', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>

        {/* 카카오톡 대표 하늘색 대화방 배경 (#BACEE0) */}
        <div style={{ 
          backgroundColor: '#BACEE0', 
          padding: '20px 16px', 
          maxHeight: '480px', 
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '6px'
        }}>
          <div style={{ alignSelf: 'center', background: 'rgba(0,0,0,0.12)', color: '#ffffff', padding: '3px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, marginBottom: '6px' }}>
            카카오톡 공유 전 전송 메시지 내용을 확인하세요
          </div>

          {/* 우측 카카오톡 노란 말풍선 (#FEF01B) */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', maxWidth: '88%' }}>
            <span style={{ fontSize: '10px', color: '#556677', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {currentTimeStr}
            </span>
            <div style={{ 
              backgroundColor: '#FEF01B', 
              color: '#000000', 
              padding: '12px 14px', 
              borderRadius: '12px 2px 12px 12px', 
              fontSize: '13px', 
              lineHeight: '1.48', 
              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Malgun Gothic", "맑은 고딕", helvetica, sans-serif'
            }}>
              {message}
            </div>
          </div>
        </div>

        {/* 하단 액션바 */}
        <div style={{ 
          padding: '14px 18px', 
          backgroundColor: '#ffffff', 
          borderTop: '1px solid #e2e8f0', 
          display: 'flex', 
          justifyContent: 'flex-end', 
          gap: '8px' 
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: '34px',
              padding: '0 16px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#475569',
              cursor: 'pointer'
            }}
          >
            닫기
          </button>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              height: '34px',
              padding: '0 20px',
              background: copied ? '#16a34a' : '#FEE500',
              border: copied ? 'none' : '1px solid #eab308',
              borderRadius: '4px',
              fontSize: '13.5px',
              fontWeight: 800,
              color: copied ? '#ffffff' : '#191919',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {copied ? '✅ 복사 완료!' : '📋 카카오톡 클립보드 복사'}
          </button>
        </div>
      </div>
    </div>
  );
};
