import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ImportRequest } from '../types';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { previewFile } from '../components/FilePreviewModal';

const INITIAL_IMPORTS: ImportRequest[] = [
  {
    id: '189348',
    status: '진행 결정 요청',
    blAwb: '-',
    poNumber: '-',
    itemName: 'Fiberglass tissue',
    transportType: 'FCA | 해상LCL',
    volume: '0.8 R.TON',
    routeFrom: '중국 위해항',
    routeTo: '한국 내륙',
    manager: '김주한',
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
    dangerousCargo: '미포함',
    msdsStatus: '미포함',
    lssIncluded: '포함',
    localTransportType: '독차',
    customsAgent: '이음관세사무소',
    cargoInsurance: '미신청',
    ftaOriginCert: '미신청'
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
  const [activeTab, setActiveTab] = useState<'운송현황' | '수입내역' | '서류' | '정산'>('수입내역');
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
      alert(`${file.name} 업로드가 완료되었습니다.`);
    } catch (e) {
      console.error(e);
      alert('업로드 실패');
    } finally {
      setUploading(null);
    }
  };

  const handleFileDelete = (key: 'ciPl' | 'bizReg' | 'co' | 'etc' | 'customerPi' | 'freightInvoice') => {
    if (window.confirm('삭제하시겠습니까?')) {
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
          &larr; 목록으로 돌아가기
        </button>
        <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
          의뢰 생성일: <span style={{ color: '#0f172a' }}>{request.createdAt}</span>
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
            { key: '운송현황', label: '운송현황' },
            { key: '수입내역', label: '수입내역' },
            { key: '서류', label: '서류' },
            { key: '정산', label: '정산' }
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
        {activeTab === '운송현황' && (
          <div style={{ padding: '20px 0' }}>
            <h4 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 700 }}>운송 트래킹 정보</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderLeft: '2px solid #cbd5e1', paddingLeft: '20px', marginLeft: '10px' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#2563eb', fontSize: '14px' }}>진행 결정 요청</div>
                <div style={{ fontSize: '12.5px', color: '#64748b' }}>수입 요청이 접수되어 진행을 검토 중입니다.</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === '수입내역' && (
          <div>
            {/* Section 1: 기본 정보 및 운송 개요 */}
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid #cbd5e1', paddingBottom: '6px', marginBottom: '14px' }}>수입 기본 정보 및 운송 개요</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>수입주체</span>
                    <strong style={{ color: '#0f172a' }}>{request.importCompany || 'YSACC'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>수입처 (공급업체)</span>
                    <strong style={{ color: '#1e293b' }}>{request.importerName || request.shipperName || '-'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>최종 고객사</span>
                    <strong style={{ color: '#0f172a' }}>{request.finalCustomer || '-'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>INCOTERMS / 결제 방식</span>
                    <strong style={{ color: '#334155' }}>{request.incoterms || 'FOB'} / {request.paymentTerms || '100% T/T in advance'}</strong>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>운송수단</span>
                    <strong style={{ color: '#2563eb' }}>{request.transportType}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>출발 PORT (POL)</span>
                    <strong style={{ color: '#334155' }}>{request.pol || request.portOfLoading || '-'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>도착 PORT (POD)</span>
                    <strong style={{ color: '#334155' }}>{request.pod || request.portOfDischarge || '-'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>총 운송 물동량 / 총중량</span>
                    <strong style={{ color: '#0f766e' }}>{request.volume} / {request.weight}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: 수입 제품 및 패킹 명세 실데이터 테이블 */}
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid #cbd5e1', paddingBottom: '6px', marginBottom: '14px' }}>수입 제품 및 패킹 명세 리스트</h3>
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
                        <td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>등록된 제품 명세가 없습니다.</td>
                      </tr>
                    )}
                    
                    {/* 합계 요약행 */}
                    {request.piItems && request.piItems.length > 0 && (
                      <tr style={{ background: '#f8fafc', fontWeight: 'bold', borderTop: '2px solid #cbd5e1', height: '36px' }}>
                        <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'center', color: '#334155' }}>합계 (Total Summary)</td>
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

        {activeTab === '서류' && (
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '6px', marginBottom: '14px' }}>서류 업로드 및 관리</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155', marginBottom: '12px' }}>필수 첨부 서류</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>C/I &amp; P/L</label>
                    {documents.ciPl ? (
                      <div style={{ border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.ciPl.url, documents.ciPl.name)}>
                          {documents.ciPl.name}
                        </span>
                        <button onClick={() => handleFileDelete('ciPl')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>삭제</button>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '14px', borderRadius: '6px', textAlign: 'center', fontSize: '12.5px', color: '#64748b', background: '#fff' }}>
                        {uploading === 'ciPl' ? '...' : '클릭하여 파일 첨부'}
                        <input type="file" onChange={e => e.target.files?.[0] && handleFileUpload('ciPl', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === '정산' && (
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '6px', marginBottom: '14px' }}>정산 내역</h3>
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <div style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>확정 견적 금액</div>
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
