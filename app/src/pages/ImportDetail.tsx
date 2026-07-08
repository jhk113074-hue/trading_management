import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ImportRequest } from '../types';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { previewFile } from '../components/FilePreviewModal';

const INITIAL_IMPORTS: ImportRequest[] = [
  {
    id: '189348',
    status: '\uC9C5\uD589 \uACB0\uC815 \uC694\uCCAD', // 진행 결정 요청
    blAwb: '-',
    poNumber: '-',
    itemName: 'Fiberglass tissue',
    transportType: 'FCA | \uD574\uC0C1LCL', // 해상LCL
    volume: '0.8 R.TON',
    routeFrom: '\uC911\uAD6D \uD68C\uD558\uD56D', // 중국 위해항
    routeTo: '\uD55C\uAD6D \uB0B4\uB959', // 한국 내륙
    manager: '\uAE40\uC8FC\uD55C', // 김주한
    amount: 489316,
    createdAt: '2026. 07. 03.',
    portOfLoading: 'Weihai port (CNWEI)',
    portOfDischarge: 'Incheon port (KRINC)',
    vesselName: 'TS NANSHA 26002S',
    etd: '2026-07-06',
    eta: '2026-07-08',
    shipperName: 'Shanghai Warehouse (CNWIP)',
    shipperPhone: '+86-138-0000-0000',
    shipperEmail: 'shipper@shanghai.com',
    packingQty: 4,
    packingUnit: 'BOXES',
    dimensions: '125*40*40(CM)',
    weight: '18.5KG',
    dangerousCargo: '\uBBF8\uD3EC\uD568', // 미포함
    msdsStatus: '\uBBF8\uD3EC\uD568', // 미포함
    lssIncluded: '\uD3EC\uD568', // 포함
    localTransportType: '\uB3C5\uCC28', // 독차
    customsAgent: '\uC774\uC74C\uAD05\uC138\uC0AC\uBB34\uC18C', // 이음관세사무소
    cargoInsurance: '\uBBF8\uC9C0\uCCAD', // 미신청
    ftaOriginCert: '\uBBF8\uC9C0\uCCAD' // 미신청
  }
];

