import React from 'react';
import { useSearchParams } from 'react-router-dom';

export const DocViewerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const url = searchParams.get('url') || '';
  const title = searchParams.get('title') || '문서 다운로드';
  const poNum = searchParams.get('poNum') || '';
  const supplierName = searchParams.get('supplier') || '';

  const handleDownload = () => {
    if (url) {
      window.location.href = url;
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '24px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header Card */}
      <div style={{
        width: '100%',
        maxWidth: '680px',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #cbd5e1',
        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.08)',
        padding: '24px',
        boxSizing: 'border-box',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <span style={{ fontSize: '28px' }}>📄</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
              {title}
            </h2>
            {(poNum || supplierName) && (
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                {poNum && `발주번호: ${poNum}`} {supplierName && `| 공급사: ${supplierName}`}
              </p>
            )}
          </div>
        </div>

        <p style={{ fontSize: '13.5px', color: '#475569', margin: '0 0 16px 0', lineHeight: 1.5 }}>
          (주)와이에스에이씨씨에서 발행된 공식 문서 원본입니다.<br />
          아래 버튼을 눌러 PDF 파일을 바로 열람 및 다운로드하실 수 있습니다.
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={handleDownload}
            disabled={!url}
            style={{
              flex: '1 1 200px',
              height: '46px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 800,
              cursor: url ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
            }}
          >
            <span>📥</span> PDF 원본 다운로드 / 열기
          </button>
        </div>
      </div>

      {/* PDF Inline Viewer for Desktop/Mobile Browsers */}
      {url && (
        <div style={{
          width: '100%',
          maxWidth: '680px',
          height: '65vh',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #cbd5e1',
          overflow: 'hidden',
          boxShadow: '0 4px 15px rgba(0,0,0,0.05)'
        }}>
          <iframe
            src={url}
            title={title}
            style={{
              width: '100%',
              height: '100%',
              border: 'none'
            }}
          />
        </div>
      )}
    </div>
  );
};
