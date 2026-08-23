import React, { useState, useRef } from 'react';

export interface PreviewItem {
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  amount: number;
  hsCode?: string;
  netWeight?: number;
  grossWeight?: number;
  cbm?: number;
  packageType?: string;
  packagesCount?: number;
  isFreight?: boolean;
}

export interface ContainerItemData {
  pkgNo?: string;
  description?: string;
  name?: string;
  qty?: number | string;
  netWeight?: number | string;
  grossWeight?: number | string;
  cbm?: number | string;
  packageType?: string;
  dimensions?: string;
  manufacturer?: string;
  _sharedWithPrev?: boolean;
  _isMergedMember?: boolean;
}

export interface ContainerData {
  containerNo?: string;
  sealNo?: string;
  items?: ContainerItemData[];
}

export interface CiPlPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    letterheadUrl?: string;
    includeLetterhead?: boolean;
    piNumber: string;
    invoiceNo?: string;
    invoiceDate: string;
    customerName: string;
    customerAddress?: string;
    issuingCompany: string;
    lcNo?: string;
    lcDate?: string;
    lcIssuingBank?: string;
    notifyParty?: string;
    remarks?: string;
    portOfLoading?: string;
    portOfDischarge?: string;
    vesselName?: string;
    etd?: string;
    paymentTerms?: string;
    deliveryTerms?: string;
    shippingMarks?: string;
    shippingMarkShape?: string;
    shippingMarkCompany?: string;
    shippingMarkPort?: string;
    shippingMarkCountry?: string;
    shippingMarkPalletNo?: string;
    shippingMarkOrigin?: string;
    customShipperText?: string;
    items: PreviewItem[];
    ciItems?: PreviewItem[];
    plItems?: PreviewItem[];
    containers?: ContainerData[];
    totalPackages?: number;
    totalNetWeight?: number;
    totalGrossWeight?: number;
    totalCbm?: number;
    introText?: string;
    containerInfo?: string;
    bottomFreeText?: string;
    plRemarks?: string;
    vatTrn?: string;
    manufacturerName?: string;
    manufacturerAddress?: string;
    hsCodeSummary?: string;
  };
  onExportExcel?: (includeLetterhead?: boolean) => void;
}