export const ImportDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [importRequests, setImportRequests] = useState<ImportRequest[]>(() => {
    const saved = localStorage.getItem('import_requests');
    return saved ? JSON.parse(saved) : INITIAL_IMPORTS;
  });

  const saveToStorage = (updatedList: ImportRequest[]) => {
    localStorage.setItem('import_requests', JSON.stringify(updatedList));
    setImportRequests(updatedList);
  };

  const request = importRequests.find(r => r.id === id) || INITIAL_IMPORTS[0];
  const [activeTab, setActiveTab] = useState<'\uC6B4\uC1A1\uD604\uD669' | '\uC218\uC785\uB0B4\uC5ED' | '\uC11C\uB958' | '\uC815\uC0B0'>('\uC218\uC785\uB0B4\uC5ED'); // 운송현황 | 수입내역 | 서류 | 정산
  const [uploading, setUploading] = useState<string | null>(null);

  const [documents, setDocuments] = useState<{ [key: string]: { name: string; url: string } }>(() => {
    const saved = localStorage.getItem(`import_docs_${id}`);
    return saved ? JSON.parse(saved) : {
      bizReg: { name: 'bizReg_YSACC.pdf', url: '#' }
    };
  });

  const handleFileUpload = async (key: 'ciPl' | 'bizReg' | 'co' | 'etc' | 'customerPi' | 'freightInvoice', file: File) => {
    if (!file) return;
    try {
      setUploading(key);
      const storageRef = ref(storage, `imports/${id}/documents/${key}/${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      if (key === 'customerPi' || key === 'freightInvoice') {
        const fileProp = key === 'customerPi' ? 'customerPiFile' : 'freightInvoiceFile';
        const updatedList = importRequests.map(r => {
          if (r.id === id) {
            return {
              ...r,
              [fileProp]: { name: file.name, url: downloadUrl, path: snapshot.ref.fullPath }
            };
          }
          return r;
        });
        saveToStorage(updatedList);
      } else {
        const nextDocs = {
          ...documents,
          [key]: { name: file.name, url: downloadUrl }
        };
        setDocuments(nextDocs);
        localStorage.setItem(`import_docs_${id}`, JSON.stringify(nextDocs));
      }
      alert(`${file.name} \uC5C5\uB85C\uB4DC\uAC00 \uC644\uB8CC\uB418\uC5C8\uC5B5\uB2C8\uB2E4.`);
    } catch (e) {
      console.error(e);
      alert('\uC5C5\uB85C\uB4DC \uC2E4\uD328');
    } finally {
      setUploading(null);
    }
  };

  const handleFileDelete = (key: 'ciPl' | 'bizReg' | 'co' | 'etc' | 'customerPi' | 'freightInvoice') => {
    if (window.confirm('\uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?')) {
      if (key === 'customerPi' || key === 'freightInvoice') {
        const fileProp = key === 'customerPi' ? 'customerPiFile' : 'freightInvoiceFile';
        const updatedList = importRequests.map(r => {
          if (r.id === id) {
            return {
              ...r,
              [fileProp]: null
            };
          }
          return r;
        });
        saveToStorage(updatedList);
      } else {
        const nextDocs = { ...documents };
        delete nextDocs[key as any];
        setDocuments(nextDocs);
        localStorage.setItem(`import_docs_${id}`, JSON.stringify(nextDocs));
      }
    }
  };

  return (
    <div style={{ padding: '24px', background: '#f8fafc', minHeight: 'calc(100vh - 64px)', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Back button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button 
          onClick={() => navigate('/imports')}
          style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14.5px' }}
        >
          &larr; \uBAA9\uB85D\uC73C\uB85C \uB3CC\uC544\uAC00\uAE30
        </button>
        <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
          \uC694\uCCAD \uC0DD\uC2C1\uC77C: <span style={{ color: '#0f172a' }}>{request.createdAt}</span>
        </div>
      </div>

      {/* Main Card */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '24px', padding: '20px' }}>
        
        {/* Top Info Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>id: {request.id}</h2>
          <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '11.5px', fontWeight: 700, color: '#d97706', background: '#fef3c7' }}>
            {request.status}
          </span>
          <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
            BL(AWB): <strong style={{ color: '#1e293b' }}>{request.blAwb}</strong> | PO: <strong style={{ color: '#1e293b' }}>{request.poNumber}</strong>
          </span>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '24px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px' }}>
          {([
            { key: '\uC6B4\uC1A1\uD604\uD669', label: '\uC6B4\uC1A1\uD604\uD669' }, // 운송현황
            { key: '\uC218\uC785\uB0B4\uC5ED', label: '\uC218\uC785\uB0B4\uC5ED' }, // 수입내역
            { key: '\uC11C\uB958', label: '\uC11C\uB958' }, // 서류
            { key: '\uC815\uC0B0', label: '\uC815\uC0B0' } // 정산
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 4px',
                border: 'none',
                background: 'none',
                fontSize: '14.5px',
                fontWeight: activeTab === tab.key ? 800 : 600,
                color: activeTab === tab.key ? '#2563eb' : '#64748b',
                borderBottom: activeTab === tab.key ? '3px solid #2563eb' : '3px solid transparent',
                cursor: 'pointer',
                marginBottom: '-2px',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        {activeTab === '\uC6B4\uC1A1\uD604\uD669' && (
          <div style={{ padding: '20px 0' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 700 }}>\uC6B4\uC1A1 \uD2B8\uB798\uD0B9 \uC815\uCB74</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderLeft: '2px solid #cbd5e1', paddingLeft: '20px', marginLeft: '10px' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#2563eb', fontSize: '14px' }}>\uC9C5\uD589 \uACB0\uC815 \uC694\uCCAD</div>
                <div style={{ fontSize: '12.5px', color: '#64748b' }}>\uC218\uC785 \uC694\uCCAD\uC774 \uC811\uC218\uB418\uC5B4 \uC9C5\uD589\uC744 \uAC80\uD1A0 \uC913\uC785\uB2C8\uB2E4.</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === '\uC218\uC785\uB0B4\uC5ED' && (
          <div>
            {/* Section 1: 기본 정보 및 운송 개요 */}
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid #cbd5e1', paddingBottom: '6px', marginBottom: '14px' }}>\uC218\uC785 \uAE30\uBC38 \uC815\uBCF4 \uBC0F \uC6B4\uC1A1 \uAC1C\uC694</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>\uC218\uC785\uC9C0\uCCB4</span>
                    <strong style={{ color: '#0f172a' }}>{request.importCompany || 'YSACC'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>\uC218\uC785\uCC28 (\uACF5\uAE09\uC5C5\uCCB4)</span>
                    <strong style={{ color: '#1e293b' }}>{request.importerName || request.shipperName || '-'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>\uCD5C\uC9C5 \uACE0\uAC1D\uC0AC</span>
                    <strong style={{ color: '#0f172a' }}>{request.finalCustomer || '-'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>INCOTERMS / \uACB0\uC81C \uBC29\uC2DD</span>
                    <strong style={{ color: '#334155' }}>{request.incoterms || 'FOB'} / {request.paymentTerms || '100% T/T in advance'}</strong>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>\uC6B4\uC1A1\uC218\uB2E8</span>
                    <strong style={{ color: '#2563eb' }}>{request.transportType}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>\uCD9C\uBC1C PORT (POL)</span>
                    <strong style={{ color: '#334155' }}>{request.pol || request.portOfLoading || '-'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>\uB3C5\uCC29 PORT (POD)</span>
                    <strong style={{ color: '#334155' }}>{request.pod || request.portOfDischarge || '-'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>\uCD1D \uC6B4\uC1A1 \uBB3C\uB3D9\uB7C9 / \uCD1D\uC911\uB7C9</span>
                    <strong style={{ color: '#0f766e' }}>{request.volume} / {request.weight}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: 수입 제품 및 패킹 명세 실데이터 테이블 */}
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid #cbd5e1', paddingBottom: '6px', marginBottom: '14px' }}>\uC218\uC785 \uC81C\uD488 \uBC0F \uD328\uD0B9 \uBA85\uC138 \uB9AC\uC2A4\uD2B8</h3>
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', height: '34px' }}>
                      <th style={{ padding: '8px 12px', width: '40px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>No</th>
                      <th style={{ padding: '8px 12px', fontWeight: 700, color: '#475569' }}>DESCRIPTION OF COMMODITY</th>
                      <th style={{ padding: '8px 12px', width: '110px', fontWeight: 700, color: '#475569' }}>HS CODE</th>
                      <th style={{ padding: '8px 12px', width: '90px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>QTY</th>
                      <th style={{ padding: '8px 12px', width: '70px', textAlign: 'center', fontWeight: 700, color: '#475569' }}>UNIT</th>
                      <th style={{ padding: '8px 12px', width: '100px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>U.PRICE</th>
                      <th style={{ padding: '8px 12px', width: '120px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>TOTAL AMOUNT</th>
                      <th style={{ padding: '8px 12px', width: '120px', fontWeight: 700, color: '#475569' }}>PALLET SIZE</th>
                      <th style={{ padding: '8px 12px', width: '80px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>CBM</th>
                      <th style={{ padding: '8px 12px', width: '100px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>N.WT (KG)</th>
                      <th style={{ padding: '8px 12px', width: '100px', textAlign: 'right', fontWeight: 700, color: '#475569' }}>G.WT (KG)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(request.piItems && request.piItems.length > 0) ? (
                      request.piItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', height: '36px' }}>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold', color: '#64748b' }}>{idx + 1}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>{item.name}</td>
                          <td style={{ padding: '8px 12px', color: '#475569' }}>{item.hsCode || '-'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1e3a8a' }}>{(Number(item.qty) || 0).toLocaleString()}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: '#475569' }}>{item.unit || 'EA'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>${(Number(item.unitPrice) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#0f766e' }}>${((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '8px 12px', color: '#475569' }}>{item.palletSize || '-'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#b45309' }}>{(Number(item.cbm) || 0).toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{(Number(item.netWeight) || 0).toLocaleString()}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{(Number(item.grossWeight) || 0).toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>\uB4F1\uB85D\uB41C \uC81C\uD488 \uBA85\uC138\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</td>
                      </tr>
                    )}
                    
                    {/* 합계 요약행 */}
                    {request.piItems && request.piItems.length > 0 && (
                      <tr style={{ background: '#f8fafc', fontWeight: 'bold', borderTop: '2px solid #cbd5e1', height: '36px' }}>
                        <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'center', color: '#334155' }}>\uD569\uACC4 (Total Summary)</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#1e3a8a' }}>
                          {request.piItems.reduce((sum, it) => sum + (Number(it.qty) || 0), 0).toLocaleString()}
                        </td>
                        <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'right', color: '#0f766e' }}>
                          ${request.piItems.reduce((sum, it) => sum + ((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b' }}>NOS of PLT/PKG</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#b45309' }}>
                          {request.piItems.reduce((sum, it) => sum + (Number(it.cbm) || 0), 0).toFixed(2)} CBM
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155' }}>
                          {request.piItems.reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0).toLocaleString()} kg
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155' }}>
                          {request.piItems.reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0).toLocaleString()} kg
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === '\uC11C\uB958' && (
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '6px', marginBottom: '14px' }}>\uC11C\uB958 \uC5C5\uB85C\uB4DC \uBC0F \uAD00\uB9AC</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155', marginBottom: '12px' }}>\uD544\uC218 \uCCA8\uBDB0 \uC11C\uB958</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>C/I &amp; P/L</label>
                    {documents.ciPl ? (
                      <div style={{ border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.ciPl.url, documents.ciPl.name)}>
                          {documents.ciPl.name}
                        </span>
                        <button onClick={() => handleFileDelete('ciPl')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>\uC0AD\uC81C</button>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '14px', borderRadius: '6px', textAlign: 'center', fontSize: '12.5px', color: '#64748b', background: '#fff' }}>
                        {uploading === 'ciPl' ? '...' : '\uD0B4\uB9AD\uD558\uC5EC \uD30C\uC77C \uCCA8\uBDB0'}
                        <input type="file" onChange={e => e.target.files?.[0] && handleFileUpload('ciPl', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === '\uC815\uC0B0' && (
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '6px', marginBottom: '14px' }}>\uC815\uC0B0 \uB0B4\uC5ED</h3>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <div style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>\uD655\uC815 \uACAC\uC801 \uAE08\uC561</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f766e', marginTop: '4px' }}>
                ₩{request.amount.toLocaleString()}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
export default ImportDetail;
