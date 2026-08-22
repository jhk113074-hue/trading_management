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

export interface CiPlPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: {
    piNumber: string;
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
    customShipperText?: string;
    items: PreviewItem[];
    ciItems?: PreviewItem[];
    plItems?: PreviewItem[];
    totalPackages?: number;
    totalNetWeight?: number;
    totalGrossWeight?: number;
    totalCbm?: number;
    introText?: string;
    containerInfo?: string;
    vatTrn?: string;
    manufacturerName?: string;
    manufacturerAddress?: string;
    hsCodeSummary?: string;
  };
  onExportExcel?: () => void;
}

export const CiPlPreviewModal: React.FC<CiPlPreviewModalProps> = ({ isOpen, onClose, data, onExportExcel }) => {
  const [activeTab, setActiveTab] = useState<'CI' | 'PL'>('CI');
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

  const tdHeaderStyle: React.CSSProperties = {
    border: '1px solid #000',
    padding: '6px 8px',
    fontSize: '10px',
    verticalAlign: 'top',
    color: '#000',
    lineHeight: 1.35
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
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {onExportExcel && (
              <button
                type="button"
                onClick={onExportExcel}
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
            fontFamily: "'Arial', 'Noto Sans KR', sans-serif",
            color: '#000',
            boxSizing: 'border-box'
          }}>
            {/* Top Letterhead */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '2px solid #000', paddingBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '0.5px' }}>{companyName}</div>
                <div style={{ fontSize: '9.5px', color: '#1e293b', whiteSpace: 'pre-line', marginTop: '2px', lineHeight: 1.3 }}>
                  {headerAddress}
                </div>
              </div>
            </div>

            {/* Document Title */}
            <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: 900, textTransform: 'capitalize', margin: '14px 0 16px 0', textDecoration: 'none', letterSpacing: '0.5px' }}>
              {activeTab === 'CI' ? 'Commercial Invoice' : 'Packing List'}
            </div>

            {/* Header 5x2 Info Grid */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
              <tbody>
                <tr>
                  <td style={{ ...tdHeaderStyle, width: '50%' }}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px', fontSize: '9.5px' }}>Shipper / Beneficiary</div>
                    <div style={{ whiteSpace: 'pre-line', fontWeight: 600 }}>{data.customShipperText || `${companyName}\n${headerAddress}`}</div>
                  </td>
                  <td style={{ ...tdHeaderStyle, width: '50%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9.5px' }}>Invoice No. & Date</div>
                      <div style={{ fontSize: '10px', fontWeight: 700 }}>{data.invoiceDate}</div>
                    </div>
                    <div style={{ fontWeight: 'bold', fontSize: '11px', marginTop: '2px' }}>{data.piNumber || '-'}</div>
                    <div style={{ borderTop: '1px solid #000', marginTop: '6px', paddingTop: '4px' }}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '9.5px' }}>L/C No. & Date</div>
                      <div>{data.lcNo || 'N/A'} {data.lcDate ? `& ${data.lcDate}` : ''}</div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style={tdHeaderStyle}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px', fontSize: '9.5px' }}>Applicant</div>
                    <div style={{ fontWeight: 'bold' }}>{data.customerName}</div>
                    <div style={{ whiteSpace: 'pre-line', marginTop: '2px' }}>{data.customerAddress || ''}</div>
                  </td>
                  <td style={tdHeaderStyle}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px', fontSize: '9.5px' }}>L/C Issuing Bank</div>
                    <div style={{ whiteSpace: 'pre-line' }}>{data.lcIssuingBank || 'N/A'}</div>
                  </td>
                </tr>
                <tr>
                  <td style={tdHeaderStyle}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px', fontSize: '9.5px' }}>Notify Party</div>
                    <div style={{ whiteSpace: 'pre-line' }}>{data.notifyParty || data.customerName || 'Same as Applicant'}</div>
                  </td>
                  <td style={tdHeaderStyle}>
                    <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px', fontSize: '9.5px' }}>Remarks</div>
                    <div style={{ whiteSpace: 'pre-line' }}>{data.remarks ? `"${data.remarks}"` : '"FREIGHT PREPAID"'}</div>
                  </td>
                </tr>
                <tr>
                  <td style={tdHeaderStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '9px', textTransform: 'uppercase' }}>Port of Loading</div>
                        <div style={{ fontWeight: 'bold', fontSize: '10px' }}>{data.portOfLoading || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '9px', textTransform: 'uppercase' }}>Port of Discharge</div>
                        <div style={{ fontWeight: 'bold', fontSize: '10px' }}>{data.portOfDischarge || '-'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={tdHeaderStyle}>
                    <div style={{ fontWeight: 'bold', fontSize: '9px', textTransform: 'uppercase' }}>Payment Terms</div>
                    <div style={{ fontWeight: 'bold' }}>{data.paymentTerms || '-'}</div>
                  </td>
                </tr>
                <tr>
                  <td style={tdHeaderStyle}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '9px', textTransform: 'uppercase' }}>Vessel Name & Voyage No.</div>
                        <div>{data.vesselName || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '9px', textTransform: 'uppercase' }}>Sailing on or about</div>
                        <div>{data.etd || '-'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={tdHeaderStyle}>
                    <div style={{ fontWeight: 'bold', fontSize: '9px', textTransform: 'uppercase' }}>Delivery Terms</div>
                    <div style={{ fontWeight: 'bold' }}>{data.deliveryTerms || '-'}</div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Items Grid */}
            {activeTab === 'CI' ? (
              // COMMERCIAL INVOICE ITEMS TABLE
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '18%' }}>Shipping Mark</th>
                    <th style={{ ...thStyle, width: '42%' }}>Description of Goods</th>
                    <th style={{ ...thStyle, width: '14%' }}>Quantity<br/><span style={{ fontSize: '9px', fontWeight: 500 }}>(PCS)</span></th>
                    <th style={{ ...thStyle, width: '13%' }}>Unit Price<br/><span style={{ fontSize: '9px', fontWeight: 500 }}>(USD)</span></th>
                    <th style={{ ...thStyle, width: '13%' }}>Amount<br/><span style={{ fontSize: '9px', fontWeight: 500 }}>(USD)</span></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Top Intro Text if provided */}
                  {data.introText && (
                    <tr>
                      <td rowSpan={ciItems.length + 1} style={{ ...tdItemStyle, textAlign: 'center', fontWeight: 'bold', whiteSpace: 'pre-line', verticalAlign: 'middle', padding: '10px 4px' }}>
                        {data.shippingMarks || 'N/M'}
                      </td>
                      <td colSpan={4} style={{ ...tdItemStyle, fontSize: '10px', fontWeight: 700, padding: '6px 8px', background: '#fafafa' }}>
                        {data.introText}
                      </td>
                    </tr>
                  )}
                  {ciItems.map((item, idx) => (
                    <tr key={idx}>
                      {!data.introText && idx === 0 && (
                        <td rowSpan={ciItems.length} style={{ ...tdItemStyle, textAlign: 'center', fontWeight: 'bold', whiteSpace: 'pre-line', verticalAlign: 'middle', padding: '10px 4px' }}>
                          {data.shippingMarks || 'N/M'}
                        </td>
                      )}
                      <td style={tdItemStyle}>
                        <div style={{ fontWeight: item.isFreight ? 800 : 700 }}>{item.name}</div>
                      </td>
                      <td style={{ ...tdItemStyle, textAlign: 'right' }}>{Number(item.qty).toLocaleString()}</td>
                      <td style={{ ...tdItemStyle, textAlign: 'right' }}>US${Number(item.unitPrice).toFixed(2)}</td>
                      <td style={{ ...tdItemStyle, textAlign: 'right', fontWeight: 'bold' }}>US${Number(item.amount || ((item.qty || 0) * (item.unitPrice || 0))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  {/* CI Total row */}
                  <tr style={{ fontWeight: 'bold' }}>
                    <td style={{ ...tdItemStyle, textAlign: 'left', fontWeight: 900, paddingLeft: '8px' }} colSpan={2}>TOTAL AMOUNT</td>
                    <td style={{ ...tdItemStyle, textAlign: 'right', fontWeight: 900 }}>{totalQtyCI.toLocaleString()}</td>
                    <td style={tdItemStyle}></td>
                    <td style={{ ...tdItemStyle, textAlign: 'right', fontSize: '11px', fontWeight: 900 }}>US${totalAmountCI.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              // PACKING LIST ITEMS TABLE
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '18%' }}>Shipping Marks</th>
                    <th style={{ ...thStyle, width: '36%' }}>Description of Goods</th>
                    <th style={{ ...thStyle, width: '18%' }}>Quantity / Packages</th>
                    <th style={{ ...thStyle, width: '10%' }}>Net Weight</th>
                    <th style={{ ...thStyle, width: '10%' }}>Gross Weight</th>
                    <th style={{ ...thStyle, width: '8%' }}>CBM</th>
                  </tr>
                </thead>
                <tbody>
                  {plItems.map((item, idx) => (
                    <tr key={idx}>
                      {idx === 0 && (
                        <td rowSpan={plItems.length} style={{ ...tdItemStyle, textAlign: 'center', fontWeight: 'bold', whiteSpace: 'pre-line', verticalAlign: 'middle', padding: '10px 4px' }}>
                          {data.shippingMarks || 'N/M'}
                        </td>
                      )}
                      <td style={tdItemStyle}>
                        <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                      </td>
                      <td style={{ ...tdItemStyle, textAlign: 'center' }}>
                        {item.packagesCount && item.packagesCount > 0 
                          ? `${item.packagesCount} ${item.packageType || 'Pallet'} (${Number(item.qty).toLocaleString()} ${item.unit || 'EA'})`
                          : `(${Number(item.qty).toLocaleString()} ${item.unit || 'EA'})`}
                      </td>
                      <td style={{ ...tdItemStyle, textAlign: 'right' }}>
                        {item.netWeight ? `${Number(item.netWeight).toLocaleString()} KGS` : '-'}
                      </td>
                      <td style={{ ...tdItemStyle, textAlign: 'right' }}>
                        {item.grossWeight ? `${Number(item.grossWeight).toLocaleString()} KGS` : '-'}
                      </td>
                      <td style={{ ...tdItemStyle, textAlign: 'right' }}>
                        {item.cbm ? `${Number(item.cbm).toFixed(3)} CBM` : '-'}
                      </td>
                    </tr>
                  ))}
                  {/* PL Total row */}
                  <tr style={{ fontWeight: 'bold', backgroundColor: '#f8fafc' }}>
                    <td style={{ ...tdItemStyle, textAlign: 'center' }}>TOTAL</td>
                    <td style={tdItemStyle}></td>
                    <td style={{ ...tdItemStyle, textAlign: 'center' }}>{totalPackagesPL} PLT</td>
                    <td style={{ ...tdItemStyle, textAlign: 'right' }}>{totalNetPL.toLocaleString()} KGS</td>
                    <td style={{ ...tdItemStyle, textAlign: 'right' }}>{totalGrossPL.toLocaleString()} KGS</td>
                    <td style={{ ...tdItemStyle, textAlign: 'right' }}>{Number(totalCbmPL).toFixed(3)} CBM</td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* Bottom Extra Sections matching CI template */}
            {activeTab === 'CI' && (
              <div style={{ marginTop: '4px', fontSize: '9.5px', color: '#000', lineHeight: 1.4 }}>
                <div style={{ letterSpacing: '3px', textAlign: 'center', margin: '4px 0', fontSize: '10px', fontWeight: 'bold' }}>
                  ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
                </div>
                {data.containerInfo && (
                  <div style={{ textAlign: 'right', fontWeight: 800, margin: '2px 0 6px 0', fontSize: '10px' }}>
                    {data.containerInfo}
                  </div>
                )}
                
                <div style={{ marginTop: '6px' }}>
                  <div style={{ fontWeight: 800 }}>A) RELEVANT HARMONIZED SYSTEM COMMODITY CODE NUMBER(S) APPLICABLE TO EACH ITEM SHIPPED UNDER THIS CREDIT</div>
                  <div style={{ paddingLeft: '12px', whiteSpace: 'pre-line' }}>
                    {data.hsCodeSummary || (() => {
                      const distinct: { [name: string]: string } = {};
                      ciItems.forEach(it => {
                        if (!it.isFreight && it.hsCode) {
                          const base = it.name.split('(')[0].trim();
                          if (!distinct[base]) distinct[base] = it.hsCode;
                        }
                      });
                      const entries = Object.entries(distinct);
                      if (entries.length > 0) {
                        return entries.map(([name, code], i) => `${i + 1}) ${name.toUpperCase()}: ${code}`).join('\n');
                      }
                      return '1) GENERAL GOODS: 3923.29-00';
                    })()}
                  </div>
                </div>

                {data.vatTrn && (
                  <div style={{ marginTop: '4px' }}>
                    <span style={{ fontWeight: 800 }}>B) VAT registration(TRN) number : </span>
                    <span style={{ fontWeight: 700 }}>{data.vatTrn}</span>
                  </div>
                )}

                <div style={{ marginTop: '4px' }}>
                  <div style={{ fontWeight: 800 }}>C) MANUFACTURER/PRODUCER</div>
                  <div style={{ paddingLeft: '12px' }}>
                    <div>1. NAME : {data.manufacturerName || 'JEONGDO CO.,LTD'}</div>
                    <div>2. ADDRESS : {data.manufacturerAddress || '67 GWINONG 1-GIL, DEOKSAN-MYEON, JINCHEON-GUN, CHUNGCHEONGBUK-DO, SOUTH KOREA'}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Signature */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', paddingRight: '20px' }}>
              <div style={{ textAlign: 'center', width: '220px' }}>
                <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '35px' }}>Signed by</div>
                <div style={{ borderBottom: '1px solid #000', width: '100%', margin: '0 auto 4px' }}></div>
                <div style={{ fontWeight: 'bold', fontSize: '11px' }}>{companyName}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
