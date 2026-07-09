import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ImportRequest } from '../types';
import { storage, db, COMPANY_ID } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { previewFile } from '../components/FilePreviewModal';

import ysaccLetterImg from '../assets/ysacc_letterhead.png';
import ysAccLetterImg from '../assets/ys_acc_letterhead.png';
import ysaccStampImg from '../assets/ysacc_stamp.png';

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
  
  const [importRequests, setImportRequests] = useState<ImportRequest[]>([]);

  useEffect(() => {
    const importsRef = collection(doc(db, 'companies', COMPANY_ID), 'imports');
    const unsubscribe = onSnapshot(importsRef, (snap) => {
      if (snap.empty) {
        setImportRequests([]);
      } else {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ImportRequest));
        setImportRequests(list);
      }
    }, (error) => {
      console.error('Failed to sync imports from Firestore:', error);
    });
    return () => unsubscribe();
  }, []);

  const saveToStorage = (updatedList: ImportRequest[]) => {
    setImportRequests(updatedList); // 낙관적 업데이트 (Firestore onSnapshot이 곧 확정값으로 재동기화)
    const updatedRecord = updatedList.find(r => r.id === id);
    if (updatedRecord) {
      const { id: recId, ...rest } = updatedRecord;
      setDoc(doc(db, 'companies', COMPANY_ID, 'imports', recId), rest, { merge: true }).catch(err => {
        console.error('Failed to save import doc:', err);
      });
    }
  };

  const request = importRequests.find(r => r.id === id) || INITIAL_IMPORTS[0];
  const currentLetterhead: 'YSACC' | '영성ACC' = (request.importCompany === 'YSACC' || request.importCompany === 'YS') ? 'YSACC' : '영성ACC';
  const [activeTab, setActiveTab] = useState<'수입요청' | '견적/원가' | '수입내역' | '운송사/관세사 선정' | '서류' | '정산' | '손익검토' | '로그'>('수입요청');
  const [commonShippingMark, setCommonShippingMark] = useState(() => {
    return {
      shape: (request as any).commonShippingMark?.shape || 'diamond',
      company: (request as any).commonShippingMark?.company || (request.importCompany === 'YS' || request.importCompany === 'YSACC' ? 'YSACC' : 'YS ACC'),
      port: (request as any).commonShippingMark?.port || request.pod || 'INCHEON',
      country: (request as any).commonShippingMark?.country || 'KOREA',
      origin: (request as any).commonShippingMark?.origin || request.origin || 'MADE IN CHINA'
    };
  });
  const [showPoModal, setShowPoModal] = useState<boolean>(false);
  const [showForwarderModal, setShowForwarderModal] = useState<boolean>(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [forwarders, setForwarders] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'companies', 'YSACC', 'suppliers'), (snapshot) => {
      const list = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as any))
        .filter(supplier => supplier.category === '포워딩사');
      setForwarders(list);
    }, (error) => {
      console.error("Failed to sync suppliers/forwarders in ImportDetail:", error);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (request && request.id === id) {
      if (request.customerDecision === '승인') {
        setActiveTab('수입내역');
      } else {
        setActiveTab('수입요청');
      }
    }
  }, [request?.id, request?.customerDecision, id]);

  const handleDownloadPdf = () => {
    const element = document.getElementById('po-print-area');
    if (!element) return alert('PDF 다운로드 대상을 찾을 수 없습니다.');

    const runHtml2Pdf = () => {
      const opt = {
        margin:       [10, 10, 10, 10],
        filename:     `PO_${id}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      (window as any).html2pdf().from(element).set(opt).save();
    };

    if (!(window as any).html2pdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = () => {
        runHtml2Pdf();
      };
      document.body.appendChild(script);
    } else {
      runHtml2Pdf();
    }
  };

  const [documents, setDocuments] = useState<{ [key: string]: { name: string; url: string } }>({
    bizReg: { name: 'bizReg_YSACC.pdf', url: '#' }
  });

  // Firestore에서 불러온 request.documents 로 동기화 (구 localStorage 이관 완료 후 단일 소스로 사용)
  useEffect(() => {
    const docs = (request as any)?.documents;
    if (docs) setDocuments(docs);
  }, [request?.id, JSON.stringify((request as any)?.documents)]);

  const handleFileUpload = async (key: 'ciPl' | 'bizReg' | 'co' | 'etc' | 'customerPi' | 'freightInvoice' | 'inspect' | 'customsPermit' | 'taxInvoice' | 'blAwbDoc', file: File) => {
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
        const updatedList = importRequests.map(r => r.id === id ? ({ ...r, documents: nextDocs } as ImportRequest) : r);
        saveToStorage(updatedList);
      }
      alert(`${file.name} 업로드가 완료되었습니다.`);
    } catch (e) {
      console.error(e);
      alert('업로드 실패');
    } finally {
      setUploading(null);
    }
  };

  const handleFileDelete = (key: 'ciPl' | 'bizReg' | 'co' | 'etc' | 'customerPi' | 'freightInvoice' | 'inspect' | 'customsPermit' | 'taxInvoice' | 'blAwbDoc') => {
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
        const updatedList = importRequests.map(r => r.id === id ? ({ ...r, documents: nextDocs } as ImportRequest) : r);
        saveToStorage(updatedList);
      }
    }
  };

  const totalQty = (request.piItems || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  const totalAmount = (request.piItems || []).reduce((sum, it) => sum + ((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)), 0);
  const totalCbm = (request.piItems || []).reduce((sum, it) => sum + (Number(it.cbm) || 0), 0);
  const totalNetWt = (request.piItems || []).reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0);
  const totalGrossWt = (request.piItems || []).reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0);

  const formatDateToEnglish = (dateStr?: string) => {
    if (!dateStr) return 'July 8, 2026';
    const clean = dateStr.replace(/[\s\.]+/g, '-').replace(/-+/g, '-');
    const parts = clean.split('-');
    let year = 2026;
    let month = 7;
    let day = 8;
    if (parts.length >= 3) {
      const p0 = Number(parts[0]);
      const p1 = Number(parts[1]);
      const p2 = Number(parts[2]);
      if (!isNaN(p0) && p0 > 100) year = p0;
      else if (!isNaN(p0) && p0 < 100) year = 2000 + p0; // 2자리 년도 예외처리 (ex: 26.07.08)
      if (!isNaN(p1)) month = p1;
      if (!isNaN(p2)) day = p2;
    }
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = months[month - 1] || 'July';
    return `${monthName} ${day}, ${year}`;
  };

  const letterheadInfo = currentLetterhead === 'YSACC' ? {
    company: 'YSACC CO.,LTD.',
    address: '201-1Ho, 1251, Garosu-ro, Heungdeok-gu, Cheongju-si, Chungcheongbuk-do 28420, South Korea',
    tel: '+82-10-7361-1130',
    fax: '+82-30-3444-1130',
    extra: 'Web: www.ysacc.co.kr'
  } : {
    company: 'YS ACC',
    address: '110-1204, 24, Guryongsan-ro, Seowon-gu, Cheongju-si, ChungBuk 28611, KOREA',
    tel: '+82-70-4141-2927',
    fax: '+82-30-3444-1130',
    extra: 'E-mail: jhkim1130@ysacc.co.kr'
  };

  return (
    <div style={{ padding: '24px', background: '#f8fafc', minHeight: 'calc(100vh - 64px)', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Back button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14.5px' }}
        >
          &larr; 목록으로 돌아가기
        </button>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
          의뢰 생성일: <span style={{ color: '#0f172a' }}>{request.createdAt}</span>
        </div>
      </div>

      {/* Main Card */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '24px', padding: '20px' }}>
        
        {/* Top Info Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a' }}>id: {request.id}</h2>
          <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '11.5px', fontWeight: 700, color: '#d97706', background: '#fef3c7' }}>
            {request.status}
          </span>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
            BL(AWB): <strong style={{ color: 'var(--text-primary)' }}>{request.blAwb}</strong> | PO: <strong style={{ color: 'var(--text-primary)' }}>{request.poNumber}</strong>
          </span>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '24px', borderBottom: '2px solid var(--border-color)', marginBottom: '24px' }}>
          {([
            { key: '수입요청', label: '① 수입요청' },
            { key: '견적/원가', label: '② 견적/원가' },
            { key: '수입내역', label: '③ 발주/매입' },
            { key: '운송사/관세사 선정', label: '④ 물류/통관' },
            { key: '서류', label: '서류' },
            { key: '정산', label: '⑤ 정산/완료' },
            { key: '손익검토', label: '⑥ 손익검토' },
            { key: '로그', label: '로그' }
          ] as const)
          .filter(tab => {
            const isApproved = request.customerDecision === '승인';
            if (isApproved) {
              return tab.key !== '수입요청' && tab.key !== '견적/원가';
            } else {
              return tab.key === '수입요청' || tab.key === '견적/원가';
            }
          })
          .map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '10px 4px',
                border: 'none',
                background: 'none',
                fontSize: '14.5px',
                fontWeight: activeTab === tab.key ? 800 : 600,
                color: activeTab === tab.key ? '#2563eb' : 'var(--text-secondary)',
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
        {activeTab === '수입요청' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '20px' }}>
              📥 ① 수입요청 접수 정보
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>요청 접수일</label>
                  <input
                    type="date"
                    value={request.requestDate || ''}
                    onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, requestDate: e.target.value } : r))}
                    style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>고객사 담당자</label>
                  <input
                    type="text"
                    value={request.requestedBy || ''}
                    onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, requestedBy: e.target.value } : r))}
                    style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                    placeholder="예: 홍길동 과장"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>최종 고객사</label>
                  <input
                    type="text"
                    value={request.finalCustomer || ''}
                    onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, finalCustomer: e.target.value } : r))}
                    style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>요청 상세 내용</label>
                <textarea
                  value={request.requestNote || ''}
                  onChange={(e) => saveToStorage(importRequests.map(r => r.id === id ? { ...r, requestNote: e.target.value } : r))}
                  rows={7}
                  placeholder="고객사로부터 접수한 수입요청 내용을 입력하세요."
                  style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
            </div>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '14px 16px', fontSize: '12.5px', color: '#1e40af' }}>
              💡 요청 접수 후 <strong>② 견적/원가</strong> 탭에서 해외공급사 견적을 취합하고 고객사 견적/마진을 산정하세요. 고객이 진행을 결정하면 <strong>③ 발주/매입</strong> 탭에서 PO를 발행합니다.
            </div>
          </div>
        )}

        {activeTab === '견적/원가' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '20px' }}>
              💵 ② 해외공급사 견적 및 고객 원가/마진 산정
            </h3>

            {/* 공급사 견적 리스트 */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>해외공급사 견적 비교</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextQuotes = [...(request.supplierQuotes || []), { id: `q${Date.now()}`, supplierName: '', amount: 0, currency: 'USD', quoteDate: new Date().toISOString().slice(0, 10) }];
                    saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: nextQuotes } : r));
                  }}
                  style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  + 견적 추가
                </button>
              </div>
              <div style={{ border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)', height: '34px' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>공급사명</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>품목</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', width: '140px' }}>견적금액</th>
                      <th style={{ padding: '8px 12px', width: '90px' }}>통화</th>
                      <th style={{ padding: '8px 12px', width: '130px' }}>견적일</th>
                      <th style={{ padding: '8px 12px', width: '60px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(request.supplierQuotes && request.supplierQuotes.length > 0) ? request.supplierQuotes.map((q, idx) => (
                      <tr key={q.id} style={{ borderBottom: '1px solid var(--border-color)', height: '38px' }}>
                        <td style={{ padding: '4px 8px' }}>
                          <input type="text" value={q.supplierName} onChange={(e) => {
                            const next = [...(request.supplierQuotes || [])];
                            next[idx] = { ...next[idx], supplierName: e.target.value };
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: next } : r));
                          }} style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }} />
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input type="text" value={q.itemName || ''} onChange={(e) => {
                            const next = [...(request.supplierQuotes || [])];
                            next[idx] = { ...next[idx], itemName: e.target.value };
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: next } : r));
                          }} style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }} />
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input type="number" value={q.amount || ''} onChange={(e) => {
                            const next = [...(request.supplierQuotes || [])];
                            next[idx] = { ...next[idx], amount: Number(e.target.value) || 0 };
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: next } : r));
                          }} style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12.5px', outline: 'none', textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <select value={q.currency || 'USD'} onChange={(e) => {
                            const next = [...(request.supplierQuotes || [])];
                            next[idx] = { ...next[idx], currency: e.target.value };
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: next } : r));
                          }} style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }}>
                            <option value="USD">USD</option>
                            <option value="CNY">CNY</option>
                            <option value="KRW">KRW</option>
                          </select>
                        </td>
                        <td style={{ padding: '4px 8px' }}>
                          <input type="date" value={q.quoteDate || ''} onChange={(e) => {
                            const next = [...(request.supplierQuotes || [])];
                            next[idx] = { ...next[idx], quoteDate: e.target.value };
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: next } : r));
                          }} style={{ width: '100%', padding: '5px 6px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }} />
                        </td>
                        <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                          <button type="button" onClick={() => {
                            const next = (request.supplierQuotes || []).filter((_, i) => i !== idx);
                            saveToStorage(importRequests.map(r => r.id === id ? { ...r, supplierQuotes: next } : r));
                          }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>등록된 공급사 견적이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 원가 / 마진 / 고객견적 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px' }}>수입원가 산정 (KRW)</span>
                {([
                  ['productCost', '제품 원가'],
                  ['freightCost', '예상 운임'],
                  ['customsCost', '예상 관세/통관비'],
                  ['otherCost', '기타 비용']
                ] as const).map(([key, label]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</label>
                    <input type="number" value={(request.costBreakdown as any)?.[key] || ''} onChange={(e) => {
                      const nextBreakdown = { ...(request.costBreakdown || {}), [key]: Number(e.target.value) || 0 };
                      saveToStorage(importRequests.map(r => r.id === id ? { ...r, costBreakdown: nextBreakdown } : r));
                    }} style={{ width: '140px', padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', textAlign: 'right' }} />
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-default)', paddingTop: '8px', marginTop: '4px' }}>
                  <strong style={{ fontSize: '13px' }}>수입원가 합계</strong>
                  <strong style={{ fontSize: '13px', color: '#0f766e' }}>
                    {(((request.costBreakdown?.productCost || 0) + (request.costBreakdown?.freightCost || 0) + (request.costBreakdown?.customsCost || 0) + (request.costBreakdown?.otherCost || 0))).toLocaleString()} 원
                  </strong>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px' }}>마진 및 고객 견적</span>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>마진율 (%)</label>
                  <input type="number" value={request.marginRate ?? ''} onChange={(e) => {
                    const rate = Number(e.target.value) || 0;
                    const totalCost = (request.costBreakdown?.productCost || 0) + (request.costBreakdown?.freightCost || 0) + (request.costBreakdown?.customsCost || 0) + (request.costBreakdown?.otherCost || 0);
                    const marginAmount = Math.round(totalCost * (rate / 100));
                    saveToStorage(importRequests.map(r => r.id === id ? { ...r, marginRate: rate, marginAmount, customerQuoteAmount: totalCost + marginAmount } : r));
                  }} style={{ width: '140px', padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', textAlign: 'right' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>마진 금액 (₩)</label>
                  <strong style={{ fontSize: '13px', color: '#b45309' }}>{(request.marginAmount || 0).toLocaleString()} 원</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-default)', paddingTop: '8px', marginTop: '4px' }}>
                  <strong style={{ fontSize: '13px' }}>고객 제시 견적금액</strong>
                  <strong style={{ fontSize: '14px', color: '#1e3a8a' }}>{(request.customerQuoteAmount || 0).toLocaleString()} 원</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>고객사 진행 결정</label>
                  <select value={request.customerDecision || '검토중'} onChange={(e) => {
                    const val = e.target.value as any;
                    saveToStorage(importRequests.map(r => r.id === id ? { ...r, customerDecision: val, customerDecisionDate: new Date().toISOString().slice(0, 10) } : r));
                  }} style={{ padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', background: '#fff' }}>
                    <option value="검토중">검토중</option>
                    <option value="승인">승인 (진행 결정)</option>
                    <option value="보류">보류</option>
                    <option value="거절">거절</option>
                  </select>
                  {request.customerDecisionDate && (
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>결정일: {request.customerDecisionDate}</span>
                  )}
                </div>
              </div>
            </div>

            {request.customerDecision === '승인' && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '14px 16px', fontSize: '12.5px', color: '#166534' }}>
                ✅ 고객사가 진행을 승인했습니다. <strong>③ 발주/매입</strong> 탭에서 공급사에 PO를 발행하세요.
              </div>
            )}
          </div>
        )}

        {activeTab === '수입내역' && (
          <div>
            {/* Section 1: 기본 정보 */}
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '14px' }}>수입 기본 정보 및 운송 개요</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>수입주체</span>
                    <strong style={{ color: '#0f172a' }}>{request.importCompany || 'YSACC'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>수입처 (공급업체)</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{request.importerName || request.shipperName || '-'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>최종 고객사</span>
                    <strong style={{ color: '#0f172a' }}>{request.finalCustomer || '-'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>INCOTERMS / 결제 방식</span>
                    <strong style={{ color: '#334155' }}>{request.incoterms || 'FOB'} / {request.paymentTerms || '100% T/T in advance'}</strong>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>운송수단</span>
                    <strong style={{ color: '#2563eb' }}>{request.transportType}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>출발 PORT (POL)</span>
                    <strong style={{ color: '#334155' }}>{request.pol || request.portOfLoading || '-'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>도착 PORT (POD)</span>
                    <strong style={{ color: '#334155' }}>{request.pod || request.portOfDischarge || '-'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>총 운송 물동량 / 총중량</span>
                    <strong style={{ color: '#0f766e' }}>{request.volume} / {request.weight}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: 품목 명세 */}
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '14px' }}>수입 제품 및 패킹 명세 리스트</h3>
              <div style={{ border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)', height: '34px' }}>
                      <th style={{ padding: '8px 12px', width: '40px', textAlign: 'center' }}>No</th>
                      <th style={{ padding: '8px 12px' }}>DESCRIPTION OF COMMODITY</th>
                      <th style={{ padding: '8px 12px', width: '110px' }}>HS CODE</th>
                      <th style={{ padding: '8px 12px', width: '90px', textAlign: 'right' }}>QTY</th>
                      <th style={{ padding: '8px 12px', width: '70px', textAlign: 'center' }}>UNIT</th>
                      <th style={{ padding: '8px 12px', width: '100px', textAlign: 'right' }}>U.PRICE</th>
                      <th style={{ padding: '8px 12px', width: '120px', textAlign: 'right' }}>TOTAL AMOUNT</th>
                      <th style={{ padding: '8px 12px', width: '120px' }}>PALLET SIZE</th>
                      <th style={{ padding: '8px 12px', width: '80px', textAlign: 'right' }}>CBM</th>
                      <th style={{ padding: '8px 12px', width: '100px', textAlign: 'right' }}>N.WT (KG)</th>
                      <th style={{ padding: '8px 12px', width: '100px', textAlign: 'right' }}>G.WT (KG)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(request.piItems && request.piItems.length > 0) ? (
                      request.piItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', height: '36px' }}>
                          <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{item.name}</td>
                          <td style={{ padding: '8px 12px' }}>{item.hsCode || '-'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{(Number(item.qty) || 0).toLocaleString()}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>{item.unit || 'EA'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>${(Number(item.unitPrice) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>${((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td style={{ padding: '8px 12px' }}>{item.palletSize || '-'}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{(Number(item.cbm) || 0).toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{(Number(item.netWeight) || 0).toLocaleString()}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{(Number(item.grossWeight) || 0).toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={11} style={{ padding: '24px', textAlign: 'center' }}>등록된 제품 명세가 없습니다.</td>
                      </tr>
                    )}
                    
                    {request.piItems && request.piItems.length > 0 && (
                      <tr style={{ background: '#f8fafc', fontWeight: 'bold', borderTop: '2px solid var(--border-default)', height: '36px' }}>
                        <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'center' }}>합계 (Total Summary)</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#1e3a8a' }}>{totalQty.toLocaleString()}</td>
                        <td colSpan={3} style={{ padding: '8px 12px', textAlign: 'right', color: '#0f766e' }}>${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>NOS of PLT/PKG</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#b45309' }}>{totalCbm.toFixed(2)} CBM</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{totalNetWt.toLocaleString()} kg</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{totalGrossWt.toLocaleString()} kg</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* PO 생성 컨트롤 세션 */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-default)', marginTop: '24px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 800, color: '#1e3a8a' }}>📋 발주서 (PO) 생성 추가 세부설정</h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '300px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>결제 방식 (Payment Terms)</label>
                  <input
                    type="text"
                    value={request.paymentTerms || '100% T/T in advance'}
                    onChange={(e) => {
                      const val = e.target.value;
                      const updated = importRequests.map(r => r.id === id ? { ...r, paymentTerms: val } : r);
                      saveToStorage(updated);
                    }}
                    style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                  />
                </div>
              </div>

              {/* 공통 쉬핑마크 설정 (주문관리 차용) */}
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <strong style={{ fontSize: '13px', color: '#0a1e3f', display: 'block', marginBottom: '10px' }}>⚙️ 공통 쉬핑마크 설정 (Common Shipping Mark Setup)</strong>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>도형 선택</label>
                    <select
                      value={commonShippingMark.shape}
                      onChange={(e) => {
                        const next = { ...commonShippingMark, shape: e.target.value };
                        setCommonShippingMark(next);
                        const updated = importRequests.map(r => r.id === id ? { ...r, commonShippingMark: next } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }}
                    >
                      <option value="diamond">◇ 다이아몬드</option>
                      <option value="none">없음 (None)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>회사/고객 약자</label>
                    <input
                      type="text"
                      value={commonShippingMark.company}
                      onChange={(e) => {
                        const next = { ...commonShippingMark, company: e.target.value };
                        setCommonShippingMark(next);
                        const updated = importRequests.map(r => r.id === id ? { ...r, commonShippingMark: next } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>도착 포트</label>
                    <input
                      type="text"
                      value={commonShippingMark.port}
                      onChange={(e) => {
                        const next = { ...commonShippingMark, port: e.target.value };
                        setCommonShippingMark(next);
                        const updated = importRequests.map(r => r.id === id ? { ...r, commonShippingMark: next } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>도착 국가</label>
                    <input
                      type="text"
                      value={commonShippingMark.country}
                      onChange={(e) => {
                        const next = { ...commonShippingMark, country: e.target.value };
                        setCommonShippingMark(next);
                        const updated = importRequests.map(r => r.id === id ? { ...r, commonShippingMark: next } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>원산지</label>
                    <input
                      type="text"
                      value={commonShippingMark.origin}
                      onChange={(e) => {
                        const next = { ...commonShippingMark, origin: e.target.value };
                        setCommonShippingMark(next);
                        const updated = importRequests.map(r => r.id === id ? { ...r, commonShippingMark: next } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
                    />
                  </div>
                </div>

                {/* 실시간 미리보기 */}
                <div style={{ background: '#fff', border: '1px dashed var(--border-default)', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 700 }}>🔍 실시간 쉬핑마크 미리보기 (Live Preview)</div>
                  <div style={{ border: '1px solid var(--border-color)', padding: '12px', minWidth: '180px', background: '#fafafa', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {commonShippingMark.shape === 'diamond' ? (
                      <div style={{ position: 'relative', width: '90px', height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px 0' }}>
                        <svg viewBox="0 0 100 60" style={{ position: 'absolute', width: '100%', height: '100%' }}>
                          <polygon points="50,2 98,30 50,58 2,30" fill="none" stroke="#334155" strokeWidth="2" />
                        </svg>
                        <span style={{ position: 'relative', fontWeight: 800, fontSize: '12px', color: 'var(--text-primary)', zIndex: 2 }}>{commonShippingMark.company}</span>
                      </div>
                    ) : (
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{commonShippingMark.company}</strong>
                    )}
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '6px', fontWeight: 600, lineHeight: '1.4' }}>
                      {commonShippingMark.port}, {commonShippingMark.country}<br/>
                      PO NO : {request.poNumber || request.id}<br/>
                      {commonShippingMark.origin}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              <button
                onClick={() => setShowPoModal(true)}
                style={{ padding: '8px 16px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                미리보기 및 인쇄
              </button>
              <button
                onClick={() => {
                  const printWin = window.open('', '_blank');
                  if (!printWin) return alert('팝업 차단기를 해제해주세요.');
                  
                  const itemsHtml = (request.piItems || []).map((item, idx) => `
                    <tr style="border-bottom: 1px solid var(--border-default); height: 32px;">
                      <td style="text-align: center; border: 1px solid var(--border-default);">${idx + 1}</td>
                      <td style="border: 1px solid var(--border-default); padding-left: 8px;">${item.name}</td>
                      <td style="text-align: center; border: 1px solid var(--border-default);">${item.hsCode || '-'}</td>
                      <td style="text-align: right; border: 1px solid var(--border-default); padding-right: 8px;">${(Number(item.qty) || 0).toLocaleString()}</td>
                      <td style="text-align: center; border: 1px solid var(--border-default);">${item.unit || 'EA'}</td>
                      <td style="text-align: right; border: 1px solid var(--border-default); padding-right: 8px;">$${(Number(item.unitPrice) || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      <td style="text-align: right; border: 1px solid var(--border-default); padding-right: 8px;">$${((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    </tr>
                  `).join('');

                  printWin.document.write(`
                    <html>
                    <head>
                      <title>Purchase Order - ${request.id}</title>
                      <style>
                        body { font-family: 'Arial', sans-serif; padding: 40px; color: var(--text-primary); line-height: 1.4; }
                        .header { display: flex; justify-content: space-between; border-bottom: 3px double #1e3a8a; padding-bottom: 10px; margin-bottom: 24px; }
                        .po-title { font-size: 28px; font-weight: bold; color: #1e3a8a; }
                        .meta-table, .item-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
                        .item-table th { background: #f1f5f9; font-weight: bold; border: 1px solid var(--border-default); padding: 8px; }
                        .packing-section { background: #f8fafc; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 24px; font-size: 13px; }
                        .signature-section { display: flex; justify-content: space-between; margin-top: 60px; }
                        .signature-box { border-top: 1px solid var(--text-muted); width: 220px; text-align: center; padding-top: 8px; font-size: 13px; font-weight: bold; }
                      </style>
                    </head>
                    <body>
                      <div style="margin-bottom: 24px;">
                        <img 
                          src="${currentLetterhead === 'YSACC' ? ysaccLetterImg : ysAccLetterImg}" 
                          alt="Letterhead" 
                          style="width: 100%; max-height: 120px; object-fit: contain; display: block; margin-bottom: 16px;"
                        />
                        <div style="display: flex; justify-content: flex-end; border-bottom: 2px solid #0a1e3f; padding-bottom: 8px;">
                          <div style="text-align: right; font-size: 13px; min-width: 180px;">
                            <div style="font-size: 16px; font-weight: 800; color: #b91c1c; margin-bottom: 2px;">PURCHASE ORDER</div>
                            <div><strong>PO NO:</strong> ${request.poNumber || request.id}</div>
                            ${request.piNumber ? `<div><strong>PI NO:</strong> ${request.piNumber}</div>` : ''}
                            <div><strong>Date:</strong> ${formatDateToEnglish(request.createdAt)}</div>
                          </div>
                        </div>
                      </div>

                      <table class="meta-table">
                        <tr>
                          <td style="width: 50%; vertical-align: top; padding-right: 20px;">
                            <div style="background: #f8fafc; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px;">
                              <strong style="color: #0a1e3f;">BUYER</strong><br/>
                              Company: ${letterheadInfo.company}<br/>
                              Address: ${letterheadInfo.address}
                            </div>
                          </td>
                          <td style="width: 50%; vertical-align: top;">
                            <div style="background: #f8fafc; padding: 12px; border: 1px solid var(--border-color); border-radius: 6px;">
                              <strong style="color: #0a1e3f;">SELLER</strong><br/>
                              Company: ${request.importerName || request.shipperName || 'Global Supplier Ltd.'}<br/>
                              Origin: ${request.origin || 'CHINA'}<br/>
                              Incoterms: ${request.incoterms || 'FOB'}<br/>
                              Payment Terms: ${request.paymentTerms || '100% T/T in advance'}
                            </div>
                          </td>
                        </tr>
                      </table>

                      <div class="packing-section" style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div style="flex: 1;">
                          <strong style="color: #0a1e3f;">[ SHIPPING &amp; PACKING INFORMATION ]</strong><br/>
                          <div style="display: grid; grid-template-columns: 1fr; gap: 4px; margin-top: 6px;">
                            <div>- Shipment By: ${request.transportType || 'By Sea'}</div>
                            <div>- Port of Loading (POL): ${request.pol || request.portOfLoading || '-'}</div>
                            <div>- Port of Discharge (POD): ${request.pod || request.portOfDischarge || '-'}</div>
                          </div>
                        </div>
                        <div style="border-left: 1px solid var(--border-default); padding-left: 20px; margin-left: 20px; min-width: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                          <strong style="color: #0a1e3f; font-size: 11px; margin-bottom: 6px; display: block; align-self: flex-start;">SHIPPING MARK</strong>
                          <div style="border: 1px solid var(--border-default); padding: 10px; background: #fff; text-align: center; display: flex; flex-direction: column; alignItems: center; width: 140px;">
                            ${getShippingMarkShapeImgHtml(commonShippingMark.shape, commonShippingMark.company)}
                            <div style="font-size: 9.5px; color: #334155; margin-top: 4px; font-weight: bold; line-height: 1.3;">
                              ${commonShippingMark.port}, ${commonShippingMark.country}<br/>
                              PO NO : ${request.poNumber || request.id}<br/>
                              ${commonShippingMark.origin}
                            </div>
                          </div>
                        </div>
                      </div>

                      <table class="item-table">
                        <thead>
                          <tr>
                            <th style="width: 40px;">No</th>
                            <th>Description</th>
                            <th style="width: 100px;">HS Code</th>
                            <th style="width: 80px;">Qty</th>
                            <th style="width: 60px;">Unit</th>
                            <th style="width: 100px;">U.Price</th>
                            <th style="width: 120px;">Total Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${itemsHtml}
                          <tr style="font-weight: bold; background: #f8fafc; height: 36px;">
                            <td colspan="3" style="text-align: center; border: 1px solid var(--border-default);">TOTAL SUMMARY</td>
                            <td style="text-align: right; border: 1px solid var(--border-default); padding-right: 8px;">${totalQty.toLocaleString()}</td>
                            <td style="border: 1px solid var(--border-default);"></td>
                            <td style="border: 1px solid var(--border-default);"></td>
                            <td style="text-align: right; border: 1px solid var(--border-default); padding-right: 8px;">$${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          </tr>
                        </tbody>
                      </table>

                      <div class="signature-section" style="position: relative; margin-top: 100px;">
                        <div class="signature-box">For Seller</div>
                        <div class="signature-box" style="position: relative;">
                          <img 
                            src="${ysaccStampImg}" 
                            alt="Stamp" 
                            style="position: absolute; left: 50%; transform: translateX(-50%); top: -65px; width: 145px; height: auto; object-fit: contain; pointer-events: none;"
                          />
                          For Buyer
                        </div>
                      </div>

                      <script>
                        window.onload = function() { window.print(); }
                      </script>
                    </body>
                    </html>
                  `);
                  printWin.document.close();
                }}
                style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                PO 즉시 인쇄
              </button>
            </div>
          </div>
        )}

        {activeTab === '운송사/관세사 선정' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '14px' }}>
              🚢 운송사 및 통관 관세사 선정 관리
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px' }}>
                  Forwarder (지정 운송사)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>운송사 이름</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input 
                        type="text"
                        readOnly
                        placeholder="지정 운송사(포워더)를 검색해주세요."
                        value={request.forwarderName || ''}
                        style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', background: '#f1f5f9' }}
                      />
                      <button 
                        onClick={() => setShowForwarderModal(true)}
                        style={{ padding: '6px 12px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                      >
                        🔍 검색/신규등록
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>운송 요율(₩)</label>
                    <input 
                      type="text"
                      placeholder="예: 720,000"
                      value={request.freightInvoiceAmount || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = importRequests.map(r => r.id === id ? { ...r, freightInvoiceAmount: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px' }}>
                  Customs Agent (통관 관세사)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>관세사사무소 이름</label>
                    <select
                      value={request.customsAgent || '이음관세사무소'}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = importRequests.map(r => r.id === id ? { ...r, customsAgent: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', background: '#fff' }}
                    >
                      <option value="이음관세사무소">이음관세사무소</option>
                      <option value="세인관세법인">세인관세법인</option>
                      <option value="신한관세법인">신한관세법인</option>
                      <option value="자체 지정관세사">자체 지정관세사</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>통관 의뢰 진행상태</label>
                    <select
                      value={request.dangerousCargo || '미의뢰'}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = importRequests.map(r => r.id === id ? { ...r, dangerousCargo: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', background: '#fff' }}
                    >
                      <option value="미의뢰">미의뢰</option>
                      <option value="서류 검토중">서류 검토중 (Pending Doc Review)</option>
                      <option value="수입신고진행">수입신고진행 (Customs Declaration)</option>
                      <option value="수입신고수리">수입신고수리 (Cleared)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => {
                  alert('운송사 및 관세사 정보가 성공적으로 반영되었습니다.');
                  setActiveTab('서류');
                }}
                style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                저장 후 다음단계로
              </button>
            </div>
          </div>
        )}

        {activeTab === '서류' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '16px' }}>
              📁 수입 서류 및 통관 서류 업로드 관리
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginBottom: '20px' }}>
              {/* 필수 첨부 (CI, PL, CO, BL, 수입면장) */}
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px', marginBottom: '4px' }}>
                  필수 첨부 (*)
                </div>

                {/* 1. CI & PL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    C/I &amp; P/L * {documents.ciPl && <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✅</span>}
                  </div>
                  {documents.ciPl ? (
                    <div style={{ border: '1px solid var(--border-default)', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.ciPl.url, documents.ciPl.name)}>
                        📄 {documents.ciPl.name} (미리보기)
                      </span>
                      <button onClick={() => handleFileDelete('ciPl')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕ 삭제</button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', border: '1px dashed var(--border-default)', padding: '20px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', background: '#fff', cursor: 'pointer' }}>
                      {uploading === 'ciPl' ? '⏳ 업로드 중...' : '📤 클릭 혹은 업로드할 파일 드래그'}
                      <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('ciPl', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                    </div>
                  )}
                </div>

                {/* 2. CO */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    CO * {documents.co && <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✅</span>}
                  </div>
                  {documents.co ? (
                    <div style={{ border: '1px solid var(--border-default)', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.co.url, documents.co.name)}>
                        📄 {documents.co.name}
                      </span>
                      <button onClick={() => handleFileDelete('co')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', border: '1px dashed var(--border-default)', padding: '20px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', background: '#fff', cursor: 'pointer' }}>
                      {uploading === 'co' ? '...' : '📤 클릭 혹은 파일 드래그'}
                      <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('co', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                    </div>
                  )}
                </div>

                {/* 3. BL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    BL(AWB) * {documents.blAwbDoc && <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✅</span>}
                  </div>
                  {documents.blAwbDoc ? (
                    <div style={{ border: '1px solid var(--border-default)', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.blAwbDoc.url, documents.blAwbDoc.name)}>
                        📄 {documents.blAwbDoc.name}
                      </span>
                      <button onClick={() => handleFileDelete('blAwbDoc')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', border: '1px dashed var(--border-default)', padding: '20px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', background: '#fff', cursor: 'pointer' }}>
                      {uploading === 'blAwbDoc' ? '...' : '📤 클릭 혹은 파일 드래그'}
                      <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('blAwbDoc', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                    <input 
                      type="text"
                      value={request.blAwb && request.blAwb !== '-' ? request.blAwb : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = importRequests.map(r => r.id === id ? { ...r, blAwb: val || '-' } : r);
                        saveToStorage(updated);
                      }}
                      placeholder="B/L 번호 직접 입력"
                      style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '12px', outline: 'none' }}
                    />
                  </div>
                </div>

                {/* 4. 수입신고필증 (수입면장) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    수입신고필증 (수입면장) * {documents.customsPermit && <span style={{ color: '#16a34a', fontWeight: 'bold' }}>✅</span>}
                  </div>
                  {documents.customsPermit ? (
                    <div style={{ border: '1px solid var(--border-default)', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.customsPermit.url, documents.customsPermit.name)}>
                        📄 {documents.customsPermit.name}
                      </span>
                      <button onClick={() => handleFileDelete('customsPermit')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', border: '1px dashed var(--border-default)', padding: '20px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', background: '#fff', cursor: 'pointer' }}>
                      {uploading === 'customsPermit' ? '...' : '📤 클릭 혹은 파일 드래그'}
                      <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('customsPermit', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                    </div>
                  )}
                </div>
              </div>

              {/* 선택 첨부 및 정산서류 영역 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px', marginBottom: '4px' }}>
                    선택 첨부
                  </div>

                  {/* 1. 인증/검역 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      인증/검역 {documents.inspect && <span style={{ color: '#16a34a' }}>✅</span>}
                    </div>
                    {documents.inspect ? (
                      <div style={{ border: '1px solid var(--border-default)', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.inspect.url, documents.inspect.name)}>
                          📄 {documents.inspect.name}
                        </span>
                        <button onClick={() => handleFileDelete('inspect')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', border: '1px dashed var(--border-default)', padding: '20px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', background: '#fff', cursor: 'pointer' }}>
                        {uploading === 'inspect' ? '...' : '📤 클릭 혹은 파일 드래그'}
                        <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('inspect', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                      </div>
                    )}
                  </div>

                  {/* 2. 기타 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      기타 {documents.etc && <span style={{ color: '#16a34a' }}>✅</span>}
                    </div>
                    {documents.etc ? (
                      <div style={{ border: '1px solid var(--border-default)', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.etc.url, documents.etc.name)}>
                          📄 {documents.etc.name}
                        </span>
                        <button onClick={() => handleFileDelete('etc')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕ 삭제</button>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', border: '1px dashed var(--border-default)', padding: '20px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', background: '#fff', cursor: 'pointer' }}>
                        {uploading === 'etc' ? '...' : '📤 클릭 혹은 파일 드래그'}
                        <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('etc', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                      </div>
                    )}
                  </div>
                </div>

                {/* 하단: 정산 관련 세금계산서 영역 */}
                <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    수입세금계산서 {documents.taxInvoice && <span style={{ color: '#16a34a' }}>✅</span>}
                  </div>
                  {documents.taxInvoice ? (
                    <div style={{ border: '1px solid var(--border-default)', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.taxInvoice.url, documents.taxInvoice.name)}>
                        📄 {documents.taxInvoice.name}
                      </span>
                      <button onClick={() => handleFileDelete('taxInvoice')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', border: '1px dashed var(--border-default)', padding: '16px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: 'var(--text-secondary)', background: '#fff', cursor: 'pointer' }}>
                      {uploading === 'taxInvoice' ? '...' : '📤 클릭 혹은 파일 드래그'}
                      <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('taxInvoice', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === '정산' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '20px' }}>
              💰 수입 관세 / 부가세 / 운임 정산 등록
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px', marginBottom: '14px' }}>
                  🧾 1. 수입세금계산서 (세관 발행분)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>공급가액 (금액, ₩)</label>
                    <input 
                      type="number"
                      value={request.taxAmount || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        const updated = importRequests.map(r => r.id === id ? { ...r, taxAmount: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                      placeholder="공급가액 입력"
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>부가세액 (세액, ₩)</label>
                    <input 
                      type="number"
                      value={request.taxVat || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        const updated = importRequests.map(r => r.id === id ? { ...r, taxVat: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                      placeholder="세액 입력"
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f766e' }}>총계 (합계금액, ₩)</label>
                    <input 
                      type="text"
                      readOnly
                      value={((Number(request.taxAmount) || 0) + (Number(request.taxVat) || 0)).toLocaleString() + ' 원'}
                      style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', background: '#f1f5f9', fontWeight: 'bold', color: '#0f766e' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px', marginBottom: '14px' }}>
                  🚚 2. 운임 (국내 내륙 운송 / 포워딩 청구분)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>운임 금액 (공급가, ₩)</label>
                    <input 
                      type="number"
                      value={request.freightAmount || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        const updated = importRequests.map(r => r.id === id ? { ...r, freightAmount: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                      placeholder="운임 금액 입력"
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>운임 세액 (부가세, ₩)</label>
                    <input 
                      type="number"
                      value={request.freightVat || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        const updated = importRequests.map(r => r.id === id ? { ...r, freightVat: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                      placeholder="운임 부가세 입력"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>거래명세표 및 세금계산서 유첨 파일</label>
                  {documents.freightDoc ? (
                    <div style={{ border: '1px solid var(--border-default)', padding: '10px 12px', borderRadius: '6px', fontSize: '13px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.freightDoc.url, documents.freightDoc.name)}>
                        📄 {documents.freightDoc.name}
                      </span>
                      <button onClick={() => handleFileDelete('freightDoc' as any)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕ 삭제</button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', border: '1px dashed var(--border-default)', padding: '24px 14px', borderRadius: '6px', textAlign: 'center', fontSize: '12.5px', color: 'var(--text-secondary)', background: '#fff', cursor: 'pointer' }}>
                      {uploading === 'freightDoc' ? '⏳ 업로드 중...' : '📤 클릭 혹은 업로드할 증빙 파일 드래그'}
                      <input 
                        type="file" 
                        disabled={uploading !== null} 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload('freightDoc' as any, file);
                        }} 
                        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} 
                      />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px', marginBottom: '14px' }}>
                  🏛️ 3. 관세 (Customs Duty)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '300px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>납부 관세액 (₩)</label>
                  <input 
                    type="number"
                    value={request.customsTaxAmount || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      const updated = importRequests.map(r => r.id === id ? { ...r, customsTaxAmount: val } : r);
                      saveToStorage(updated);
                    }}
                    style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                    placeholder="납부 관세 금액 입력"
                  />
                </div>
              </div>

              <div style={{ background: '#eff6ff', padding: '18px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e3a8a', display: 'block', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px', marginBottom: '14px' }}>
                  📑 4. ⑤ 고객사 정산 완료 (거래명세표 / 세금계산서 / 수금)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>거래명세표 발송일</label>
                    <input type="date" value={request.dealStatementSentDate || ''} onChange={(e) => {
                      const updated = importRequests.map(r => r.id === id ? { ...r, dealStatementSentDate: e.target.value } : r);
                      saveToStorage(updated);
                    }} style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>고객 확인일</label>
                    <input type="date" value={request.dealStatementConfirmedDate || ''} onChange={(e) => {
                      const updated = importRequests.map(r => r.id === id ? { ...r, dealStatementConfirmedDate: e.target.value } : r);
                      saveToStorage(updated);
                    }} style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>세금계산서 번호</label>
                    <input type="text" value={request.taxInvoiceNumber || ''} onChange={(e) => {
                      const updated = importRequests.map(r => r.id === id ? { ...r, taxInvoiceNumber: e.target.value } : r);
                      saveToStorage(updated);
                    }} style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }} placeholder="승인번호 입력" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>세금계산서 발행일</label>
                    <input type="date" value={request.taxInvoiceIssuedDate || ''} onChange={(e) => {
                      const updated = importRequests.map(r => r.id === id ? { ...r, taxInvoiceIssuedDate: e.target.value } : r);
                      saveToStorage(updated);
                    }} style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>대금 수령일</label>
                    <input type="date" value={request.paymentCollectedDate || ''} onChange={(e) => {
                      const updated = importRequests.map(r => r.id === id ? { ...r, paymentCollectedDate: e.target.value } : r);
                      saveToStorage(updated);
                    }} style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>수령 금액 (₩)</label>
                    <input type="number" value={request.paymentCollectedAmount || ''} onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      const updated = importRequests.map(r => r.id === id ? { ...r, paymentCollectedAmount: val } : r);
                      saveToStorage(updated);
                    }} style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', textAlign: 'right' }} placeholder="수령 금액 입력" />
                  </div>
                </div>

                {request.paymentCollectedDate && request.paymentCollectedAmount ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const updated = importRequests.map(r => r.id === id ? { ...r, status: '손익검토 대기' } : r);
                        saveToStorage(updated);
                        setActiveTab('손익검토');
                        alert('대금 수령이 확인되었습니다. 마지막으로 ⑥ 손익검토 탭에서 최종 검토를 완료해주세요.');
                      }}
                      style={{ padding: '8px 16px', background: request.status === '업무 종료' ? '#94a3b8' : '#166534', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: request.status === '업무 종료' ? 'default' : 'pointer' }}
                      disabled={request.status === '업무 종료'}
                    >
                      {request.status === '업무 종료' ? '✅ 업무 종료됨' : '✅ 대금 수령 확인 → 손익검토로 이동'}
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>대금 수령일과 수령 금액을 입력하면 다음 단계로 진행할 수 있습니다.</div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={() => {
                  alert('정산 입력 정보가 안전하게 저장되었습니다.');
                  navigate('/imports');
                }}
                style={{ padding: '10px 20px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13.5px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                저장 후 목록으로
              </button>
            </div>
          </div>
        )}

        {activeTab === '손익검토' && (() => {
          const plannedCost = (request.costBreakdown?.productCost || 0) + (request.costBreakdown?.freightCost || 0) + (request.costBreakdown?.customsCost || 0) + (request.costBreakdown?.otherCost || 0);
          const plannedMargin = request.marginAmount || 0;
          const plannedRevenue = request.customerQuoteAmount || 0;

          const actualPurchaseCost = request.amount || 0;
          const actualLogisticsCost = (request.freightAmount || 0) + (request.freightVat || 0);
          const actualCustomsCost = (request.taxAmount || 0) + (request.taxVat || 0) + (request.customsTaxAmount || 0);
          const actualTotalCost = actualPurchaseCost + actualLogisticsCost + actualCustomsCost;

          const actualRevenue = request.paymentCollectedAmount || plannedRevenue;
          const realizedMargin = actualRevenue - actualTotalCost;
          const realizedMarginRate = actualRevenue ? (realizedMargin / actualRevenue) * 100 : 0;
          const marginGap = realizedMargin - plannedMargin;

          return (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '20px' }}>
              📊 ⑥ 손익검토 (최종)
            </h3>

            <div style={{ border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)', height: '36px' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>구분</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', width: '160px' }}>② 계획 (견적단계)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', width: '160px' }}>실적 (③④⑤ 반영)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', width: '160px' }}>차이</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', height: '36px' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>매입원가 (제품+운임+통관 등)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{plannedCost.toLocaleString()} 원</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{actualTotalCost.toLocaleString()} 원</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: actualTotalCost > plannedCost ? '#dc2626' : '#166534', fontWeight: 700 }}>
                      {(actualTotalCost - plannedCost) >= 0 ? '+' : ''}{(actualTotalCost - plannedCost).toLocaleString()} 원
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', height: '36px' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>매출 (고객 청구/수금액)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{plannedRevenue.toLocaleString()} 원</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>{actualRevenue.toLocaleString()} 원</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: actualRevenue >= plannedRevenue ? '#166534' : '#dc2626', fontWeight: 700 }}>
                      {(actualRevenue - plannedRevenue) >= 0 ? '+' : ''}{(actualRevenue - plannedRevenue).toLocaleString()} 원
                    </td>
                  </tr>
                  <tr style={{ background: '#f8fafc', height: '40px', borderTop: '2px solid var(--border-default)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 800 }}>마진</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800 }}>{plannedMargin.toLocaleString()} 원 ({(request.marginRate || 0).toFixed(1)}%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>{realizedMargin.toLocaleString()} 원 ({realizedMarginRate.toFixed(1)}%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: marginGap >= 0 ? '#166534' : '#dc2626' }}>
                      {marginGap >= 0 ? '+' : ''}{marginGap.toLocaleString()} 원
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ background: marginGap >= 0 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${marginGap >= 0 ? '#bbf7d0' : '#fecaca'}`, borderRadius: '8px', padding: '14px 16px', fontSize: '12.5px', color: marginGap >= 0 ? '#166534' : '#991b1b', marginBottom: '20px' }}>
              {marginGap >= 0
                ? `✅ 계획 대비 마진이 ${marginGap.toLocaleString()}원 초과 달성되었습니다.`
                : `⚠️ 계획 대비 마진이 ${Math.abs(marginGap).toLocaleString()}원 부족합니다. 원인을 검토해주세요.`}
            </div>

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '6px' }}>검토 코멘트 및 완료 처리</span>
              <textarea
                value={request.profitReviewNote || ''}
                onChange={(e) => {
                  const updated = importRequests.map(r => r.id === id ? { ...r, profitReviewNote: e.target.value } : r);
                  saveToStorage(updated);
                }}
                rows={4}
                placeholder="마진 차이 원인, 향후 개선사항 등을 기록하세요."
                style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>검토자</label>
                  <input
                    type="text"
                    value={request.profitReviewedBy || ''}
                    onChange={(e) => {
                      const updated = importRequests.map(r => r.id === id ? { ...r, profitReviewedBy: e.target.value } : r);
                      saveToStorage(updated);
                    }}
                    style={{ padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                    placeholder="예: 김주한"
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>검토 완료일</label>
                  <input
                    type="text"
                    readOnly
                    value={request.profitReviewedDate || '-'}
                    style={{ padding: '7px 10px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '13px', background: '#f1f5f9' }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const updated = importRequests.map(r => r.id === id ? { ...r, profitReviewCompleted: true, profitReviewedDate: new Date().toISOString().slice(0, 10), status: '업무 종료' } : r);
                  saveToStorage(updated);
                  alert('손익검토가 완료 처리되었습니다. 모든 업무 단계가 종료되었습니다.');
                }}
                disabled={!!request.profitReviewCompleted}
                style={{ marginTop: '4px', padding: '10px 20px', background: request.profitReviewCompleted ? '#94a3b8' : '#1e3a8a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13.5px', fontWeight: 'bold', cursor: request.profitReviewCompleted ? 'default' : 'pointer', alignSelf: 'flex-start' }}
              >
                {request.profitReviewCompleted ? `✅ 검토 완료됨 (${request.profitReviewedDate})` : '✅ 손익검토 완료 처리'}
              </button>
            </div>
          </div>
          );
        })()}

        {activeTab === '로그' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid var(--border-default)', paddingBottom: '6px', marginBottom: '20px' }}>
              📜 업무 이력 및 진행 히스토리 로그
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', paddingLeft: '24px', borderLeft: '3px solid var(--border-color)', marginLeft: '12px' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-31.5px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#10b981', border: '3px solid #fff', boxShadow: '0 0 0 3px #d1fae5' }} />
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>{request.createdAt || '2026. 07. 03.'}</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>📥 수입 의뢰 등록 완료</div>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>수입 의뢰 번호: #{request.id} 건이 등록되었습니다. (작성 관리자: {request.manager || '김주한'})</div>
              </div>

              {request.piItems && request.piItems.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-31.5px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#2563eb', border: '3px solid #fff', boxShadow: '0 0 0 3px #dbeafe' }} />
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>{request.createdAt || '2026. 07. 03.'}</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>📦 제품 명세 최종 확정</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    총 {request.piItems.length}종 제품(총 {totalQty.toLocaleString()} EA)의 명세 정보가 저장되었습니다.
                  </div>
                </div>
              )}

              {request.paymentCollectedDate && (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-31.5px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#0f766e', border: '3px solid #fff', boxShadow: '0 0 0 3px #ccfbf1' }} />
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>{request.paymentCollectedDate}</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>💰 대금 수령 확인</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {(request.paymentCollectedAmount || 0).toLocaleString()}원 수령 완료. 손익검토 단계로 이동했습니다.
                  </div>
                </div>
              )}

              {request.profitReviewCompleted && (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-31.5px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#1e3a8a', border: '3px solid #fff', boxShadow: '0 0 0 3px #dbeafe' }} />
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>{request.profitReviewedDate}</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>📊 손익검토 완료 (최종 종료)</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    검토자: {request.profitReviewedBy || '-'}{request.profitReviewNote ? ` · ${request.profitReviewNote}` : ''}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* 모달리스 발주서 PO 미리보기 카드 */}
      {showPoModal && (
        <div style={{
          position: 'fixed',
          right: '24px',
          top: '80px',
          width: '680px',
          height: 'calc(100vh - 120px)',
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0px 10px 30px rgba(0, 0, 0, 0.2)',
          border: '1px solid var(--border-default)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{
            background: '#1e3a8a',
            padding: '12px 16px',
            color: '#fff',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <strong style={{ fontSize: '14px' }}>📄 PO 발주서 실시간 미리보기 (모달리스 창)</strong>
            <button 
              onClick={() => setShowPoModal(false)}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              &times;
            </button>
          </div>

          <div style={{ padding: '24px', overflowY: 'auto', flex: 1, fontSize: '12.5px', color: '#334155' }}>
            <div id="po-print-area" style={{ padding: '10px', background: '#fff', marginBottom: '20px' }}>
              <img 
                src={currentLetterhead === 'YSACC' ? ysaccLetterImg : ysAccLetterImg} 
                alt="Letterhead Preview" 
                style={{ width: '100%', maxHeight: '90px', objectFit: 'contain', display: 'block', marginBottom: '12px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', borderBottom: '2px solid #0a1e3f', paddingBottom: '6px' }}>
                <div style={{ textAlign: 'right', fontSize: '12px', minWidth: '160px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#b91c1c', marginBottom: '2px' }}>PURCHASE ORDER</div>
                  <div><strong>PO NO:</strong> {request.poNumber || request.id}</div>
                  {request.piNumber && <div><strong>PI NO:</strong> {request.piNumber}</div>}
                  <div><strong>Date:</strong> {formatDateToEnglish(request.createdAt)}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                <strong style={{ color: '#0a1e3f' }}>BUYER</strong>
                <div style={{ marginTop: '4px', fontSize: '11.5px', lineHeight: '1.5' }}>
                  Company: {letterheadInfo.company}<br/>
                  Address: {letterheadInfo.address}
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                <strong style={{ color: '#0a1e3f' }}>SELLER</strong>
                <div style={{ marginTop: '4px', fontSize: '11.5px', lineHeight: '1.5' }}>
                  Company: {request.importerName || request.shipperName || '-'}<br/>
                  Origin: {request.origin || 'CHINA'}<br/>
                  Incoterms: {request.incoterms || 'FOB'}<br/>
                  Payment Terms: {request.paymentTerms || '100% T/T in advance'}
                </div>
              </div>
            </div>

            <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '6px', marginBottom: '20px', border: '1px solid var(--border-default)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <strong style={{ color: '#0a1e3f' }}>[ SHIPPING &amp; PACKING INFORMATION ]</strong>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', marginTop: '6px', fontSize: '11.5px', lineHeight: '1.4' }}>
                  <div>- Shipment By: {request.transportType || 'By Sea'}</div>
                  <div>- Port of Loading (POL): {request.pol || request.portOfLoading || '-'}</div>
                  <div>- Port of Discharge (POD): {request.pod || request.portOfDischarge || '-'}</div>
                </div>
              </div>
              <div style={{ borderLeft: '1px solid var(--border-default)', paddingLeft: '16px', marginLeft: '16px', minWidth: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <strong style={{ color: '#0a1e3f', fontSize: '11px', marginBottom: '4px', display: 'block', alignSelf: 'flex-start' }}>SHIPPING MARK</strong>
                <div style={{ border: '1px solid var(--border-default)', padding: '8px', background: '#fff', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '110px' }}>
                  {commonShippingMark.shape === 'diamond' ? (
                    <div style={{ position: 'relative', width: '70px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px 0' }}>
                      <svg viewBox="0 0 100 60" style={{ position: 'absolute', width: '100%', height: '100%' }}>
                        <polygon points="50,2 98,30 50,58 2,30" fill="none" stroke="#334155" strokeWidth="2" />
                      </svg>
                      <span style={{ position: 'relative', fontWeight: 800, fontSize: '10.5px', color: 'var(--text-primary)', zIndex: 2 }}>{commonShippingMark.company}</span>
                    </div>
                  ) : (
                    <strong style={{ fontSize: '11px', color: 'var(--text-primary)' }}>{commonShippingMark.company}</strong>
                  )}
                  <div style={{ fontSize: '8.5px', color: '#334155', marginTop: '3px', fontWeight: 'bold', lineHeight: '1.2' }}>
                    {commonShippingMark.port}, {commonShippingMark.country}<br/>
                    PO NO : {request.poNumber || request.id}<br/>
                    {commonShippingMark.origin}
                  </div>
                </div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', marginBottom: '20px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid var(--border-default)', height: '28px' }}>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px' }}>No</th>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px' }}>Description of Commodity</th>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px' }}>HS Code</th>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px', textAlign: 'right' }}>Qty</th>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px', textAlign: 'center' }}>Unit</th>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px', textAlign: 'right' }}>U.Price</th>
                  <th style={{ border: '1px solid var(--border-default)', padding: '4px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(request.piItems || []).map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', height: '28px' }}>
                    <td style={{ border: '1px solid var(--border-default)', textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ border: '1px solid var(--border-default)', padding: '4px', fontWeight: 600 }}>{item.name}</td>
                    <td style={{ border: '1px solid var(--border-default)', textAlign: 'center' }}>{item.hsCode || '-'}</td>
                    <td style={{ border: '1px solid var(--border-default)', textAlign: 'right', padding: '4px' }}>{(Number(item.qty) || 0).toLocaleString()}</td>
                    <td style={{ border: '1px solid var(--border-default)', textAlign: 'center' }}>{item.unit || 'EA'}</td>
                    <td style={{ border: '1px solid var(--border-default)', textAlign: 'right', padding: '4px' }}>${(Number(item.unitPrice) || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td style={{ border: '1px solid var(--border-default)', textAlign: 'right', padding: '4px', fontWeight: 700 }}>${((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f8fafc', fontWeight: 'bold', height: '30px' }}>
                  <td colSpan={3} style={{ border: '1px solid var(--border-default)', textAlign: 'center' }}>TOTAL SUM</td>
                  <td style={{ border: '1px solid var(--border-default)', textAlign: 'right', padding: '4px', color: '#1e3a8a' }}>{totalQty.toLocaleString()}</td>
                  <td style={{ border: '1px solid var(--border-default)' }}></td>
                  <td style={{ border: '1px solid var(--border-default)' }}></td>
                  <td style={{ border: '1px solid var(--border-default)', textAlign: 'right', padding: '4px', color: '#0f766e' }}>
                    ${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '80px', paddingBottom: '20px' }}>
              <div style={{ borderTop: '1px solid var(--text-muted)', width: '160px', textAlign: 'center', paddingTop: '6px', fontSize: '11px', fontWeight: 'bold' }}>Seller Signature</div>
              <div style={{ borderTop: '1px solid var(--text-muted)', width: '160px', textAlign: 'center', paddingTop: '6px', fontSize: '11px', fontWeight: 'bold', position: 'relative' }}>
                <img 
                  src={ysaccStampImg} 
                  alt="Stamp" 
                  style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: '-55px', width: '135px', height: 'auto', objectFit: 'contain', pointerEvents: 'none' }}
                />
                Buyer Signature
              </div>
            </div>
          </div>

          <div style={{
            background: '#f1f5f9',
            padding: '12px 16px',
            borderTop: '1px solid var(--border-default)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px'
          }}>
            <button 
              onClick={() => setShowPoModal(false)}
              style={{ padding: '6px 12px', background: 'var(--text-muted)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}
            >
              닫기
            </button>
            <button 
              onClick={handleDownloadPdf}
              style={{ padding: '6px 12px', background: 'var(--focus-ring)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 'bold' }}
            >
              PDF 저장
            </button>
            <button 
              onClick={() => {
                const printBtn = document.querySelector('button[title*="PO 즉시 인쇄"]') as HTMLButtonElement;
                if (printBtn) {
                  printBtn.click();
                } else {
                  const triggers = document.getElementsByTagName('button');
                  for (let i = 0; i < triggers.length; i++) {
                    if (triggers[i].textContent?.includes('PO 즉시 인쇄')) {
                      triggers[i].click();
                      break;
                    }
                  }
                }
              }}
              style={{ padding: '6px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 'bold' }}
            >
              인쇄하기
            </button>
          </div>
        </div>
      )}
      <ForwarderSearchModal 
        isOpen={showForwarderModal}
        onClose={() => setShowForwarderModal(false)}
        onSelect={(name) => {
          const updated = importRequests.map(r => r.id === id ? { ...r, forwarderName: name } : r);
          saveToStorage(updated);
          setShowForwarderModal(false);
        }}
        forwarders={forwarders}
        onRefresh={() => {
          // No manual refresh needed since Firestore onSnapshot handles it
        }}
      />
    </div>
  );
};

// SVG Diamond shipping mark HTML string creator
const getShippingMarkShapeImgHtml = (shapeSymbol: string, comp: string) => {
  if (shapeSymbol === 'diamond') {
    return `
      <div style="position: relative; width: 100px; height: 60px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 100 60" style="position: absolute; left: 0; top: 0; width: 100%; height: 100%;">
          <polygon points="50,2 98,30 50,58 2,30" fill="none" stroke="#000" stroke-width="2" />
        </svg>
        <span style="position: relative; font-weight: bold; font-size: 13px; font-family: sans-serif; z-index: 2;">${comp}</span>
      </div>
    `;
  }
  return `<div style="text-align: center; font-weight: bold; font-size: 14px;">${comp}</div>`;
};

export default ImportDetail;

// 포워더 검색 및 신규 등록 모달 Sub창 컴포넌트
interface ForwarderSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (name: string) => void;
  forwarders: any[];
  onRefresh: () => void;
}

import { addDoc } from 'firebase/firestore';

const ForwarderSearchModal: React.FC<ForwarderSearchModalProps> = ({ isOpen, onClose, onSelect, forwarders, onRefresh }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForwarder, setNewForwarder] = useState({ name: '', manager: '', phone: '', email: '', note: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const filtered = forwarders.filter(f => f.name?.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleAddNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForwarder.name.trim()) {
      alert('업체명을 입력해주세요.');
      return;
    }
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'companies', 'YSACC', 'suppliers'), {
        ...newForwarder,
        category: '포워딩사',
        createdAt: new Date().toISOString()
      });
      alert('신규 포워더가 성공적으로 등록되었습니다.');
      setNewForwarder({ name: '', manager: '', phone: '', email: '', note: '' });
      setShowAddForm(false);
      onRefresh();
    } catch (err) {
      console.error(err);
      alert('등록 중 에러가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div style={{ background: '#fff', width: '100%', maxWidth: '500px', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f766e' }}>🚢 지정 포워더(운송사) 검색</h4>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '16px', cursor: 'pointer', color: 'var(--text-secondary)' }}>✕</button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            placeholder="포워더 이름으로 검색..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
          />
          <button 
            onClick={() => setShowAddForm(p => !p)}
            style={{ padding: '8px 12px', background: showAddForm ? 'var(--text-secondary)' : '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {showAddForm ? '목록 보기' : '➕ 신규 포워더 추가'}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {showAddForm ? (
            <form onSubmit={handleAddNew} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f766e', marginBottom: '4px' }}>📝 신규 포워더 등록 정보</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>포워더 업체명 (*)</label>
                <input required type="text" value={newForwarder.name} onChange={e => setNewForwarder(p => ({ ...p, name: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }} placeholder="예: (주)영성물류" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>담당자명</label>
                <input type="text" value={newForwarder.manager} onChange={e => setNewForwarder(p => ({ ...p, manager: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }} placeholder="예: 홍길동 과장" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>연락처</label>
                <input type="text" value={newForwarder.phone} onChange={e => setNewForwarder(p => ({ ...p, phone: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }} placeholder="예: 010-1234-5678" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>이메일</label>
                <input type="email" value={newForwarder.email} onChange={e => setNewForwarder(p => ({ ...p, email: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }} placeholder="예: cargo@logistics.com" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>비고 / 메모</label>
                <input type="text" value={newForwarder.note} onChange={e => setNewForwarder(p => ({ ...p, note: e.target.value }))} style={{ padding: '6px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12.5px', outline: 'none' }} placeholder="기타 특이사항 입력" />
              </div>
              <button disabled={isSubmitting} type="submit" style={{ padding: '8px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', marginTop: '6px' }}>
                {isSubmitting ? '등록 중...' : '저장 및 즉시 등록'}
              </button>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.length > 0 ? (
                filtered.map(f => (
                  <div 
                    key={f.id}
                    onClick={() => onSelect(f.name)}
                    style={{ padding: '12px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', transition: 'background 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '13.5px', color: 'var(--text-primary)' }}>{f.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {f.manager ? `담당자: ${f.manager}` : '담당자 없음'} {f.phone ? ` | ${f.phone}` : ''}
                      </div>
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#0f766e', fontWeight: 'bold' }}>선택</span>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)', fontSize: '12.5px' }}>
                  검색 조건에 맞는 포워더가 존재하지 않습니다.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
