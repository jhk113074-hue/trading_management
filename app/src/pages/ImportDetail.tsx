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
    portOfLoading: '위해항 | Weihai port (CNWEI)',
    portOfDischarge: '인천항 | Incheon port (KRINC)',
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
    dangerousCargo: '위험물 ✖ 미포함',
    msdsStatus: 'MSDS ✖ 미포함',
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
  const [activeTab, setActiveTab] = useState<'운송현황' | '의뢰내역' | '서류' | '정산'>('의뢰내역');
  const [uploading, setUploading] = useState<string | null>(null);

  const [documents, setDocuments] = useState<{ [key: string]: { name: string; url: string } }>(() => {
    const saved = localStorage.getItem(`import_docs_${id}`);
    return saved ? JSON.parse(saved) : {
      bizReg: { name: '사업자등록증_(주)YSACC.pdf', url: '#' }
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
        // Save to import request details
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
      alert('파일 업로드에 실패했습니다.');
    } finally {
      setUploading(null);
    }
  };

  const handleFileDelete = (key: 'ciPl' | 'bizReg' | 'co' | 'etc' | 'customerPi' | 'freightInvoice') => {
    if (window.confirm('첨부된 파일을 삭제하시겠습니까?')) {
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
      
      {/* Back button and quick header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button 
          onClick={() => navigate('/imports')}
          style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14.5px' }}
        >
          ➔ 목록으로 돌아가기
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
            BL(AWB): <strong style={{ color: '#1e293b' }}>{request.blAwb}</strong> | PO번호: <strong style={{ color: '#1e293b' }}>{request.poNumber}</strong>
          </span>
        </div>

        {/* Warning Indicator Row */}
        <div style={{ background: '#fdf2f8', border: '1px solid #fbcfe8', borderRadius: '8px', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{ color: '#db2777', fontWeight: 700, fontSize: '13.5px' }}>수출자 정보를 입력하세요. ➔</span>
          <button style={{ padding: '6px 12px', background: '#db2777', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            수출자 정보 입력
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '24px', borderBottom: '2px solid #e2e8f0', marginBottom: '24px' }}>
          {(['운송현황', '의뢰내역', '서류', '정산'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 4px',
                border: 'none',
                background: 'none',
                fontSize: '14.5px',
                fontWeight: activeTab === tab ? 800 : 600,
                color: activeTab === tab ? '#2563eb' : '#64748b',
                borderBottom: activeTab === tab ? '3px solid #2563eb' : '3px solid transparent',
                cursor: 'pointer',
                marginBottom: '-2px',
                transition: 'all 0.2s'
              }}
            >
              {tab}
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
                <div style={{ fontSize: '12.5px', color: '#64748b' }}>수입 의뢰가 접수되어 진행 타당성을 검토 중입니다.</div>
              </div>
              <div style={{ color: '#94a3b8' }}>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>수출자 정보 입력 대기</div>
                <div style={{ fontSize: '12.5px' }}>수출자(화물정보) 세부 스펙을 준비 중입니다.</div>
              </div>
              <div style={{ color: '#94a3b8' }}>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>통관 및 적재</div>
                <div style={{ fontSize: '12.5px' }}>선박 적재 전 서류 심사 단계입니다.</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === '의뢰내역' && (
          <div>
            {/* Section 1: 구간 정보 */}
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '6px', marginBottom: '14px' }}>구간 정보</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>출발지</div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>🇨🇳 창고: {request.shipperName || 'Shanghai warehouse (CNWEI)'}</div>
                    <div style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>⚓ 출발지: {request.portOfLoading || '위해항 | Weihai port (CNWEI)'}</div>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>도착지</div>
                  <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>⚓ 도착지: {request.portOfDischarge || '인천항 | Incheon port (KRINC)'}</div>
                    <div style={{ fontSize: '13px', color: '#334155', fontWeight: 600 }}>🇰🇷 최종 목적지: 경남 창녕군 장마면 전곡남지선로 131 (신구리) 삼익HDS(주) 제2공장</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: 수출자/화물정보 */}
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '6px', marginBottom: '14px' }}>수출자/화물정보</h3>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>🏢</span>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700 }}>업체명: {request.shipperName || 'Shanghai Logistics Co.'}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>📞 {request.shipperPhone || '-'} | ✉ {request.shipperEmail || '-'}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', color: '#0369a1', background: '#e0f2fe', padding: '4px 8px', borderRadius: '4px', fontWeight: 700 }}>
                    총 물동량: {request.volume}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', background: '#fff', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>포장수량</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>{request.packingQty || 4}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>포장타입</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>{request.packingUnit || 'BOXES'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>가로*세로*높이</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>{request.dimensions || '125*40*40(CM)'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>포장당 중량</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '4px' }}>{request.weight || '18.5KG'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>화물 특성</div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#e11d48', marginTop: '4px' }}>⚠️ {request.dangerousCargo || '미포함'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: 확인사항 */}
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '6px', marginBottom: '14px' }}>확인사항</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '8px' }}>비용 관련 사항</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b' }}>LSS 납부</span>
                    <strong style={{ color: '#334155' }}>{request.lssIncluded || '포함'}</strong>
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '8px' }}>내륙 운송</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#64748b' }}>도착지 운송방식</span>
                    <strong style={{ color: '#334155' }}>{request.localTransportType || '독차'}</strong>
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '8px' }}>부가서비스</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>지정관세사</span>
                      <strong style={{ color: '#2563eb' }}>{request.customsAgent || '이음관세사무소'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>적하보험 가입</span>
                      <strong style={{ color: '#64748b' }}>{request.cargoInsurance || '미신청'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>FTA 원산지대행</span>
                      <strong style={{ color: '#64748b' }}>{request.ftaOriginCert || '미신청'}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: 수입 품목 및 운송 견적서 (PI / 쉽다명세서) */}
            <div style={{ marginTop: '28px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '6px', marginBottom: '14px' }}>
                📂 수입 품목 및 운송 견적서 (PI / 쉽다명세서)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* 1. Proforma Invoice (PI) & 구매 아이템 정보 */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>📄 고객사 발송 Proforma Invoice (PI)</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>PDF 필수 유첨</span>
                  </div>

                  {/* PDF 업로드/보기 영역 */}
                  <div style={{ background: '#fff', border: '1px dashed #cbd5e1', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                    {request.customerPiFile ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span 
                          onClick={() => previewFile(request.customerPiFile!.url, request.customerPiFile!.name)} 
                          style={{ fontSize: '12.5px', fontWeight: 600, color: '#2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          📎 {request.customerPiFile.name} (미리보기)
                        </span>
                        <button 
                          onClick={() => handleFileDelete('customerPi')} 
                          style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}
                        >
                          삭제
                        </button>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', cursor: 'pointer', fontSize: '12.5px', color: '#64748b', padding: '8px 0' }}>
                        {uploading === 'customerPi' ? '⏳ 업로드 중...' : '📁 클릭하여 PI PDF 파일 첨부'}
                        <input 
                          type="file" 
                          accept=".pdf" 
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleFileUpload('customerPi', e.target.files[0]);
                            }
                          }}
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} 
                        />
                      </div>
                    )}
                  </div>

                  {/* PI 세부 기입 항목 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#475569', width: '90px', fontWeight: 600 }}>구매 품명</span>
                      <input 
                        type="text" 
                        value={request.piItemName || ''} 
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = importRequests.map(r => r.id === id ? { ...r, piItemName: val } : r);
                          saveToStorage(updated);
                        }}
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none' }}
                        placeholder="예: E-GLASS SURFACE TISSUE"
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#475569', width: '90px', fontWeight: 600 }}>수량 / 단위</span>
                      <input 
                        type="text" 
                        value={request.piItemQty || ''} 
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = importRequests.map(r => r.id === id ? { ...r, piItemQty: val } : r);
                          saveToStorage(updated);
                        }}
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none' }}
                        placeholder="예: 20000(㎡)"
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#475569', width: '90px', fontWeight: 600 }}>FOB 단가</span>
                      <input 
                        type="text" 
                        value={request.piItemUnitPrice || ''} 
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = importRequests.map(r => r.id === id ? { ...r, piItemUnitPrice: val } : r);
                          saveToStorage(updated);
                        }}
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none' }}
                        placeholder="예: $0.157"
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#475569', width: '90px', fontWeight: 600 }}>총 구매금액</span>
                      <input 
                        type="text" 
                        value={request.piItemAmount || ''} 
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = importRequests.map(r => r.id === id ? { ...r, piItemAmount: val } : r);
                          saveToStorage(updated);
                        }}
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none' }}
                        placeholder="예: US$3,140.00"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. 운송비 견적 받은 내역 (쉽다 거래명세서 등) */}
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#b45309', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>📊 운송 대행 견적서 및 거래명세서</span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>PDF 필수 유첨</span>
                  </div>

                  {/* PDF 업로드/보기 영역 */}
                  <div style={{ background: '#fff', border: '1px dashed #cbd5e1', padding: '12px', borderRadius: '6px', textAlign: 'center' }}>
                    {request.freightInvoiceFile ? (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span 
                          onClick={() => previewFile(request.freightInvoiceFile!.url, request.freightInvoiceFile!.name)} 
                          style={{ fontSize: '12.5px', fontWeight: 600, color: '#2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          📎 {request.freightInvoiceFile.name} (미리보기)
                        </span>
                        <button 
                          onClick={() => handleFileDelete('freightInvoice')} 
                          style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}
                        >
                          삭제
                        </button>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', cursor: 'pointer', fontSize: '12.5px', color: '#64748b', padding: '8px 0' }}>
                        {uploading === 'freightInvoice' ? '⏳ 업로드 중...' : '📁 클릭하여 운송비 명세 PDF 파일 첨부'}
                        <input 
                          type="file" 
                          accept=".pdf" 
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleFileUpload('freightInvoice', e.target.files[0]);
                            }
                          }}
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} 
                        />
                      </div>
                    )}
                  </div>

                  {/* 쉽다 등 운송 메타 기입 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#475569', width: '90px', fontWeight: 600 }}>의뢰/송장번호</span>
                      <input 
                        type="text" 
                        value={request.id || ''} 
                        disabled
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#f1f5f9', color: '#64748b' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#475569', width: '90px', fontWeight: 600 }}>청구 운임총액</span>
                      <input 
                        type="text" 
                        value={request.freightInvoiceAmount || ''} 
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = importRequests.map(r => r.id === id ? { ...r, freightInvoiceAmount: val } : r);
                          saveToStorage(updated);
                        }}
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none' }}
                        placeholder="예: ₩720,049"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === '서류' && (
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '6px', marginBottom: '14px' }}>유첨 서류 업로드 및 관리</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              {/* 필수 첨부 */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155', marginBottom: '12px' }}>필수 첨부 서류</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  
                  {/* CI / PL */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>C/I & P/L</label>
                    {documents.ciPl ? (
                      <div style={{ border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.ciPl.url, documents.ciPl.name)}>
                          📄 {documents.ciPl.name} (🔍 미리보기)
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleFileDelete('ciPl')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕ 삭제</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '14px', borderRadius: '6px', textAlign: 'center', fontSize: '12.5px', color: '#64748b', background: '#fff', cursor: 'pointer' }}>
                        {uploading === 'ciPl' ? '⏳ 업로드 중...' : '📁 클릭하여 C/I & P/L 파일 업로드'}
                        <input
                          type="file"
                          disabled={uploading !== null}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload('ciPl', file);
                          }}
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                        />
                      </div>
                    )}
                  </div>

                  {/* 사업자등록증 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>사업자등록증 *</label>
                    {documents.bizReg ? (
                      <div style={{ border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.bizReg.url, documents.bizReg.name)}>
                          📄 {documents.bizReg.name} (🔍 미리보기)
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleFileDelete('bizReg')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕ 삭제</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '14px', borderRadius: '6px', textAlign: 'center', fontSize: '12.5px', color: '#64748b', background: '#fff', cursor: 'pointer' }}>
                        {uploading === 'bizReg' ? '⏳ 업로드 중...' : '📁 클릭하여 사업자등록증 파일 업로드'}
                        <input
                          type="file"
                          disabled={uploading !== null}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload('bizReg', file);
                          }}
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                        />
                      </div>
                    )}
                  </div>

                </div>
              </div>

              {/* 선택 첨부 */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#334155', marginBottom: '12px' }}>선택 첨부 서류</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  
                  {/* CO 원산지증명서 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>CO (원산지증명서)</label>
                    {documents.co ? (
                      <div style={{ border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.co.url, documents.co.name)}>
                          📄 {documents.co.name} (🔍 미리보기)
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleFileDelete('co')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕ 삭제</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '14px', borderRadius: '6px', textAlign: 'center', fontSize: '12.5px', color: '#64748b', background: '#fff', cursor: 'pointer' }}>
                        {uploading === 'co' ? '⏳ 업로드 중...' : '📁 클릭하여 CO 파일 업로드'}
                        <input
                          type="file"
                          disabled={uploading !== null}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload('co', file);
                          }}
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                        />
                      </div>
                    )}
                  </div>

                  {/* 기타 서류 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>기타 서류</label>
                    {documents.etc ? (
                      <div style={{ border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '6px', fontSize: '13px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.etc.url, documents.etc.name)}>
                          📄 {documents.etc.name} (🔍 미리보기)
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleFileDelete('etc')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕ 삭제</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '14px', borderRadius: '6px', textAlign: 'center', fontSize: '12.5px', color: '#64748b', background: '#fff', cursor: 'pointer' }}>
                        {uploading === 'etc' ? '⏳ 업로드 중...' : '📁 클릭하여 기타 서류 파일 업로드'}
                        <input
                          type="file"
                          disabled={uploading !== null}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload('etc', file);
                          }}
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                        />
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>

            {/* 관련 기관 발급 문서 */}
            <div style={{ background: '#f1f5f9', padding: '16px', borderRadius: '8px' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#475569', marginBottom: '10px' }}>관련 기관 발급 문서</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>수입신고필증</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444', marginTop: '4px' }}>미발급</div>
                </div>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>수입세금계산서</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444', marginTop: '4px' }}>미발행</div>
                </div>
                <div style={{ background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>BL(AWB) 원본</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444', marginTop: '4px' }}>미발행</div>
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === '정산' && (
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', borderBottom: '2px solid #f1f5f9', paddingBottom: '6px', marginBottom: '14px' }}>정산 및 견적 내역</h3>
            
            {/* 견적 정보 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>확정 견적 금액</div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f766e', marginTop: '4px' }}>
                  ₩{request.amount.toLocaleString()}
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>제출 견적서 파일</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, marginTop: '4px' }}>견적서_Fiberglass.pdf</div>
                </div>
                <button style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
                  📥 다운로드
                </button>
              </div>
            </div>

            {/* 정산 테이블 */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', height: '36px', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>번호</th>
                    <th style={{ padding: '8px 12px' }}>거래명세서</th>
                    <th style={{ padding: '8px 12px' }}>적용환율</th>
                    <th style={{ padding: '8px 12px' }}>청구금액</th>
                    <th style={{ padding: '8px 12px' }}>입금금액</th>
                    <th style={{ padding: '8px 12px' }}>입금여부</th>
                    <th style={{ padding: '8px 12px' }}>세금계산서</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ height: '40px', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>1</td>
                    <td style={{ padding: '8px 12px' }}>미발행</td>
                    <td style={{ padding: '8px 12px' }}>-</td>
                    <td style={{ padding: '8px 12px' }}>-</td>
                    <td style={{ padding: '8px 12px' }}>-</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ background: '#fee2e2', color: '#ef4444', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                        임금 미완료
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px' }}>미발행</td>
                  </tr>
                </tbody>
              </table>
            </div>

          </div>
        )}

      </div>

    </div>
  );
};
