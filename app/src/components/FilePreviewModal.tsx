import React, { useState, useEffect, useRef } from 'react';

export const previewFile = (url: string, name: string) => {
  window.dispatchEvent(new CustomEvent('preview-file', { detail: { url, name } }));
};

export const FilePreviewModal: React.FC = () => {
  const [previewData, setPreviewData] = useState<{ url: string; name: string } | null>(null);
  const [position, setPosition] = useState({ x: 100, y: 150 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handlePreview = (e: Event) => {
      const customEvent = e as CustomEvent<{ url: string; name: string }>;
      if (customEvent.detail && customEvent.detail.url) {
        setPreviewData(customEvent.detail);
        // 중앙 혹은 좌측 오프셋에 적절히 띄움
        setPosition({ x: window.innerWidth - 850, y: 180 });
      }
    };
    window.addEventListener('preview-file', handlePreview);
    return () => window.removeEventListener('preview-file', handlePreview);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const nextX = Math.max(10, Math.min(window.innerWidth - 300, e.clientX - dragStartRef.current.x));
    const nextY = Math.max(10, Math.min(window.innerHeight - 150, e.clientY - dragStartRef.current.y));
    setPosition({ x: nextX, y: nextY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!previewData) return null;

  const { url, name } = previewData;
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
  const isPdf = /\.pdf$/i.test(name);
  const isExcel = /\.(xlsx|xls|csv)$/i.test(name);

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '800px',
        height: '620px',
        minWidth: '400px',
        minHeight: '350px',
        maxWidth: '95vw',
        maxHeight: '95vh',
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 12px 36px rgba(15, 23, 42, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10005,
        border: '2px solid var(--border-default)',
        overflow: 'hidden',
        resize: 'both',
        userSelect: isDragging ? 'none' : 'auto'
      }}
    >
      {/* Draggable Header */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-default)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#f1f5f9',
          cursor: 'move',
          userSelect: 'none',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-secondary)', backgroundColor: 'var(--border-color)', padding: '2px 6px', borderRadius: '4px' }}>⚡ 드래그 이동</span>
          <span
            style={{
              fontWeight: 700,
              fontSize: '12.5px',
              color: '#0f172a',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '450px'
            }}
            title={name}
          >
            {name}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }} onMouseDown={e => e.stopPropagation()}>
          <a
            href={url}
            download={name}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#2563eb',
              color: '#ffffff',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            📥 다운로드
          </a>
          <button
            onClick={() => setPreviewData(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '18px',
              cursor: 'pointer',
              fontWeight: 'bold',
              padding: '2px 6px'
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content Frame */}
      <div
        style={{
          padding: '16px',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          overflowY: 'auto'
        }}
      >
        {isImage ? (
          <img
            src={url}
            alt={name}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
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
              height: '100%',
              minHeight: '280px',
              border: 'none',
              borderRadius: '6px',
              background: '#ffffff',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
            }}
          />
        ) : isExcel ? (
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`}
            title={name}
            style={{
              width: '100%',
              height: '100%',
              minHeight: '280px',
              border: 'none',
              borderRadius: '6px',
              background: '#ffffff',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
            }}
          />
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: '30px',
              background: '#ffffff',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              maxWidth: '450px',
              width: '100%'
            }}
          >
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📁</div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-primary)', fontWeight: 700 }}>
              미리보기를 지원하지 않는 형식입니다
            </h4>
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
                padding: '6px 20px',
                fontSize: '12px',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-block'
              }}
            >
              📥 파일 다운로드
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
