import React, { useState, useEffect } from 'react';

export const previewFile = (url: string, name: string) => {
  window.dispatchEvent(new CustomEvent('preview-file', { detail: { url, name } }));
};

export const FilePreviewModal: React.FC = () => {
  const [previewData, setPreviewData] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    const handlePreview = (e: Event) => {
      const customEvent = e as CustomEvent<{ url: string; name: string }>;
      if (customEvent.detail && customEvent.detail.url) {
        setPreviewData(customEvent.detail);
      }
    };
    window.addEventListener('preview-file', handlePreview);
    return () => window.removeEventListener('preview-file', handlePreview);
  }, []);

  if (!previewData) return null;

  const { url, name } = previewData;
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
  const isPdf = /\.pdf$/i.test(name);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        width: '90%',
        maxWidth: '1000px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <span style={{ fontSize: '18px' }}>📄</span>
            <span style={{
              fontWeight: 700,
              fontSize: '14.5px',
              color: '#0f172a',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '600px'
            }} title={name}>
              {name}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <a
              href={url}
              download={name}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '12.5px',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
              }}
            >
              📥 다운로드
            </a>
            <button
              onClick={() => setPreviewData(null)}
              style={{
                background: '#e2e8f0',
                border: 'none',
                color: '#475569',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              닫기
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          padding: '20px',
          background: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          minHeight: '300px'
        }}>
          {isImage ? (
            <img
              src={url}
              alt={name}
              style={{
                maxWidth: '100%',
                maxHeight: '70vh',
                objectFit: 'contain',
                borderRadius: '6px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
              }}
            />
          ) : isPdf ? (
            <iframe
              src={url}
              title={name}
              style={{
                width: '100%',
                height: '70vh',
                border: 'none',
                borderRadius: '6px',
                background: '#ffffff',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
              }}
            />
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              background: '#ffffff',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              maxWidth: '450px',
              width: '100%'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#1e293b', fontWeight: 700 }}>
                미리보기를 지원하지 않는 파일 형식입니다
              </h4>
              <p style={{ margin: '0 0 20px 0', fontSize: '12px', color: '#64748b' }}>
                아래 다운로드 버튼을 눌러 로컬 기기에서 파일을 확인해 주세요.
              </p>
              <a
                href={url}
                download={name}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 24px',
                  fontSize: '13px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-block',
                  transition: 'all 0.15s',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
                }}
              >
                📥 파일 다운로드 받기
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
