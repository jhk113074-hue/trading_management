import React, { useState } from 'react';

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
  };
}

export const CiPlPreviewModal: React.FC<CiPlPreviewModalProps> = ({ isOpen, onClose, data }) => {
  const [activeTab, setActiveTab] = useState<'CI' | 'PL'>('CI');

  if (!isOpen) return null;

  const companyName = data.issuingCompany === 'YSACC' ? 'YSACC CO., LTD.' : 'YS CO., LTD.';
  const shipperAddress = `${companyName}\nSuite 408, Dae-il Bldg, 12, Mapo-daero 4-gil,\nMapo-gu, Seoul, 04175, Korea`;

  const totalQty = data.items.reduce((sum, item) => sum + (item.qty || 0), 0);
  const totalAmount = data.items.reduce((sum, item) => sum + (item.amount || 0), 0);
  const totalPackages = data.totalPackages || data.items.reduce((sum, item) => sum + (item.packagesCount || item.qty || 0), 0);
  const totalNet = data.totalNetWeight || data.items.reduce((sum, item) => sum + (item.netWeight || 0), 0);
  const totalGross = data.totalGrossWeight || data.items.reduce((sum, item) => sum + (item.grossWeight || 0), 0);
  const totalCbm = data.totalCbm || data.items.reduce((sum, item) => sum + (item.cbm || 0), 0);

  // Styles
  const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)', display: 'flex', justifyContent: 'center',
    alignItems: 'flex-start', zIndex: 1000, overflowY: 'auto', padding: '40px 20px'
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: '#fff', borderRadius: '12px', width: '850px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column',
    position: 'relative', border: '1px solid #cbd5e1'
  };

  const a4PageStyle: React.CSSProperties = {
    padding: '40px', color: '#000', fontFamily: 'serif', fontSize: '12px',
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
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Modal Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc', borderTopLeftRadius: '12px', borderTopRightRadius: '12px' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setActiveTab('CI')}
              style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                border: activeTab === 'CI' ? 'none' : '1px solid #cbd5e1',
                backgroundColor: activeTab === 'CI' ? '#2563eb' : '#fff',
                color: activeTab === 'CI' ? '#fff' : '#475569'
              }}
            >
              Commercial Invoice 미리보기
            </button>
            <button
              onClick={() => setActiveTab('PL')}
              style={{
                padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                border: activeTab === 'PL' ? 'none' : '1px solid #cbd5e1',
                backgroundColor: activeTab === 'PL' ? '#2563eb' : '#fff',
                color: activeTab === 'PL' ? '#fff' : '#475569'
              }}
            >
              Packing List 미리보기
            </button>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        {/* Paper Container */}
        <div style={{ padding: '20px', backgroundColor: '#f1f5f9', display: 'flex', justifyContent: 'center' }}>
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
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '10px', color: '#475569' }}>Shipper / Beneficiary / Manufacturer</div>
                      <div style={{ whiteSpace: 'pre-line', fontWeight: 600 }}>{shipperAddress}</div>
                    </td>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '10px', color: '#475569' }}>
                        {activeTab === 'CI' ? 'Invoice No. & Date' : 'Packing List No. & Date'}
                      </div>
                      <div style={{ fontWeight: 'bold' }}>{data.piNumber || '-'} / {data.invoiceDate || '-'}</div>
                      <div style={{ marginTop: '10px', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '10px', color: '#475569' }}>L/C No. & Date</div>
                      <div>{data.lcNo || 'N/A'} {data.lcDate ? `/ ${data.lcDate}` : ''}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '10px', color: '#475569' }}>Applicant (Buyer)</div>
                      <div style={{ fontWeight: 'bold' }}>{data.customerName}</div>
                      <div style={{ whiteSpace: 'pre-line', marginTop: '4px' }}>{data.customerAddress || ''}</div>
                    </td>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '10px', color: '#475569' }}>L/C Issuing Bank</div>
                      <div>{data.lcIssuingBank || 'N/A'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '10px', color: '#475569' }}>Notify Party</div>
                      <div style={{ whiteSpace: 'pre-line' }}>{data.notifyParty || 'SAME AS APPLICANT'}</div>
                    </td>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', fontSize: '10px', color: '#475569' }}>Remarks</div>
                      <div style={{ whiteSpace: 'pre-line' }}>{data.remarks || '-'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={tdHeaderStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '10px', color: '#475569' }}>Port of Loading</div>
                          <div style={{ fontWeight: 'bold' }}>{data.portOfLoading || '-'}</div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '10px', color: '#475569' }}>Port of Discharge</div>
                          <div style={{ fontWeight: 'bold' }}>{data.portOfDischarge || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', fontSize: '10px', color: '#475569' }}>Payment Terms</div>
                      <div style={{ fontWeight: 'bold' }}>{data.paymentTerms || '-'}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style={tdHeaderStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '10px', color: '#475569' }}>Vessel Name & Voyage No.</div>
                          <div>{data.vesselName || '-'}</div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '10px', color: '#475569' }}>Sailing on or about</div>
                          <div>{data.etd || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdHeaderStyle}>
                      <div style={{ fontWeight: 'bold', fontSize: '10px', color: '#475569' }}>Delivery Terms (Incoterms)</div>
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
                          {item.hsCode && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>HS CODE: {item.hsCode}</div>}
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
    </div>
  );
};