export const CiPlPreviewModal: React.FC<CiPlPreviewModalProps> = ({ isOpen, onClose, data, onExportExcel }) => {
  const [activeTab, setActiveTab] = useState<'CI' | 'PL'>('CI');
  const [showLetterheadLocal, setShowLetterheadLocal] = useState<boolean>(data.includeLetterhead !== false);

  React.useEffect(() => {
    setShowLetterheadLocal(data.includeLetterhead !== false);
  }, [data.includeLetterhead, isOpen]);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [size] = useState({ width: 920, height: 860 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 100, y: 100 });

  React.useEffect(() => {
    if (isOpen) {
      const initialX = Math.max(20, Math.floor((window.innerWidth - 920) / 2));
      const initialY = Math.max(20, Math.floor((window.innerHeight - 860) / 2));
      setPosition({ x: initialX, y: initialY });
      currentPos.current = { x: initialX, y: initialY };
    }
  }, [isOpen]);

  const isYS = data.issuingCompany === 'YS';
  const companyName = isYS ? 'YS' : 'YS ACC';
  const headerAddress = isYS
    ? '111-201, 76, WOLMYEONG-RO, HEUNGDEOK-GU, CHEONGJU-SI, CHUNGCHEONGBUK-DO, 28569, REPUBLIC OF KOREA\nTEL: +82 70 4141 2927 / FAX: +82 303 3444 1130'
    : '111-201, 76, WOLMYEONG-RO, HEUNGDEOK-GU, CHEONGJU-SI, CHUNGCHEONGBUK-DO, 28569, REPUBLIC OF KOREA\nTEL: +82 70 4141 2927 / FAX: +82 303 3444 1130';

  const cleanCiName = (rawName: string) => {
    return (rawName || '').replace(/^\[.*?\]\s*/, '').trim();
  };

  const renderGraphicShippingMark = () => {
    const comp = data.shippingMarkCompany || (data.shippingMarks?.split('\n')?.[1]?.trim()) || 'YSACC';
    const shape = data.shippingMarkShape || 'diamond';
    const portCountry = [data.shippingMarkPort || data.portOfDischarge || '', data.shippingMarkCountry || data.deliveryTerms || ''].filter(Boolean).join(', ') || (data.shippingMarks?.split('\n')?.[2]?.trim()) || 'BUSAN, KOREA';
    const pltNo = data.shippingMarkPalletNo || (data.shippingMarks?.split('\n')?.[3]?.trim()) || 'PALLET NO. : 1 / 1';
    const origin = data.shippingMarkOrigin || (data.shippingMarks?.split('\n')?.[4]?.trim()) || 'MADE IN KOREA';

    let shapeSvg = null;
    if (shape === 'circle') {
      shapeSvg = (
        <svg width="76" height="76" style={{ display: 'block', margin: '0 auto' }}>
          <circle cx="38" cy="38" r="34" stroke="black" strokeWidth="2.8" fill="none" />
          <text x="50%" y="54%" fontSize="13" fontWeight="bold" fontFamily="Tahoma, sans-serif" textAnchor="middle" dominantBaseline="middle" fill="black">{comp}</text>
        </svg>
      );
    } else if (shape === 'square') {
      shapeSvg = (
        <svg width="84" height="64" style={{ display: 'block', margin: '0 auto' }}>
          <rect x="4" y="4" width="76" height="56" stroke="black" strokeWidth="2.8" fill="none" />
          <text x="50%" y="54%" fontSize="13" fontWeight="bold" fontFamily="Tahoma, sans-serif" textAnchor="middle" dominantBaseline="middle" fill="black">{comp}</text>
        </svg>
      );
    } else if (shape === 'triangle') {
      shapeSvg = (
        <svg width="84" height="70" style={{ display: 'block', margin: '0 auto' }}>
          <polygon points="42,4 4,66 80,66" stroke="black" strokeWidth="2.8" fill="none" />
          <text x="50%" y="68%" fontSize="12" fontWeight="bold" fontFamily="Tahoma, sans-serif" textAnchor="middle" dominantBaseline="middle" fill="black">{comp}</text>
        </svg>
      );
    } else {
      // Diamond
      shapeSvg = (
        <svg width="92" height="64" style={{ display: 'block', margin: '0 auto' }}>
          <polygon points="46,4 88,32 46,60 4,32" stroke="black" strokeWidth="2.8" fill="none" />
          <text x="50%" y="54%" fontSize={comp.length > 11 ? '10.5' : (comp.length > 8 ? '12' : '13.5')} fontWeight="bold" fontFamily="Tahoma, sans-serif" textAnchor="middle" dominantBaseline="middle" fill="black">{comp}</text>
        </svg>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', lineHeight: 1.3, padding: '8px 2px' }}>
        {shapeSvg}
        <div style={{ fontSize: '10.5px', fontWeight: 800, textAlign: 'center', textTransform: 'uppercase', color: '#000', marginTop: '4px', letterSpacing: '0.2px' }}>
          <div>{portCountry}</div>
          <div style={{ margin: '2px 0' }}>{pltNo}</div>
          <div>{origin}</div>
        </div>
      </div>
    );
  };

  const ciItems = (data.ciItems && data.ciItems.length > 0 ? data.ciItems : data.items).map(it => ({
    ...it,
    name: cleanCiName(it.name)
  }));
  const plItems = (data.plItems && data.plItems.length > 0 ? data.plItems : data.items).map(it => ({
    ...it,
    name: cleanCiName(it.name)
  }));

  const totalQtyCI = ciItems.reduce((sum, item) => sum + (item.qty || 0), 0);
  const totalAmountCI = ciItems.reduce((sum, item) => sum + (Number(item.amount) || ((item.qty || 0) * (item.unitPrice || 0)) || 0), 0);

  const totalPackagesPL = data.totalPackages || plItems.reduce((sum, item) => sum + (item.packagesCount || 0), 0) || 1;
  const totalNetPL = data.totalNetWeight || plItems.reduce((sum, item) => sum + (Number(item.netWeight) || 0), 0);
  const totalGrossPL = data.totalGrossWeight || plItems.reduce((sum, item) => sum + (Number(item.grossWeight) || 0), 0);
  const totalCbmPL = data.totalCbm || plItems.reduce((sum, item) => sum + (Number(item.cbm) || 0), 0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMaximized) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || isMaximized) return;
    const deltaX = e.clientX - dragStart.current.x;
    const deltaY = e.clientY - dragStart.current.y;
    const nextX = Math.max(10, Math.min(window.innerWidth - 100, currentPos.current.x + deltaX));
    const nextY = Math.max(10, Math.min(window.innerHeight - 100, currentPos.current.y + deltaY));
    setPosition({ x: nextX, y: nextY });
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (!isDragging || isMaximized) return;
    setIsDragging(false);
    const deltaX = e.clientX - dragStart.current.x;
    const deltaY = e.clientY - dragStart.current.y;
    const finalX = Math.max(10, Math.min(window.innerWidth - 100, currentPos.current.x + deltaX));
    const finalY = Math.max(10, Math.min(window.innerHeight - 100, currentPos.current.y + deltaY));
    currentPos.current = { x: finalX, y: finalY };
  };

  React.useEffect(() => {
    const handleMove = (e: MouseEvent) => handleMouseMove(e);
    const handleUp = (e: MouseEvent) => handleMouseUp(e);
    if (isDragging) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, isMaximized]);

  if (!isOpen) return null;

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '11px',
    marginBottom: '0px'
  };

  const thStyle: React.CSSProperties = {
    border: '1px solid #000',
    padding: '6px 4px',
    background: '#fff',
    color: '#000',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: '11px'
  };

  const tdItemStyle: React.CSSProperties = {
    border: '1px solid #000',
    padding: '5px 6px',
    color: '#000',
    fontSize: '10.5px'
  };

  const tdBlockStyle: React.CSSProperties = {
    border: '1px solid #000',
    padding: '5px 8px',
    verticalAlign: 'top',
    background: '#ffffff'
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.45)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backdropFilter: 'blur(2px)'
    }}>
      <div 
        style={{
          position: isMaximized ? 'fixed' : 'absolute',
          top: isMaximized ? '10px' : `${position.y}px`,
          left: isMaximized ? '10px' : `${position.x}px`,
          width: isMaximized ? 'calc(100vw - 20px)' : `${size.width}px`,
          height: isMaximized ? 'calc(100vh - 20px)' : `${size.height}px`,
          minWidth: '600px',
          minHeight: '500px',
          background: '#f8fafc',
          borderRadius: '6px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #cbd5e1',
          resize: isMaximized ? 'none' : 'both'
        }}
      >
        {/* Modal Top Bar */}
        <div 
          onMouseDown={handleMouseDown}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 14px',
            background: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            cursor: isMaximized ? 'default' : 'move',
            userSelect: 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
              ⚡ 드래그하여 이동 / 모서리 크기조절 가능
            </span>
            <div style={{ display: 'flex', background: '#e2e8f0', padding: '2px', borderRadius: '4px', gap: '2px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('CI')}
                style={{
                  padding: '4px 14px',
                  border: 'none',
                  borderRadius: '3px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  background: activeTab === 'CI' ? '#2563eb' : 'transparent',
                  color: activeTab === 'CI' ? '#fff' : '#475569',
                  transition: 'all 0.15s'
                }}
              >
                Commercial Invoice
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('PL')}
                style={{
                  padding: '4px 14px',
                  border: 'none',
                  borderRadius: '3px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  background: activeTab === 'PL' ? '#2563eb' : 'transparent',
                  color: activeTab === 'PL' ? '#fff' : '#475569',
                  transition: 'all 0.15s'
                }}
              >
                Packing List
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 750, color: '#334155', cursor: 'pointer', background: '#fff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
              <input
                type="checkbox"
                checked={showLetterheadLocal}
                onChange={e => setShowLetterheadLocal(e.target.checked)}
                style={{ width: '14px', height: '14px', cursor: 'pointer' }}
              />
              🏢 Letterhead 포함
            </label>
            {onExportExcel && (
              <button
                type="button"
                onClick={() => onExportExcel(showLetterheadLocal)}
                style={{
                  padding: '4px 10px',
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                📊 Excel 다운로드
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsMaximized(!isMaximized)}
              style={{
                width: '26px',
                height: '26px',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                background: '#f8fafc',
                cursor: 'pointer',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569'
              }}
              title={isMaximized ? "이전 크기로 복원" : "최대화"}
            >
              {isMaximized ? '🗗' : '🗖'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                width: '26px',
                height: '26px',
                border: 'none',
                borderRadius: '4px',
                background: '#ef4444',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Paper Preview Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#e2e8f0', display: 'flex', justifyContent: 'center' }}>
          <div style={{
            width: '800px',
            minHeight: '1050px',
            background: '#fff',
            padding: '36px 36px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.12)',
            fontFamily: "'Tahoma', 'Noto Sans KR', sans-serif",
            color: '#000',
            boxSizing: 'border-box'
          }}>
            {/* Top Letterhead */}
            {showLetterheadLocal && (
              data.letterheadUrl ? (
                <div style={{ marginBottom: '14px', borderBottom: '2px solid #000', paddingBottom: '8px', textAlign: 'center' }}>
                  <img
                    src={data.letterheadUrl}
                    alt="Company Letterhead"
                    style={{ maxWidth: '100%', maxHeight: '110px', objectFit: 'contain' }}
                    onError={(e) => {
                      // Fallback to text header if image fails
                      const target = e.target as HTMLElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = `
                          <div style="text-align: left;">
                            <div style="font-size: 18px; font-weight: 900; letter-spacing: 0.5px;">${companyName}</div>
                            <div style="font-size: 9.5px; color: #1e293b; white-space: pre-line; margin-top: 2px; line-height: 1.3;">${headerAddress}</div>
                          </div>
                        `;
                      }
                    }}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '0.5px' }}>{companyName}</div>
                    <div style={{ fontSize: '9.5px', color: '#1e293b', whiteSpace: 'pre-line', marginTop: '2px', lineHeight: 1.3 }}>
                      {headerAddress}
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Document Title */}
            <div style={{ textAlign: 'center', fontSize: '23px', fontWeight: 900, textTransform: 'capitalize', margin: '16px 0 18px 0', letterSpacing: '0.8px' }}>
              {activeTab === 'CI' ? 'Commercial Invoice' : 'Packing List'}
            </div>

            {/* Header Info Grid with Combined Title & Content in Outer-Bordered Boxes */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
              <tbody>
                {/* Section 1: Shipper vs (Invoice No & LC No) */}
                <tr>
                  <td colSpan={3} rowSpan={2} style={{ ...tdBlockStyle, width: '50%' }}>
                    <div style={{ fontWeight: 800, fontSize: '9.5px', textTransform: 'uppercase', color: '#000', marginBottom: '4px' }}>
                      {activeTab === 'CI' ? 'Shipper / Beneficiary:' : 'Shipper/Exporter:'}
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '9.5px', color: '#000', whiteSpace: 'pre-line' }}>
                      {data.customShipperText || `${companyName}\n${headerAddress}`}
                    </div>
                  </td>
                  <td colSpan={3} style={{ ...tdBlockStyle, width: '50%' }}>
                    <div style={{ fontWeight: 800, fontSize: '9.5px', textTransform: 'uppercase', color: '#000', marginBottom: '3px' }}>
                      {activeTab === 'CI' ? 'Invoice No. & Date:' : 'Packing List No. & Date:'}
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '9.5px', color: '#000' }}>
                      {`${data.invoiceNo || data.piNumber || '-'}   /   ${data.invoiceDate}`}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ ...tdBlockStyle, width: '50%' }}>
                    <div style={{ fontWeight: 800, fontSize: '9.5px', textTransform: 'uppercase', color: '#000', marginBottom: '3px' }}>
                      L/C No. & Date:
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '9.5px', color: '#000' }}>
                      {data.lcNo || 'N/A'} {data.lcDate ? `& ${data.lcDate}` : ''}
                    </div>
                  </td>
                </tr>

                {/* Section 2: Applicant vs LC Issuing Bank */}
                <tr>
                  <td colSpan={3} style={{ ...tdBlockStyle, width: '50%' }}>
                    <div style={{ fontWeight: 800, fontSize: '9.5px', textTransform: 'uppercase', color: '#000', marginBottom: '4px' }}>
                      {activeTab === 'CI' ? 'Applicant:' : 'Applicant/Consignee:'}
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '9.5px', color: '#000', whiteSpace: 'pre-line' }}>
                      {(data.customerName || '-') + (data.customerAddress ? '\n' + data.customerAddress : '')}
                    </div>
                  </td>
                  <td colSpan={3} style={{ ...tdBlockStyle, width: '50%' }}>
                    <div style={{ fontWeight: 800, fontSize: '9.5px', textTransform: 'uppercase', color: '#000', marginBottom: '4px' }}>
                      L/C Issuing Bank:
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '9.5px', color: '#000', whiteSpace: 'pre-line' }}>
                      {data.lcIssuingBank || 'N/A'}
                    </div>
                  </td>
                </tr>

                {/* Section 3: Notify Party vs Remarks */}
                <tr>
                  <td colSpan={3} style={{ ...tdBlockStyle, width: '50%' }}>
                    <div style={{ fontWeight: 800, fontSize: '9.5px', textTransform: 'uppercase', color: '#000', marginBottom: '4px' }}>
                      Notify Party:
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '9.5px', color: '#000', whiteSpace: 'pre-line' }}>
                      {data.notifyParty || data.customerName || 'Same as Applicant'}
                    </div>
                  </td>
                  <td colSpan={3} style={{ ...tdBlockStyle, width: '50%' }}>
                    <div style={{ fontWeight: 800, fontSize: '9.5px', textTransform: 'uppercase', color: '#000', marginBottom: '4px' }}>
                      Remarks:
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '9.5px', color: '#000', whiteSpace: 'pre-line' }}>
                      {data.remarks ? `"${data.remarks}"` : '"FREIGHT PREPAID"'}
                    </div>
                  </td>
                </tr>

                {/* Section 4: Port Loading, Port Discharge, Payment Terms */}
                <tr>
                  <td colSpan={2} style={{ ...tdBlockStyle, width: '33.33%' }}>
                    <div style={{ fontWeight: 800, fontSize: '9px', textTransform: 'uppercase', color: '#000', marginBottom: '3px' }}>
                      Port of Loading:
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '9.5px', color: '#000' }}>
                      {data.portOfLoading || '-'}
                    </div>
                  </td>
                  <td colSpan={2} style={{ ...tdBlockStyle, width: '33.33%' }}>
                    <div style={{ fontWeight: 800, fontSize: '9px', textTransform: 'uppercase', color: '#000', marginBottom: '3px' }}>
                      Port of Discharge:
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '9.5px', color: '#000' }}>
                      {data.portOfDischarge || '-'}
                    </div>
                  </td>
                  <td colSpan={2} style={{ ...tdBlockStyle, width: '33.34%' }}>
                    <div style={{ fontWeight: 800, fontSize: '9px', textTransform: 'uppercase', color: '#000', marginBottom: '3px' }}>
                      Payment Terms:
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '9.5px', color: '#000', whiteSpace: 'pre-line' }}>
                      {data.paymentTerms || '-'}
                    </div>
                  </td>
                </tr>

                {/* Section 5: Vessel, ETD, Delivery Terms */}
                <tr>
                  <td colSpan={2} style={{ ...tdBlockStyle, width: '33.33%' }}>
                    <div style={{ fontWeight: 800, fontSize: '9px', textTransform: 'uppercase', color: '#000', marginBottom: '3px' }}>
                      {activeTab === 'CI' ? 'Vessel / Flight:' : 'Vessel Name & Voyage No.:'}
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '9.5px', color: '#000' }}>
                      {data.vesselName || '-'}
                    </div>
                  </td>
                  <td colSpan={2} style={{ ...tdBlockStyle, width: '33.33%' }}>
                    <div style={{ fontWeight: 800, fontSize: '9px', textTransform: 'uppercase', color: '#000', marginBottom: '3px' }}>
                      {activeTab === 'CI' ? 'ETD:' : 'Sailing on or about:'}
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '9.5px', color: '#000' }}>
                      {data.etd || '-'}
                    </div>
                  </td>
                  <td colSpan={2} style={{ ...tdBlockStyle, width: '33.34%' }}>
                    <div style={{ fontWeight: 800, fontSize: '9px', textTransform: 'uppercase', color: '#000', marginBottom: '3px' }}>
                      Delivery Terms:
                    </div>
                    <div style={{ fontWeight: 400, fontSize: '9.5px', color: '#000' }}>
                      {data.deliveryTerms || '-'}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Items Grid */}
            {activeTab === 'CI' ? (
              // COMMERCIAL INVOICE ITEMS TABLE (6 Columns; HS Code removed from table; Empty padding rows added)
              (() => {
                const regularItems = ciItems.filter(it => !it.isFreight);
                const freightItems = ciItems.filter(it => it.isFreight);
                const minRows = 8;
                const emptyCount = Math.max(1, minRows - (regularItems.length + freightItems.length));
                const totalItemRows = regularItems.length + emptyCount + freightItems.length + (data.introText ? 1 : 0);

                return (
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: '16%' }}>Shipping Mark</th>
                        <th style={{ ...thStyle, width: '48%' }}>Description of Goods</th>
                        <th style={{ ...thStyle, width: '10%' }}>Quantity</th>
                        <th style={{ ...thStyle, width: '6%' }}>Unit</th>
                        <th style={{ ...thStyle, width: '10%' }}>Unit Price ($)</th>
                        <th style={{ ...thStyle, width: '10%' }}>Amount ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Top Intro Text if provided */}
                      {data.introText && (
                        <tr>
                          <td rowSpan={totalItemRows} style={{ ...tdItemStyle, textAlign: 'center', verticalAlign: 'middle', padding: '10px 4px', background: '#fff' }}>
                            {renderGraphicShippingMark()}
                          </td>
                          <td colSpan={5} style={{ ...tdItemStyle, fontSize: '10px', fontWeight: 700, padding: '6px 8px', background: '#fafafa' }}>
                            {data.introText}
                          </td>
                        </tr>
                      )}

                      {/* 1. Regular items */}
                      {regularItems.map((item, idx) => (
                        <tr key={`reg-${idx}`}>
                          {!data.introText && idx === 0 && (
                            <td rowSpan={totalItemRows} style={{ ...tdItemStyle, textAlign: 'center', verticalAlign: 'middle', padding: '10px 4px', background: '#fff' }}>
                              {renderGraphicShippingMark()}
                            </td>
                          )}
                          <td style={{ ...tdItemStyle, padding: '6px 8px' }}>
                            <div style={{ fontWeight: 400, fontSize: '10px' }}>{item.name}</div>
                          </td>
                          <td style={{ ...tdItemStyle, textAlign: 'right', fontSize: '10px' }}>
                            {Number(item.qty).toLocaleString()}
                          </td>
                          <td style={{ ...tdItemStyle, textAlign: 'center', fontSize: '10px' }}>
                            {item.unit || 'PCS'}
                          </td>
                          <td style={{ ...tdItemStyle, textAlign: 'right', fontSize: '10px' }}>
                            US${Number(item.unitPrice).toFixed(2)}
                          </td>
                          <td style={{ ...tdItemStyle, textAlign: 'right', fontSize: '10px', fontWeight: 400 }}>
                            US${Number(item.amount || ((item.qty || 0) * (item.unitPrice || 0))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}

                      {/* 2. Empty padding block to fill A4 sheet (Completely seamless with ZERO internal lines) */}
                      {emptyCount > 0 && (
                        <tr style={{ height: `${emptyCount * 26}px` }}>
                          {!data.introText && regularItems.length === 0 && (
                            <td rowSpan={totalItemRows} style={{ ...tdItemStyle, textAlign: 'center', verticalAlign: 'middle', padding: '10px 4px', background: '#fff' }}>
                              {renderGraphicShippingMark()}
                            </td>
                          )}
                          <td colSpan={5} style={{ borderLeft: 'none', borderRight: '1px solid #000', borderTop: 'none', borderBottom: 'none', background: '#fff' }}></td>
                        </tr>
                      )}

                      {/* 3. Freight items at the bottom */}
                      {freightItems.map((item, fIdx) => (
                        <tr key={`freight-${fIdx}`}>
                          <td style={{ ...tdItemStyle, padding: '6px 8px', fontWeight: 700, fontSize: '10px' }}>
                            {item.name}
                          </td>
                          <td style={tdItemStyle}></td>
                          <td style={tdItemStyle}></td>
                          <td style={tdItemStyle}></td>
                          <td style={{ ...tdItemStyle, textAlign: 'right', fontSize: '10px', fontWeight: 700 }}>
                            US${Number(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}

                      {/* CI Total row */}
                      <tr style={{ fontWeight: 'bold', background: '#f8fafc' }}>
                        <td style={{ ...tdItemStyle, textAlign: 'center', fontWeight: 900 }} colSpan={2}>TOTAL AMOUNT</td>
                        <td style={{ ...tdItemStyle, textAlign: 'right', fontWeight: 900 }}>{totalQtyCI.toLocaleString()}</td>
                        <td style={tdItemStyle}></td>
                        <td style={tdItemStyle}></td>
                        <td style={{ ...tdItemStyle, textAlign: 'right', fontSize: '11px', fontWeight: 900 }}>US${totalAmountCI.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    </tbody>
                  </table>
                );
              })()
            ) : (
              // AUTHENTIC PACKING LIST ITEMS TABLE
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '22%' }}>Shipping Marks</th>
                    <th style={{ ...thStyle, width: '48%' }}>
                      Description of Goods<br/>
                      <span style={{ fontSize: '9px', fontWeight: 500 }}>Quantity / Number of Packages</span>
                    </th>
                    <th style={{ ...thStyle, width: '10%' }}>Net Weight<br/><span style={{ fontSize: '9px', fontWeight: 500 }}>(KGS)</span></th>
                    <th style={{ ...thStyle, width: '10%' }}>Gross Weight<br/><span style={{ fontSize: '9px', fontWeight: 500 }}>(KGS)</span></th>
                    <th style={{ ...thStyle, width: '10%' }}>Measurement<br/><span style={{ fontSize: '9px', fontWeight: 500 }}>(CBM)</span></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Top Intro Section if present */}
                  {data.introText && (
                    <tr>
                      <td style={{ ...tdItemStyle, borderBottom: 'none' }}></td>
                      <td colSpan={4} style={{ ...tdItemStyle, fontSize: '10px', fontWeight: 700, padding: '6px 8px', background: '#fafafa', whiteSpace: 'pre-line' }}>
                        {data.introText}
                      </td>
                    </tr>
                  )}

                  {(() => {
                    const containersList = (data.containers && data.containers.length > 0)
                      ? data.containers
                      : [{ containerNo: '', sealNo: '', items: plItems.map((it, idx) => ({ pkgNo: String(idx + 1), description: it.name, netWeight: it.netWeight, grossWeight: it.grossWeight, cbm: it.cbm, qty: it.qty })) }];

                    return containersList.map((cData, cIdx) => {
                      const cItems = cData.items || [];
                      if (cItems.length === 0) return null;

                      // Group cItems by package
                      interface ModalPkgGroup {
                        pkgNo: string;
                        items: { name: string; qty: number; unit?: string }[];
                        netWeight: number;
                        grossWeight: number;
                        cbm: number;
                        pkgCount: number;
                      }

                      const packageGroups: ModalPkgGroup[] = [];
                      let curGroup: ModalPkgGroup | null = null;

                      cItems.forEach((it: any, itIdx: number) => {
                        const isSecondary = !!(it._sharedWithPrev || it._isMergedMember || (itIdx > 0 && it.pkgNo && curGroup && it.pkgNo === curGroup.pkgNo));
                        const cleanName = cleanCiName(it.description || (it as any).name || '');
                        const itQty = Number(it.qty) || 0;
                        const itUnit = it.unit || 'PCS';
                        const itNet = Number(it.netWeight) || 0;
                        const itGross = Number(it.grossWeight) || 0;
                        const itCbm = Number(it.cbm) || 0;

                        if (isSecondary && curGroup) {
                          curGroup.items.push({ name: cleanName, qty: itQty, unit: itUnit });
                          if (itNet > 0 && curGroup.netWeight === 0) curGroup.netWeight += itNet;
                          if (itGross > 0 && curGroup.grossWeight === 0) curGroup.grossWeight += itGross;
                          if (itCbm > 0 && curGroup.cbm === 0) curGroup.cbm += itCbm;
                        } else {
                          curGroup = {
                            pkgNo: it.pkgNo || String(packageGroups.length + 1),
                            items: [{ name: cleanName, qty: itQty, unit: itUnit }],
                            netWeight: itNet,
                            grossWeight: itGross,
                            cbm: itCbm,
                            pkgCount: Number(it.pkg) || 1
                          };
                          packageGroups.push(curGroup);
                        }
                      });

                      // container mark block

                      return packageGroups.map((pkg, pkgIdx) => {
                        const pkgNum = pkg.pkgNo;
                        const netW = pkg.netWeight;
                        const grossW = pkg.grossWeight;
                        const cbm = pkg.cbm;

                        return (
                          <tr key={`${cIdx}-${pkgIdx}`}>
                            {pkgIdx === 0 && (
                              <td rowSpan={packageGroups.length} style={{ ...tdItemStyle, textAlign: 'center', fontWeight: 'bold', whiteSpace: 'pre-line', verticalAlign: 'middle', padding: '10px 4px', background: '#fff' }}>
                                {cIdx === 0 && (
                                  <div style={{ marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px dashed #cbd5e1' }}>
                                    <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px' }}>SHIPPING MARKS:</div>
                                    {renderGraphicShippingMark()}
                                  </div>
                                )}
                                <div style={{ fontSize: '9.5px', color: '#1e293b' }}>
                                  CONTAINER NO.:<br/>
                                  <span style={{ fontSize: '11px', color: '#2563eb' }}>{cData.containerNo || '-'}</span>
                                </div>
                                <div style={{ fontSize: '9.5px', color: '#1e293b', marginTop: '6px' }}>
                                  SEAL NO.:<br/>
                                  <span style={{ fontSize: '10.5px' }}>{cData.sealNo || '-'}</span>
                                </div>
                              </td>
                            )}
                            <td style={{ ...tdItemStyle, fontWeight: 700 }}>
                              {pkg.items.length === 1 ? (
                                `P#${pkgNum} ${pkg.items[0].name}${netW > 0 ? `-${netW.toLocaleString()}KG` : ''}`
                              ) : (
                                <div>
                                  <div style={{ fontWeight: 800, color: '#1e3a8a', marginBottom: '2px' }}>
                                    P#{pkgNum}{netW > 0 ? ` (${netW.toLocaleString()}KG)` : ''}
                                  </div>
                                  <div style={{ paddingLeft: '6px', fontSize: '9px', lineHeight: '1.4' }}>
                                    {pkg.items.map((it, i) => (
                                      <div key={i} style={{ color: '#334155' }}>
                                        • {it.name}{it.qty > 0 ? ` (${it.qty.toLocaleString()} ${it.unit || 'PCS'})` : ''}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td style={{ ...tdItemStyle, textAlign: 'right' }}>
                              {netW > 0 ? netW.toLocaleString() : '-'}
                            </td>
                            <td style={{ ...tdItemStyle, textAlign: 'right' }}>
                              {grossW > 0 ? grossW.toLocaleString() : '-'}
                            </td>
                            <td style={{ ...tdItemStyle, textAlign: 'right' }}>
                              {cbm > 0 ? cbm.toFixed(2) : '-'}
                            </td>
                          </tr>
                        );
                      });
                    });
                  })()}

                  {/* PL Total row */}
                  <tr style={{ fontWeight: 'bold', backgroundColor: '#f8fafc' }}>
                    <td style={{ ...tdItemStyle, textAlign: 'center', fontWeight: 900 }}>TOTAL</td>
                    <td style={{ ...tdItemStyle, textAlign: 'center', fontWeight: 900 }}>{totalPackagesPL} GT</td>
                    <td style={{ ...tdItemStyle, textAlign: 'right', fontWeight: 900 }}>{totalNetPL.toLocaleString()} KGS</td>
                    <td style={{ ...tdItemStyle, textAlign: 'right', fontWeight: 900 }}>{totalGrossPL.toLocaleString()} KGS</td>
                    <td style={{ ...tdItemStyle, textAlign: 'right', fontWeight: 900 }}>{Number(totalCbmPL).toFixed(2)} CBM</td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* PL Bottom Sections (Container Info & PL Remarks) */}
            {activeTab === 'PL' && (
              <div style={{ marginTop: '4px', fontSize: '9.5px', color: '#000', lineHeight: 1.4 }}>
                <div style={{ letterSpacing: '3px', textAlign: 'center', margin: '4px 0', fontSize: '10px', fontWeight: 'bold' }}>
                  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                </div>
                {data.containerInfo && (
                  <div style={{ textAlign: 'right', fontWeight: 800, margin: '2px 0 6px 0', fontSize: '10px' }}>
                    {data.containerInfo.toUpperCase().startsWith('CONTAINER') ? data.containerInfo : `CONTAINER : ${data.containerInfo}`}
                  </div>
                )}
                {data.plRemarks && data.plRemarks.trim() && (
                  <div style={{ marginTop: '6px', whiteSpace: 'pre-line', fontSize: '9.5px', lineHeight: '1.4', fontWeight: 600 }}>
                    {data.plRemarks}
                  </div>
                )}
              </div>
            )}

            {/* Bottom Extra Sections matching CI template (Only rendered if filled) */}
            {activeTab === 'CI' && (
              <div style={{ marginTop: '4px', fontSize: '9.5px', color: '#000', lineHeight: 1.4 }}>
                <div style={{ letterSpacing: '3px', textAlign: 'center', margin: '4px 0', fontSize: '10px', fontWeight: 'bold' }}>
                  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                </div>
                {data.containerInfo && (
                  <div style={{ textAlign: 'right', fontWeight: 800, margin: '2px 0 6px 0', fontSize: '10px' }}>
                    {data.containerInfo.toUpperCase().startsWith('CONTAINER') ? data.containerInfo : `CONTAINER : ${data.containerInfo}`}
                  </div>
                )}
                
                {data.hsCodeSummary && (
                  <div style={{ marginTop: '6px' }}>
                    <div style={{ fontWeight: 800 }}>A) RELEVANT HARMONIZED SYSTEM COMMODITY CODE NUMBER(S) APPLICABLE TO EACH ITEM SHIPPED UNDER THIS CREDIT</div>
                    <div style={{ paddingLeft: '12px', whiteSpace: 'pre-line' }}>
                      {data.hsCodeSummary}
                    </div>
                  </div>
                )}

                {data.bottomFreeText ? (
                  <div style={{ marginTop: '6px', whiteSpace: 'pre-line', fontSize: '9.5px', lineHeight: '1.4' }}>
                    {data.bottomFreeText}
                  </div>
                ) : (
                  <>
                    {data.vatTrn && (
                      <div style={{ marginTop: '4px' }}>
                        <span style={{ fontWeight: 800 }}>
                          {data.vatTrn.trim().toUpperCase().startsWith('B)') ? data.vatTrn.trim() : `B) TRN Number: ${data.vatTrn.trim()}`}
                        </span>
                      </div>
                    )}

                    {(data.manufacturerName || data.manufacturerAddress) && (
                      <div style={{ marginTop: '4px' }}>
                        <div style={{ fontWeight: 800 }}>C) MANUFACTURER/PRODUCER</div>
                        <div style={{ paddingLeft: '12px' }}>
                          {data.manufacturerName && <div>1. NAME : {data.manufacturerName}</div>}
                          {data.manufacturerAddress && <div>2. ADDRESS : {data.manufacturerAddress}</div>}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Footer Signature with Ample Space */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '36px', paddingRight: '20px', paddingBottom: '20px' }}>
              <div style={{ textAlign: 'center', width: '250px' }}>
                <div style={{ fontSize: '11px', fontStyle: 'italic', fontWeight: 600, marginBottom: '60px' }}>Signed by</div>
                <div style={{ borderBottom: '1.5px solid #000', width: '100%', margin: '0 auto 6px' }}></div>
                <div style={{ fontWeight: 800, fontSize: '12px', letterSpacing: '0.5px' }}>{companyName}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
