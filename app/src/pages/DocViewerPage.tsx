import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const DocViewerPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const docId = searchParams.get('id');
  const queryUrl = searchParams.get('url');

  const [fileUrl, setFileUrl] = useState('');
  const [title, setTitle] = useState(searchParams.get('title') || '문서 다운로드');
  const [poNum, setPoNum] = useState(searchParams.get('poNum') || '');
  const [supplierName, setSupplierName] = useState(searchParams.get('supplier') || '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDoc() {
      setLoading(true);

      if (docId) {
        try {
          const snap = await getDoc(doc(db, 'public_docs', docId));
          if (snap.exists()) {
            const data = snap.data();
            setFileUrl(data.fileUrl || '');
            if (data.title) setTitle(data.title);
            if (data.poNum) setPoNum(data.poNum);
            if (data.supplierName) setSupplierName(data.supplierName);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.error('Error fetching public_docs:', e);
        }
      }

      if (queryUrl) {
        let clean = queryUrl;
        try {
          if (clean.includes('%')) clean = decodeURIComponent(clean);
          if (clean.includes('%')) clean = decodeURIComponent(clean);
        } catch {}
        setFileUrl(clean);
      }

      setLoading(false);
    }

    loadDoc();
  }, [docId, queryUrl]);

  const handleDownload = () => {
    if (fileUrl) {
      window.location.href = fileUrl;
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <span style={{ fontSize: '32px' }}>📄</span>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
              {title}
            </h2>
            {(poNum || supplierName) && (
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                {poNum && `발주번호: ${poNum}`} {supplierName && ` | 공급사: ${supplierName}`}
              </p>
            )}
          </div>
        </div>

        <p style={{ fontSize: '13.5px', color: '#475569', margin: '0 0 16px 0', lineHeight: 1.5 }}>
          (주)와이에스에이씨씨에서 발행된 공식 문서 원본입니다.<br />
          아래 파란색 버튼을 누르면 PDF 파일을 즉시 스마트폰이나 PC에 저장 및 확인하실 수 있습니다.
        </p>

        {loading ? (
          <div style={{ padding: '12px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
            문서 정보를 확인하고 있습니다...
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleDownload}
              disabled={!fileUrl}
              style={{
                flex: '1 1 200px',
                height: '48px',
                backgroundColor: fileUrl ? '#2563eb' : '#94a3b8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 800,
                cursor: fileUrl ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: fileUrl ? '0 4px 14px rgba(37, 99, 235, 0.3)' : 'none'
              }}
            >
              <span>📥</span> PDF 원본 다운로드 / 열기
            </button>
          </div>
        )}
      </div>

      {/* PDF Inline Viewer for Supported Browsers */}
      {!loading && fileUrl && (
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
            src={fileUrl}
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
