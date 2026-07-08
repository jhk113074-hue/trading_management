import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { ImportRequest } from '../types';
import { storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { previewFile } from '../components/FilePreviewModal';

import ysaccLetterImg from '../assets/ysacc_letterhead.png';
import ysAccLetterImg from '../assets/ys_acc_letterhead.png';

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
  const currentLetterhead: 'YSACC' | '영성ACC' = (request.importCompany === 'YSACC' || request.importCompany === 'YS') ? 'YSACC' : '영성ACC';
  const [activeTab, setActiveTab] = useState<'수입내역' | '운송사/관세사 선정' | '서류' | '정산' | '로그'>('수입내역');
  const [shippingMark, setShippingMark] = useState<string>(`${currentLetterhead}\nPO NO: ${id || ''}\nPORT: ${request.pod || 'INCHEON'}`);
  const [showPoModal, setShowPoModal] = useState<boolean>(false);
  const [uploading, setUploading] = useState<string | null>(null);

  const [documents, setDocuments] = useState<{ [key: string]: { name: string; url: string } }>(() => {
    const saved = localStorage.getItem(`import_docs_${id}`);
    return saved ? JSON.parse(saved) : {
      bizReg: { name: 'bizReg_YSACC.pdf', url: '#' }
    };
  });

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
        localStorage.setItem(`import_docs_${id}`, JSON.stringify(nextDocs));
      }
    }
  };

  const totalQty = (request.piItems || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
  const totalAmount = (request.piItems || []).reduce((sum, it) => sum + ((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)), 0);
  const totalCbm = (request.piItems || []).reduce((sum, it) => sum + (Number(it.cbm) || 0), 0);
  const totalNetWt = (request.piItems || []).reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0);
  const totalGrossWt = (request.piItems || []).reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0);

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
            { key: '수입내역', label: '수입내역' },
            { key: '운송사/관세사 선정', label: '운송사/관세사 선정' },
            { key: '서류', label: '서류' },
            { key: '정산', label: '정산' },
            { key: '로그', label: '로그' }
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
        {activeTab === '수입내역' && (
          <div>
            {/* Section 1: 기본 정보 */}
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

            {/* Section 2: 품목 명세 */}
            <div style={{ marginBottom: '28px' }}>
              <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid #cbd5e1', paddingBottom: '6px', marginBottom: '14px' }}>수입 제품 및 패킹 명세 리스트</h3>
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', height: '34px' }}>
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
                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', height: '36px' }}>
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
                      <tr style={{ background: '#f8fafc', fontWeight: 'bold', borderTop: '2px solid #cbd5e1', height: '36px' }}>
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
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '24px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 800, color: '#1e3a8a' }}>📋 발주서 (PO) 생성 추가 세부설정</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>결제 방식 (Payment Terms)</label>
                  <input
                    type="text"
                    value={request.paymentTerms || '100% T/T in advance'}
                    onChange={(e) => {
                      const val = e.target.value;
                      const updated = importRequests.map(r => r.id === id ? { ...r, paymentTerms: val } : r);
                      saveToStorage(updated);
                    }}
                    style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Shipping Mark (쉬핑마크)</label>
                  <textarea
                    rows={2}
                    value={shippingMark}
                    onChange={(e) => setShippingMark(e.target.value)}
                    style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none', resize: 'none' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
              <button
                onClick={() => setShowPoModal(true)}
                style={{ padding: '8px 16px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                🔍 PO 모달리스 미리보기
              </button>
              <button
                onClick={() => {
                  const printWin = window.open('', '_blank');
                  if (!printWin) return alert('팝업 차단기를 해제해주세요.');
                  
                  const itemsHtml = (request.piItems || []).map((item, idx) => `
                    <tr style="border-bottom: 1px solid #cbd5e1; height: 32px;">
                      <td style="text-align: center; border: 1px solid #cbd5e1;">${idx + 1}</td>
                      <td style="border: 1px solid #cbd5e1; padding-left: 8px;">${item.name}</td>
                      <td style="text-align: center; border: 1px solid #cbd5e1;">${item.hsCode || '-'}</td>
                      <td style="text-align: right; border: 1px solid #cbd5e1; padding-right: 8px;">${(Number(item.qty) || 0).toLocaleString()}</td>
                      <td style="text-align: center; border: 1px solid #cbd5e1;">${item.unit || 'EA'}</td>
                      <td style="text-align: right; border: 1px solid #cbd5e1; padding-right: 8px;">$${(Number(item.unitPrice) || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                      <td style="text-align: right; border: 1px solid #cbd5e1; padding-right: 8px;">$${((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    </tr>
                  `).join('');

                  printWin.document.write(`
                    <html>
                    <head>
                      <title>Purchase Order - ${request.id}</title>
                      <style>
                        body { font-family: 'Arial', sans-serif; padding: 40px; color: #1e293b; line-height: 1.4; }
                        .header { display: flex; justify-content: space-between; border-bottom: 3px double #1e3a8a; padding-bottom: 10px; margin-bottom: 24px; }
                        .po-title { font-size: 28px; font-weight: bold; color: #1e3a8a; }
                        .meta-table, .item-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
                        .item-table th { background: #f1f5f9; font-weight: bold; border: 1px solid #cbd5e1; padding: 8px; }
                        .packing-section { background: #f8fafc; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 24px; font-size: 13px; }
                        .signature-section { display: flex; justify-content: space-between; margin-top: 60px; }
                        .signature-box { border-top: 1px solid #94a3b8; width: 220px; text-align: center; padding-top: 8px; font-size: 13px; font-weight: bold; }
                      </style>
                    </head>
                    <body>
                      <div style="margin-bottom: 24px; text-align: center; border-bottom: 2px solid #cbd5e1; padding-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
                        <img 
                          src="${currentLetterhead === 'YSACC' ? ysaccLetterImg : ysAccLetterImg}" 
                          alt="Letterhead" 
                          style="max-height: 90px; max-width: 480px; object-fit: contain;"
                        />
                        <div style="text-align: right; font-size: 13px; min-width: 140px; padding-left: 16px;">
                          <div style="font-size: 15px; font-weight: 800; color: #b91c1c; margin-bottom: 4px;">PURCHASE ORDER</div>
                          <div><strong>PO NO:</strong> ${request.id}</div>
                          <div><strong>Date:</strong> ${request.createdAt || '2026-07-08'}</div>
                        </div>
                      </div>

                      <table class="meta-table">
                        <tr>
                          <td style="width: 50%; vertical-align: top; padding-right: 20px;">
                            <div style="background: #f8fafc; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px;">
                              <strong style="color: #0a1e3f;">BUYER (발주자)</strong><br/>
                              Company: ${letterheadInfo.company}<br/>
                              Importer: ${request.importCompany || 'YSACC'}<br/>
                              Address: ${letterheadInfo.address}
                            </div>
                          </td>
                          <td style="width: 50%; vertical-align: top;">
                            <div style="background: #f8fafc; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px;">
                              <strong style="color: #0a1e3f;">SELLER (공급처)</strong><br/>
                              Company: ${request.importerName || request.shipperName || 'Global Supplier Ltd.'}<br/>
                              Origin: ${request.routeFrom || 'CHINA'}<br/>
                              Incoterms: ${request.incoterms || 'FOB'}<br/>
                              Payment Terms: ${request.paymentTerms || '100% T/T in advance'}
                            </div>
                          </td>
                        </tr>
                      </table>

                      <div class="packing-section">
                        <strong style="color: #1e3a8a;">[ SHIPPING &amp; PACKING INFORMATION ]</strong><br/>
                        - Total CBM: ${totalCbm.toFixed(2)} CBM<br/>
                        - Total Weight: Net: ${totalNetWt.toLocaleString()} kg | Gross: ${totalGrossWt.toLocaleString()} kg<br/>
                        - Shipping Mark: <pre style="display:inline; font-family:inherit; white-space:pre-wrap;">${shippingMark}</pre>
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
                            <td colspan="3" style="text-align: center; border: 1px solid #cbd5e1;">TOTAL SUMMARY</td>
                            <td style="text-align: right; border: 1px solid #cbd5e1; padding-right: 8px;">${totalQty.toLocaleString()}</td>
                            <td style="border: 1px solid #cbd5e1;"></td>
                            <td style="border: 1px solid #cbd5e1;"></td>
                            <td style="text-align: right; border: 1px solid #cbd5e1; padding-right: 8px;">$${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                          </tr>
                        </tbody>
                      </table>

                      <div class="signature-section">
                        <div class="signature-box">For Seller (공급처 서명)</div>
                        <div class="signature-box">For Buyer (발주처 서명)</div>
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
                🖨️ PO 즉시 인쇄
              </button>
            </div>
          </div>
        )}

        {activeTab === '운송사/관세사 선정' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid #cbd5e1', paddingBottom: '6px', marginBottom: '14px' }}>
              🚢 운송사 및 통관 관세사 선정 관리
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px' }}>
                  Forwarder (지정 운송사)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>운송사 이름</label>
                    <select
                      value={request.localTransportType || 'CJ대한통운'}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = importRequests.map(r => r.id === id ? { ...r, localTransportType: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff' }}
                    >
                      <option value="CJ대한통운">CJ대한통운 (CJ Logistics)</option>
                      <option value="현대글로비스">현대글로비스 (Hyundai Glovis)</option>
                      <option value="한진">한진 (Hanjin Shipping)</option>
                      <option value="유니코로그">유니코로그 (Unico Logistics)</option>
                      <option value="영성포워딩">영성포워딩 (YS Logistics)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>운송 요율(₩)</label>
                    <input 
                      type="text"
                      placeholder="예: 720,000"
                      value={request.freightInvoiceAmount || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = importRequests.map(r => r.id === id ? { ...r, freightInvoiceAmount: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px' }}>
                  Customs Agent (통관 관세사)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>관세사사무소 이름</label>
                    <select
                      value={request.customsAgent || '이음관세사무소'}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = importRequests.map(r => r.id === id ? { ...r, customsAgent: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff' }}
                    >
                      <option value="이음관세사무소">이음관세사무소</option>
                      <option value="세인관세법인">세인관세법인</option>
                      <option value="신한관세법인">신한관세법인</option>
                      <option value="자체 지정관세사">자체 지정관세사</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>통관 의뢰 진행상태</label>
                    <select
                      value={request.dangerousCargo || '미의뢰'}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = importRequests.map(r => r.id === id ? { ...r, dangerousCargo: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff' }}
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
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid #cbd5e1', paddingBottom: '6px', marginBottom: '16px' }}>
              📁 수입 서류 및 통관 서류 업로드 관리
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b', marginBottom: '12px' }}>필수 첨부</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    C/I &amp; P/L * <span style={{ cursor: 'pointer', color: '#64748b' }} title="Commercial Invoice & Packing List">❓</span>
                  </div>
                  {documents.ciPl ? (
                    <div style={{ border: '1px solid #cbd5e1', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.ciPl.url, documents.ciPl.name)}>
                        📄 {documents.ciPl.name} (미리보기)
                      </span>
                      <button onClick={() => handleFileDelete('ciPl')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕ 삭제</button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '24px 14px', borderRadius: '6px', textAlign: 'center', fontSize: '12.5px', color: '#64748b', background: '#fff', cursor: 'pointer' }}>
                      {uploading === 'ciPl' ? '⏳ 업로드 중...' : '📤 클릭 혹은 업로드할 파일 드래그'}
                      <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('ciPl', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b', marginBottom: '12px' }}>선택 첨부</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      CO <span style={{ cursor: 'pointer', color: '#64748b' }} title="Certificate of Origin">❓</span>
                    </div>
                    {documents.co ? (
                      <div style={{ border: '1px solid #cbd5e1', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.co.url, documents.co.name)}>
                          📄 {documents.co.name}
                        </span>
                        <button onClick={() => handleFileDelete('co')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '20px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: '#64748b', background: '#fff', cursor: 'pointer' }}>
                        {uploading === 'co' ? '...' : '📤 클릭 혹은 파일 드래그'}
                        <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('co', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      인증/검역 <span style={{ cursor: 'pointer', color: '#64748b' }} title="인증 및 검역서류">❓</span>
                    </div>
                    {documents.inspect ? (
                      <div style={{ border: '1px solid #cbd5e1', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.inspect.url, documents.inspect.name)}>
                          📄 {documents.inspect.name}
                        </span>
                        <button onClick={() => handleFileDelete('inspect')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '20px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: '#64748b', background: '#fff', cursor: 'pointer' }}>
                        {uploading === 'inspect' ? '...' : '📤 클릭 혹은 파일 드래그'}
                        <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('inspect', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      기타 <span style={{ cursor: 'pointer', color: '#64748b' }} title="기타 참고서류">❓</span>
                    </div>
                    {documents.etc ? (
                      <div style={{ border: '1px solid #cbd5e1', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.etc.url, documents.etc.name)}>
                          📄 {documents.etc.name}
                        </span>
                        <button onClick={() => handleFileDelete('etc')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕ 삭제</button>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '20px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: '#64748b', background: '#fff', cursor: 'pointer' }}>
                        {uploading === 'etc' ? '...' : '📤 클릭 혹은 파일 드래그'}
                        <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('etc', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  수입신고필증 <span style={{ cursor: 'pointer', color: '#64748b' }} title="관세청 수입신고필증 수리 완료본">❓</span>
                </div>
                {documents.customsPermit ? (
                  <div style={{ border: '1px solid #cbd5e1', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.customsPermit.url, documents.customsPermit.name)}>
                      📄 {documents.customsPermit.name}
                    </span>
                    <button onClick={() => handleFileDelete('customsPermit')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                  </div>
                ) : (
                  <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '20px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: '#64748b', background: '#fff', cursor: 'pointer' }}>
                    {uploading === 'customsPermit' ? '...' : '📤 클릭 혹은 파일 드래그'}
                    <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('customsPermit', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  수입세금계산서 <span style={{ cursor: 'pointer', color: '#64748b' }} title="세관 발급 부가세/관세 세금계산서">❓</span>
                </div>
                {documents.taxInvoice ? (
                  <div style={{ border: '1px solid #cbd5e1', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.taxInvoice.url, documents.taxInvoice.name)}>
                      📄 {documents.taxInvoice.name}
                    </span>
                    <button onClick={() => handleFileDelete('taxInvoice')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                  </div>
                ) : (
                  <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '20px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: '#64748b', background: '#fff', cursor: 'pointer' }}>
                    {uploading === 'taxInvoice' ? '...' : '📤 클릭 혹은 파일 드래그'}
                    <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('taxInvoice', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  BL(AWB) <span style={{ cursor: 'pointer', color: '#64748b' }} title="선하증권 원본 혹은 Surrendered BL">❓</span>
                </div>
                {documents.blAwbDoc ? (
                  <div style={{ border: '1px solid #cbd5e1', padding: '10px 12px', borderRadius: '6px', fontSize: '12.5px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.blAwbDoc.url, documents.blAwbDoc.name)}>
                      📄 {documents.blAwbDoc.name}
                    </span>
                    <button onClick={() => handleFileDelete('blAwbDoc')} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                  </div>
                ) : (
                  <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '20px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '12px', color: '#64748b', background: '#fff', cursor: 'pointer' }}>
                    {uploading === 'blAwbDoc' ? '...' : '📤 클릭 혹은 파일 드래그'}
                    <input type="file" disabled={uploading !== null} onChange={e => e.target.files?.[0] && handleFileUpload('blAwbDoc', e.target.files[0])} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === '정산' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid #cbd5e1', paddingBottom: '6px', marginBottom: '20px' }}>
              💰 수입 관세 / 부가세 / 운임 정산 등록
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', display: 'block', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px', marginBottom: '14px' }}>
                  🧾 1. 수입세금계산서 (세관 발행분)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>공급가액 (금액, ₩)</label>
                    <input 
                      type="number"
                      value={request.taxAmount || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        const updated = importRequests.map(r => r.id === id ? { ...r, taxAmount: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                      placeholder="공급가액 입력"
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>부가세액 (세액, ₩)</label>
                    <input 
                      type="number"
                      value={request.taxVat || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        const updated = importRequests.map(r => r.id === id ? { ...r, taxVat: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                      placeholder="세액 입력"
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f766e' }}>총계 (합계금액, ₩)</label>
                    <input 
                      type="text"
                      readOnly
                      value={((Number(request.taxAmount) || 0) + (Number(request.taxVat) || 0)).toLocaleString() + ' 원'}
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#f1f5f9', fontWeight: 'bold', color: '#0f766e' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', display: 'block', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px', marginBottom: '14px' }}>
                  🚚 2. 운임 (국내 내륙 운송 / 포워딩 청구분)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>운임 금액 (공급가, ₩)</label>
                    <input 
                      type="number"
                      value={request.freightAmount || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        const updated = importRequests.map(r => r.id === id ? { ...r, freightAmount: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                      placeholder="운임 금액 입력"
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>운임 세액 (부가세, ₩)</label>
                    <input 
                      type="number"
                      value={request.freightVat || ''}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        const updated = importRequests.map(r => r.id === id ? { ...r, freightVat: val } : r);
                        saveToStorage(updated);
                      }}
                      style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                      placeholder="운임 부가세 입력"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>거래명세표 및 세금계산서 유첨 파일</label>
                  {documents.freightDoc ? (
                    <div style={{ border: '1px solid #cbd5e1', padding: '10px 12px', borderRadius: '6px', fontSize: '13px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600 }} onClick={() => previewFile(documents.freightDoc.url, documents.freightDoc.name)}>
                        📄 {documents.freightDoc.name}
                      </span>
                      <button onClick={() => handleFileDelete('freightDoc' as any)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' }}>✕ 삭제</button>
                    </div>
                  ) : (
                    <div style={{ position: 'relative', border: '1px dashed #cbd5e1', padding: '24px 14px', borderRadius: '6px', textAlign: 'center', fontSize: '12.5px', color: '#64748b', background: '#fff', cursor: 'pointer' }}>
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

              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', display: 'block', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px', marginBottom: '14px' }}>
                  🏛️ 3. 관세 (Customs Duty)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '300px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#475569' }}>납부 관세액 (₩)</label>
                  <input 
                    type="number"
                    value={request.customsTaxAmount || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      const updated = importRequests.map(r => r.id === id ? { ...r, customsTaxAmount: val } : r);
                      saveToStorage(updated);
                    }}
                    style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none' }}
                    placeholder="납부 관세 금액 입력"
                  />
                </div>
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

        {activeTab === '로그' && (
          <div>
            <h3 style={{ fontSize: '15.5px', fontWeight: 800, color: '#1e3a8a', borderBottom: '2px solid #cbd5e1', paddingBottom: '6px', marginBottom: '20px' }}>
              📜 업무 이력 및 진행 히스토리 로그
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', paddingLeft: '24px', borderLeft: '3px solid #e2e8f0', marginLeft: '12px' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '-31.5px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#10b981', border: '3px solid #fff', boxShadow: '0 0 0 3px #d1fae5' }} />
                <div style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>{request.createdAt || '2026. 07. 03.'}</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>📥 수입 의뢰 등록 완료</div>
                <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '2px' }}>수입 의뢰 번호: #{request.id} 건이 등록되었습니다. (작성 관리자: {request.manager || '김주한'})</div>
              </div>

              {request.piItems && request.piItems.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-31.5px', top: '2px', width: '12px', height: '12px', borderRadius: '50%', background: '#2563eb', border: '3px solid #fff', boxShadow: '0 0 0 3px #dbeafe' }} />
                  <div style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>{request.createdAt || '2026. 07. 03.'}</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>📦 제품 명세 최종 확정</div>
                  <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '2px' }}>
                    총 {request.piItems.length}종 제품(총 {totalQty.toLocaleString()} EA)의 명세 정보가 저장되었습니다.
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
          border: '1px solid #cbd5e1',
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
            <div style={{ borderBottom: '2px solid #cbd5e1', paddingBottom: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <img 
                src={currentLetterhead === 'YSACC' ? ysaccLetterImg : ysAccLetterImg} 
                alt="Letterhead Preview" 
                style={{ maxHeight: '72px', maxWidth: '380px', objectFit: 'contain' }}
              />
              <div style={{ textAlign: 'right', fontSize: '12px', minWidth: '120px', paddingLeft: '16px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#b91c1c', marginBottom: '4px' }}>PURCHASE ORDER</div>
                <div><strong>PO NO:</strong> {request.id}</div>
                <div><strong>Date:</strong> {request.createdAt || '2026-07-08'}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div style={{ background: '#f8fafc', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <strong style={{ color: '#0a1e3f' }}>BUYER (발주자)</strong>
                <div style={{ marginTop: '4px', fontSize: '11.5px', lineHeight: '1.5' }}>
                  Company: {letterheadInfo.company}<br/>
                  Importer: {request.importCompany || 'YSACC'}<br/>
                  Address: {letterheadInfo.address}
                </div>
              </div>
              <div style={{ background: '#f8fafc', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <strong style={{ color: '#0a1e3f' }}>SELLER (공급처)</strong>
                <div style={{ marginTop: '4px', fontSize: '11.5px', lineHeight: '1.5' }}>
                  Company: {request.importerName || request.shipperName || '-'}<br/>
                  Origin: {request.routeFrom || 'CHINA'}<br/>
                  Incoterms: {request.incoterms || 'FOB'}<br/>
                  Payment Terms: {request.paymentTerms || '100% T/T in advance'}
                </div>
              </div>
            </div>

            <div style={{ background: '#f1f5f9', padding: '12px', borderRadius: '6px', marginBottom: '20px', border: '1px solid #cbd5e1' }}>
              <strong style={{ color: '#0a1e3f' }}>[ SHIPPING &amp; PACKING INFORMATION ]</strong>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px', fontSize: '12px' }}>
                <div>- Total Volume: {totalCbm.toFixed(2)} CBM</div>
                <div>- Shipping Mark: <span style={{ fontWeight: 'bold' }}>{shippingMark.replace(/\n/g, ' / ')}</span></div>
                <div>- Net Weight: {totalNetWt.toLocaleString()} kg</div>
                <div>- Gross Weight: {totalGrossWt.toLocaleString()} kg</div>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', marginBottom: '20px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', height: '28px' }}>
                  <th style={{ border: '1px solid #cbd5e1', padding: '4px' }}>No</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '4px' }}>Description of Commodity</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '4px' }}>HS Code</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '4px', textAlign: 'right' }}>Qty</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '4px', textAlign: 'center' }}>Unit</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '4px', textAlign: 'right' }}>U.Price</th>
                  <th style={{ border: '1px solid #cbd5e1', padding: '4px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(request.piItems || []).map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', height: '28px' }}>
                    <td style={{ border: '1px solid #cbd5e1', textAlign: 'center' }}>{idx + 1}</td>
                    <td style={{ border: '1px solid #cbd5e1', padding: '4px', fontWeight: 600 }}>{item.name}</td>
                    <td style={{ border: '1px solid #cbd5e1', textAlign: 'center' }}>{item.hsCode || '-'}</td>
                    <td style={{ border: '1px solid #cbd5e1', textAlign: 'right', padding: '4px' }}>{(Number(item.qty) || 0).toLocaleString()}</td>
                    <td style={{ border: '1px solid #cbd5e1', textAlign: 'center' }}>{item.unit || 'EA'}</td>
                    <td style={{ border: '1px solid #cbd5e1', textAlign: 'right', padding: '4px' }}>${(Number(item.unitPrice) || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td style={{ border: '1px solid #cbd5e1', textAlign: 'right', padding: '4px', fontWeight: 700 }}>${((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  </tr>
                ))}
                <tr style={{ background: '#f8fafc', fontWeight: 'bold', height: '30px' }}>
                  <td colSpan={3} style={{ border: '1px solid #cbd5e1', textAlign: 'center' }}>TOTAL SUM</td>
                  <td style={{ border: '1px solid #cbd5e1', textAlign: 'right', padding: '4px', color: '#1e3a8a' }}>{totalQty.toLocaleString()}</td>
                  <td style={{ border: '1px solid #cbd5e1' }}></td>
                  <td style={{ border: '1px solid #cbd5e1' }}></td>
                  <td style={{ border: '1px solid #cbd5e1', textAlign: 'right', padding: '4px', color: '#0f766e' }}>
                    ${totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', paddingBottom: '20px' }}>
              <div style={{ borderTop: '1px solid #94a3b8', width: '160px', textAlign: 'center', paddingTop: '6px', fontSize: '11px', fontWeight: 'bold' }}>Seller Signature</div>
              <div style={{ borderTop: '1px solid #94a3b8', width: '160px', textAlign: 'center', paddingTop: '6px', fontSize: '11px', fontWeight: 'bold' }}>Buyer Signature</div>
            </div>
          </div>

          <div style={{
            background: '#f1f5f9',
            padding: '12px 16px',
            borderTop: '1px solid #cbd5e1',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px'
          }}>
            <button 
              onClick={() => setShowPoModal(false)}
              style={{ padding: '6px 12px', background: '#94a3b8', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px' }}
            >
              닫기
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
              🖨️ 인쇄하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default ImportDetail;
