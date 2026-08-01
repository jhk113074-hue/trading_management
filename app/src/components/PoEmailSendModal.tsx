import React, { useState } from 'react';

interface PoEmailSendModalProps {
  supplierName: string;
  defaultToEmail: string;
  defaultCcEmails: string;
  defaultSubject: string;
  defaultContent: string;
  pdfUrl?: string;
  onSend: (data: { to: string; cc: string; subject: string; content: string }) => Promise<void> | void;
  onClose: () => void;
}

export const PoEmailSendModal: React.FC<PoEmailSendModalProps> = ({
  supplierName,
  defaultToEmail,
  defaultCcEmails,
  defaultSubject,
  defaultContent,
  pdfUrl,
  onSend,
  onClose
}) => {
  const [toEmail, setToEmail] = useState(defaultToEmail);
  const [ccEmails, setCcEmails] = useState(defaultCcEmails);
  const [subject, setSubject] = useState(defaultSubject);
  const [content, setContent] = useState(defaultContent);
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toEmail.trim()) {
      alert('수신자 이메일 주소를 입력해 주세요.');
      return;
    }
    setIsSending(true);
    try {
      await onSend({
        to: toEmail.trim(),
        cc: ccEmails.trim(),
        subject: subject.trim(),
        content: content.trim()
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
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
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(3px)',
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
          borderRadius: '6px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
          width: '600px',
          maxWidth: '92vw',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* 헤더 */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #cbd5e1', backgroundColor: '#fafafa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📧 [{supplierName}] 발주서 이메일 발송
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        {/* 폼 */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 수신자 (TO) */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '4px' }}>
              수신자 (TO) 이메일 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="email"
              required
              value={toEmail}
              onChange={e => setToEmail(e.target.value)}
              placeholder="supplier@company.com"
              style={{
                width: '100%',
                height: '34px',
                padding: '0 10px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 600,
                color: '#1e293b',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
          </div>

          {/* 참조 (CC) */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '4px' }}>
              참조 (CC) 이메일 (쉼표 구분)
            </label>
            <input
              type="text"
              value={ccEmails}
              onChange={e => setCcEmails(e.target.value)}
              placeholder="alexpark@ysacc.co.kr, jhkim1130@ysacc.co.kr"
              style={{
                width: '100%',
                height: '34px',
                padding: '0 10px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 600,
                color: '#1e293b',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
          </div>

          {/* 메일 제목 */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '4px' }}>
              메일 제목 <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              required
              value={subject}
              onChange={e => setSubject(e.target.value)}
              style={{
                width: '100%',
                height: '34px',
                padding: '0 10px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 600,
                color: '#1e293b',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            />
          </div>

          {/* 첨부파일 정보 */}
          <div style={{ backgroundColor: '#eff6ff', border: '1px solid #93c5fd', borderRadius: '4px', padding: '10px 12px', fontSize: '12px', color: '#1e40af' }}>
            <div style={{ fontWeight: 750, marginBottom: '2px' }}>📄 첨부파일 정보</div>
            {pdfUrl ? (
              <div style={{ wordBreak: 'break-all', fontSize: '11.5px', color: '#2563eb' }}>발주서 PDF 파일 원본이 자동 첨부됩니다. ({pdfUrl.substring(0, 70)}...)</div>
            ) : (
              <div style={{ color: '#b45309', fontWeight: 600 }}>⚠️ 아직 저장된 PDF가 없습니다. (먼저 발주서를 발행 및 저장 후 메일을 보내시면 PDF 링크가 자동 첨부됩니다)</div>
            )}
          </div>

          {/* 메일 본문 편집기 */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '4px' }}>
              발송 메일 본문 미리보기 및 직접 편집
            </label>
            <textarea
              rows={9}
              value={content}
              onChange={e => setContent(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '4px',
                border: '1px solid #cbd5e1',
                fontSize: '12.5px',
                color: '#1e293b',
                backgroundColor: '#ffffff',
                outline: 'none',
                boxSizing: 'border-box',
                resize: 'vertical',
                lineHeight: 1.45
              }}
            />
          </div>

          {/* 하단 버튼 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
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
              취소
            </button>
            <button
              type="submit"
              disabled={isSending}
              style={{
                height: '34px',
                padding: '0 20px',
                background: '#166534',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: 800,
                color: '#ffffff',
                cursor: 'pointer',
                opacity: isSending ? 0.7 : 1
              }}
            >
              {isSending ? '전송 중...' : '📧 이메일 발송 완료'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
