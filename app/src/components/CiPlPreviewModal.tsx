import React, { useState, useRef } from 'react';

interface PreviewItem {
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
}

interface CiPlPreviewModalProps {
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
    items: PreviewItem[];
    totalPackages?: number;
    totalNetWeight?: number;
    totalGrossWeight?: number;
    totalCbm?: number;
    customShipperText?: string;
  };
  onExportExcel?: () => void;
}

export const CiPlPreviewModal: React.FC<CiPlPreviewModalProps> = ({ isOpen, onClose, data, onExportExcel }) => {
  const [activeTab, setActiveTab] = useState<'CI' | 'PL'>('CI');
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const currentPos = useRef({ x: 100, y: 100 });

  // Reset/Set initial position on opening
  React.useEffect(() => {
    if (isOpen) {
      const initialX = Math.max(20, window.innerWidth - 860);
      const initialY = 120;
      setPosition({ x: initialX, y: initialY });
      currentPos.current = { x: initialX, y: initialY };
    }
  }, [isOpen]);

  const companyName = data.issuingCompany === 'YSACC' ? 'YSACC CO., LTD.' : 'YS CO., LTD.';
  const shipperAddress = `${companyName}\nSuite 408, Dae-il Bldg, 12, Mapo-daero 4-gil,\nMapo-gu, Seoul, 04175, Korea`;

  const totalQty = data.items.reduce((sum, item) => sum + (item.qty || 0), 0);
  const totalAmount = data.items.reduce((sum, item) => sum + (item.amount || 0), 0);
  const totalPackages = data.totalPackages || data.items.reduce((sum, item) => sum + (item.packagesCount || item.qty || 0), 0);
  const totalNet = data.totalNetWeight || data.items.reduce((sum, item) => sum + (item.netWeight || 0), 0);
  const totalGross = data.totalGrossWeight || data.items.reduce((sum, item) => sum + (item.grossWeight || 0), 0);
  const totalCbm = data.totalCbm || data.items.reduce((sum, item) => sum + (item.cbm || 0), 0);

  // Mouse Drag Events using window events with useRef to prevent closures
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStart.current.x;
    const deltaY = e.clientY - dragStart.current.y;
    
    const nextX = Math.max(10, Math.min(window.innerWidth - 100, currentPos.current.x + deltaX));
    const nextY = Math.max(10, Math.min(window.innerHeight - 100, currentPos.current.y + deltaY));
    
    setPosition({ x: nextX, y: nextY });
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (!isDragging) return;
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
  }, [isDragging]);

  if (!isOpen) return null;

  // Styles
  const windowStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: '820px',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 12px 36px rgba(0,0,0,0.25)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 10000,
    border: '2px solid var(--border-default)',
    userSelect: isDragging ? 'none' : 'auto'
  };

  const a4PageStyle: React.CSSProperties = {
    padding: '30px', color: '#000', fontFamily: 'serif', fontSize: '12px',
    lineHeight: 1.3, display: 'flex', flexDirection: 'column', gap: '15px'
  };

  const tableStyle: React.CSSProperties = {
    width: '100%', borderCollapse: 'collapse', marginTop: '10px'
  };

  const tdHeaderStyle: React.CSSProperties = {
    border: '1px solid #000', padding: '8px', verticalAlign: 'top', width: '50%'
  };

  const thStyle: React.CSSProperties = {
    border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 'bold', backgroundColor: '#f8fafc'
  };

  const tdItemStyle: React.CSSProperties = {
    border: '1px solid #000', padding: '6px', verticalAlign: 'middle'
  };

  return (
    <div style={windowStyle}>
      {/* Draggable Title Header */}
      <div 
        onMouseDown={handleMouseDown}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 16px', borderBottom: '1px solid var(--border-default)', backgroundColor: '#f1f5f9',
          borderTopLeftRadius: '10px', borderTopRightRadius: '10px', cursor: 'move',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)', marginRight: '8px' }}>⚡ 드래그하여 이동 가능</span>
          <button
            onClick={(e) => { e.stopPropagation(); setActiveTab('CI'); }}
            style={{
              padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
              border: activeTab === 'CI' ? 'none' : '1px solid var(--border-default)',
              backgroundColor: activeTab === 'CI' ? '#2563eb' : '#fff',
              color: activeTab === 'CI' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            Invoice
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setActiveTab('PL'); }}
            style={{
              padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
              border: activeTab === 'PL' ? 'none' : '1px solid var(--border-default)',
              backgroundColor: activeTab === 'PL' ? '#2563eb' : '#fff',
              color: activeTab === 'PL' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            Packing List
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }} onMouseDown={e => e.stopPropagation()}>
          {onExportExcel && (
            <button
              type="button"
              onClick={onExportExcel}
              style={{
                padding: '4px 12px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                border: 'none', backgroundColor: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px',
                boxShadow: '0 2px 4px rgba(16,185,129,0.2)'
              }}
            >
              📥 Excel 다운로드
            </button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 'bold' }}>✕</button>
        </div>
      </div>

        {/* Paper Container */}
        <div style={{ padding: '20px', backgroundColor: '#f1f5f9', display: 'flex', justifyContent: 'center', maxHeight: '72vh', overflowY: 'auto' }}>
          <div style={{ backgroundColor: '#fff', width: '100%', maxWidth: '800px', boxShadow: '0 4px 10px rgba(0,0,0,0.06)', borderRadius: '4px' }}>
            <div style={a4PageStyle}>
              {/* Document Title */}
              <div style={{ textAlign: 'center', fontSize: '22px', fontWeight: 'bold', textDecoration: 'underline', textTransform: 'uppercase', marginBottom: '10px' }}>
                {activeTab === 'CI' ? 'Commercial Invoice' : 'Packing List'}
              </div>

              {/* Standard CI/PL Header Blocks */}
              <table style={tableStyle}>
                <tbody>
                  <tr>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>Shipper / Beneficiary / Manufacturer</div>
                      <div style={{ whiteSpace: 'pre-line', fontWeight: 600 }}>{data.customShipperText || shipperAddress}</div>
                    </td>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>
                        {activeTab === 'CI' ? 'Invoice No. & Date' : 'Packing List No. & Date'}
                      </div>
                      <div style={{ fontWeight: 'bold' }}>{data.piNumber || '-'} / {data.invoiceDate || '-'}</div>
                      <div style={{ marginTop: '10px', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '10px', color: 'var(--text-secondary)' }}>L/C No. & Date</div>
                      <div>{data.lcNo || 'N/A'} {data.lcDate ? `/ ${data.lcDate}` : ''}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>Applicant (Buyer)</div>
                      <div style={{ fontWeight: 'bold' }}>{data.customerName}</div>
                      <div style={{ whiteSpace: 'pre-line', marginTop: '4px' }}>{data.customerAddress || ''}</div>
                    </td>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>L/C Issuing Bank</div>
                      <div>{data.lcIssuingBank || 'N/A'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>Notify Party</div>
                      <div style={{ whiteSpace: 'pre-line' }}>{data.notifyParty || 'SAME AS APPLICANT'}</div>
                    </td>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>Remarks</div>
                      <div style={{ whiteSpace: 'pre-line' }}>{data.remarks || '-'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={tdHeaderStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '10px', color: 'var(--text-secondary)' }}>Port of Loading</div>
                          <div style={{ fontWeight: 'bold' }}>{data.portOfLoading || '-'}</div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '10px', color: 'var(--text-secondary)' }}>Port of Discharge</div>
                          <div style={{ fontWeight: 'bold' }}>{data.portOfDischarge || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', fontSize: '10px', color: 'var(--text-secondary)' }}>Payment Terms</div>
                      <div style={{ fontWeight: 'bold' }}>{data.paymentTerms || '-'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={tdHeaderStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '10px', color: 'var(--text-secondary)' }}>Vessel Name & Voyage No.</div>
                          <div>{data.vesselName || '-'}</div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '10px', color: 'var(--text-secondary)' }}>Sailing on or about</div>
                          <div>{data.etd || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', fontSize: '10px', color: 'var(--text-secondary)' }}>Delivery Terms (Incoterms)</div>
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
                      <th style={{ ...thStyle, width: '15%' }}>Shipping Mark</th>
                      <th style={{ ...thStyle, width: '40%' }}>Description of Goods</th>
                      <th style={{ ...thStyle, width: '15%' }}>Quantity</th>
                      <th style={{ ...thStyle, width: '15%' }}>Unit Price</th>
                      <th style={{ ...thStyle, width: '15%' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item, idx) => (
                      <tr key={idx}>
                        {idx === 0 && (
                          <td rowSpan={data.items.length} style={{ ...tdItemStyle, textAlign: 'center', fontWeight: 'bold', whiteSpace: 'pre-line' }}>
                            {data.shippingMarks || 'N/M'}
                          </td>
                        )}
                        <td style={tdItemStyle}>
                          <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                          {item.hsCode && <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>HS CODE: {item.hsCode}</div>}
                        </td>
                        <td style={{ ...tdItemStyle, textAlign: 'right' }}>{item.qty.toLocaleString()} {item.unit}</td>
                        <td style={{ ...tdItemStyle, textAlign: 'right' }}>${Number(item.unitPrice).toFixed(2)}</td>
                        <td style={{ ...tdItemStyle, textAlign: 'right', fontWeight: 'bold' }}>${Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    {/* CI Total row */}
                    <tr>
                      <td style={{ ...tdItemStyle, fontWeight: 'bold', textAlign: 'center' }}>TOTAL AMOUNT</td>
                      <td style={tdItemStyle}></td>
                      <td style={{ ...tdItemStyle, fontWeight: 'bold', textAlign: 'right' }}>{totalQty.toLocaleString()}</td>
                      <td style={tdItemStyle}></td>
                      <td style={{ ...tdItemStyle, fontWeight: 'bold', textAlign: 'right', fontSize: '13px' }}>${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                // PACKING LIST ITEMS TABLE
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, width: '15%' }}>Shipping Marks</th>
                      <th style={{ ...thStyle, width: '35%' }}>Description of Goods</th>
                      <th style={{ ...thStyle, width: '18%' }}>Quantity / Packages</th>
                      <th style={{ ...thStyle, width: '11%' }}>Net Weight</th>
                      <th style={{ ...thStyle, width: '11%' }}>Gross Weight</th>
                      <th style={{ ...thStyle, width: '10%' }}>CBM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item, idx) => (
                      <tr key={idx}>
                        {idx === 0 && (
                          <td rowSpan={data.items.length} style={{ ...tdItemStyle, textAlign: 'center', fontWeight: 'bold', whiteSpace: 'pre-line' }}>
                            {data.shippingMarks || 'N/M'}
                          </td>
                        )}
                        <td style={tdItemStyle}>
                          <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                        </td>
                        <td style={{ ...tdItemStyle, textAlign: 'center' }}>
                          {item.packagesCount || item.qty} {item.packageType || 'Pallet'} ({item.qty.toLocaleString()} {item.unit})
                        </td>
                        <td style={{ ...tdItemStyle, textAlign: 'right' }}>{(item.netWeight || 0).toLocaleString()} KGS</td>
                        <td style={{ ...tdItemStyle, textAlign: 'right' }}>{(item.grossWeight || 0).toLocaleString()} KGS</td>
                        <td style={{ ...tdItemStyle, textAlign: 'right' }}>{(item.cbm || 0).toFixed(3)} CBM</td>
                      </tr>
                    ))}
                    {/* PL Total row */}
                    <tr>
                      <td style={{ ...tdItemStyle, fontWeight: 'bold', textAlign: 'center' }}>TOTAL</td>
                      <td style={tdItemStyle}></td>
                      <td style={{ ...tdItemStyle, fontWeight: 'bold', textAlign: 'center' }}>{totalPackages} PLT</td>
                      <td style={{ ...tdItemStyle, fontWeight: 'bold', textAlign: 'right' }}>{totalNet.toLocaleString()} KGS</td>
                      <td style={{ ...tdItemStyle, fontWeight: 'bold', textAlign: 'right' }}>{totalGross.toLocaleString()} KGS</td>
                      <td style={{ ...tdItemStyle, fontWeight: 'bold', textAlign: 'right' }}>{totalCbm.toFixed(3)} CBM</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* Bottom Harmonized Code info in CI */}
              {activeTab === 'CI' && (
                <div style={{ marginTop: '10px', border: '1px solid #000', padding: '8px', fontSize: '10.5px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>A) RELEVANT HARMONIZED SYSTEM COMMODITY CODE NUMBER(S) APPLICABLE TO EACH ITEM SHIPPED</div>
                  <div style={{ color: '#334155' }}>
                    {data.items.map(it => `${it.name}: ${it.hsCode || 'N/A'}`).join(' | ')}
                  </div>
                </div>
              )}

              {/* Footer Signature */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '40px', paddingRight: '20px' }}>
                <div style={{ textAlign: 'center', width: '250px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '45px' }}>Signed by</div>
                  <div style={{ borderBottom: '1px solid #000', width: '100%', margin: '0 auto 4px' }}></div>
                  <div style={{ fontWeight: 'bold', fontSize: '11.5px' }}>{companyName}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
};
