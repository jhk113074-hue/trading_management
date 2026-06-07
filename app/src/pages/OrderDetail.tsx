import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, COMPANY_ID, storage } from '../firebase';
import type { Order, OrderItem } from '../types/order';

export const OrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'basic' | 'items' | 'supplierPo' | 'docs'>('basic');
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  // Form states for basic details editing
  const [basicForm, setBasicForm] = useState({
    custPo: '',
    incoterms: 'FOB' as any,
    paymentTerms: '',
    poDate: '',
    requestedDelivery: '',
    remark: '',
    manager: '',
    externalLinksStr: '' // comma or newline separated links
  });

  // Load Order document
  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, 'companies', COMPANY_ID, 'orders', id);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Order;
        setOrder(data);
        setBasicForm({
          custPo: data.custPo || '',
          incoterms: data.incoterms || 'FOB',
          paymentTerms: data.paymentTerms || '',
          poDate: data.poDate || '',
          requestedDelivery: data.requestedDelivery || '',
          remark: data.remark || '',
          manager: data.manager || '',
          externalLinksStr: data.externalLinks ? data.externalLinks.join('\n') : ''
        });
      } else {
        setOrder(null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Failed to sync order details:", err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [id]);

  // Status steps list
  const steps = ["대기", "발행완료", "납기확인중", "납기확정", "부킹완료", "선적완료", "완료"];
  const currentStepIdx = order ? steps.indexOf(order.status) : 0;

  // Change order status manually or progress through stepper click
  const handleStepClick = async (stepName: typeof steps[number]) => {
    if (!order) return;
    if (!window.confirm(`상태를 [${stepName}] 단계로 변경하시겠습니까?`)) return;
    try {
      const docRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(docRef, {
        status: stepName,
        updatedAt: serverTimestamp(),
        ...(stepName === '발행완료' && !order.poIssuedAt ? { poIssuedAt: serverTimestamp() } : {})
      }, { merge: true });
    } catch (e: any) {
      alert("상태 업데이트 실패: " + e.message);
    }
  };

  // Group items by supplier for Purchase Orders preview
  const groupedSupplierItems = useMemo(() => {
    if (!order || !order.items) return {};
    const groups: Record<string, OrderItem[]> = {};
    order.items.forEach(item => {
      const supplierName = item.supplier?.trim() || 'General Supplier';
      if (!groups[supplierName]) {
        groups[supplierName] = [];
      }
      groups[supplierName].push(item);
    });
    return groups;
  }, [order]);

  // Save basic details changes
  const handleSaveBasic = async () => {
    if (!order) return;
    try {
      const docRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      const links = basicForm.externalLinksStr
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      await setDoc(docRef, {
        custPo: basicForm.custPo,
        incoterms: basicForm.incoterms,
        paymentTerms: basicForm.paymentTerms,
        poDate: basicForm.poDate,
        requestedDelivery: basicForm.requestedDelivery,
        remark: basicForm.remark,
        manager: basicForm.manager,
        externalLinks: links,
        updatedAt: serverTimestamp()
      }, { merge: true });

      setIsEditing(false);
      alert('✅ 기본 정보가 저장되었습니다.');
    } catch (e: any) {
      alert('❌ 저장 실패: ' + e.message);
    }
  };

  // Upload attachment file to Firebase Storage
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !order) return;
    
    setIsUploading(true);
    setUploadProgress(0);

    const file = files[0];
    const uniqueFileName = `${Date.now()}_${file.name}`;
    // Store in tasks/{orderId} to match Firebase Storage path rules
    const storageRef = ref(storage, `tasks/${order.id}/${uniqueFileName}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        setUploadProgress(progress);
      }, 
      (error) => {
        console.error("Upload failed", error);
        alert("업로드 중 에러가 발생했습니다: " + error.message);
        setIsUploading(false);
        setUploadProgress(null);
      }, 
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          const newAttachment = {
            name: file.name,
            url: downloadUrl,
            size: file.size,
            path: uploadTask.snapshot.ref.fullPath
          };

          const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
          const updatedAttachments = [...(order.attachments || []), newAttachment];
          await setDoc(orderRef, { attachments: updatedAttachments, updatedAt: serverTimestamp() }, { merge: true });
          
          alert("✅ 파일이 성공적으로 업로드되었습니다.");
        } catch (err: any) {
          alert("파일 정보 저장 실패: " + err.message);
        } finally {
          setIsUploading(false);
          setUploadProgress(null);
        }
      }
    );
  };

  // Delete attachment from Storage & Firestore
  const handleDeleteAttachment = async (idx: number) => {
    if (!order || !order.attachments) return;
    const target = order.attachments[idx];
    if (!window.confirm(`'${target.name}' 파일을 영구 삭제하시겠습니까?`)) return;

    try {
      if (target.path) {
        const fileRef = ref(storage, target.path);
        await deleteObject(fileRef).catch(e => console.warn("Failed to delete from storage:", e));
      }
      const updatedAttachments = order.attachments.filter((_, i) => i !== idx);
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, { attachments: updatedAttachments, updatedAt: serverTimestamp() }, { merge: true });
      alert("✅ 파일이 삭제되었습니다.");
    } catch (err: any) {
      alert("파일 삭제 실패: " + err.message);
    }
  };

  // Grouped Supplier PO Print handler
  const handlePrintSupplierPo = (supplierName: string, items: OrderItem[]) => {
    if (!order) return;
    const cleanSupplierName = supplierName.replace(/\s+/g, '');
    const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
    const poNum = `${order.id}-${supplierCode}`;

    const printHtml = `
      <html>
        <head>
          <title>PURCHASE ORDER - ${poNum}</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1e293b; font-size: 13px; }
            .po-header { display: flex; justify-content: space-between; border-bottom: 2px solid #1e293b; padding-bottom: 20px; margin-bottom: 30px; }
            .po-title { font-size: 24px; font-weight: 800; color: #1e40af; }
            .po-meta { text-align: right; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
            .info-box { border: 1px solid #cbd5e1; padding: 15px; border-radius: 6px; background: #f8fafc; }
            .info-title { font-weight: bold; color: #475569; margin-bottom: 8px; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 30px; }
            th { background: #1e40af; color: #fff; padding: 10px; font-weight: bold; text-align: left; }
            td { border: 1px solid #e2e8f0; padding: 10px; }
            .total-box { font-size: 16px; font-weight: bold; text-align: right; margin-top: 20px; color: #dc2626; border-top: 2px solid #1e40af; padding-top: 10px; }
            .footer-info { margin-top: 40px; border-top: 1px dashed #cbd5e1; padding-top: 20px; font-size: 11px; color: #64748b; text-align: center; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
            .print-btn { position: fixed; top: 20px; right: 20px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
          </style>
        </head>
        <body>
          <button class="print-btn" onclick="window.print()">🖨️ 인쇄하기 / PDF 저장</button>
          
          <div class="po-header">
            <div>
              <div class="po-title">PURCHASE ORDER</div>
              <div style="font-weight: bold; margin-top: 5px;">YSACC CO., LTD.</div>
            </div>
            <div class="po-meta">
              <div><strong>발주 번호:</strong> ${poNum}</div>
              <div><strong>발행 일자:</strong> ${new Date().toISOString().split('T')[0]}</div>
            </div>
          </div>

          <div class="info-grid">
            <div class="info-box">
              <div class="info-title">To (수신 공급업체)</div>
              <div><strong>공급사명:</strong> ${supplierName}</div>
              <div><strong>담당자 연락처:</strong> ${items[0]?.supplierContact || '-'}</div>
            </div>
            <div class="info-box">
              <div class="info-title">From (발주처)</div>
              <div><strong>회사명:</strong> YSACC CO., LTD.</div>
              <div><strong>주소:</strong> 111-201, 76, Wolmyeong-ro, Heungdeok-gu, Cheongju-si, Korea</div>
              <div><strong>인코텀즈:</strong> ${order.incoterms || '-'}</div>
              <div><strong>납기요청일:</strong> ${order.requestedDelivery || '-'}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 50px;">No</th>
                <th>품목 및 사양</th>
                <th style="width: 80px;">Grade</th>
                <th style="width: 80px; text-align: right;">수량</th>
                <th style="width: 60px; text-align: center;">단위</th>
                <th style="width: 100px; text-align: right;">단가</th>
                <th style="width: 120px; text-align: right;">금액 (USD)</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td><strong>${it.name}</strong></td>
                  <td>${it.grade || '-'}</td>
                  <td style="text-align: right;">${(it.qty || 0).toLocaleString()}</td>
                  <td style="text-align: center;">${it.unit}</td>
                  <td style="text-align: right;">$${(it.unitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td style="text-align: right; font-weight: bold;">$${(it.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="total-box">
            총 발주 합계 금액 (Total Amount): $${items.reduce((sum, it) => sum + (it.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
          </div>

          <div class="footer-info">
            본 발주서는 전산 발행되었으며, 날인이 없어도 동일한 효력을 지닙니다.<br/>
            YSACC CO., LTD. &nbsp;·&nbsp; Tel: +82-50-7081-1130 &nbsp;·&nbsp; www.ysacc.co.kr
          </div>
        </body>
      </html>
    `;

    const printWin = window.open('', '_blank', 'width=850,height=900,scrollbars=yes,resizable=yes');
    if (printWin) {
      printWin.document.write(printHtml);
      printWin.document.close();
    } else {
      alert("팝업이 차단되었습니다. 팝업 설정을 확인해 주세요.");
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', color: '#475569', textAlign: 'center' }}>상세 발주 내역을 로드하는 중...</div>;
  }

  if (!order) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h3 style={{ color: '#ef4444' }}>⚠️ 해당 PO를 찾을 수 없습니다.</h3>
        <button onClick={() => navigate('/orders')} style={{ marginTop: '14px', padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>PO 목록으로 이동</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button 
          onClick={() => navigate('/orders')}
          style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
        >
          이전으로
        </button>
        <span style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>PO 상세 정보 - {order.id}</span>
      </div>

      {/* Stepper 현황 */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>📍 진행 상태 현황 (단계를 클릭하여 상태를 업데이트할 수 있습니다)</div>
        <div style={{ display: 'flex', position: 'relative', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Stepper background line */}
          <div style={{ position: 'absolute', top: '24%', left: '4%', right: '4%', height: '4px', background: '#e2e8f0', zIndex: 1 }} />
          
          {steps.map((step, idx) => {
            const isCompleted = idx < currentStepIdx;
            const isCurrent = idx === currentStepIdx;
            
            let circleColor = '#cbd5e1';
            let textColor = '#64748b';
            if (isCompleted) {
              circleColor = '#2563eb';
              textColor = '#2563eb';
            } else if (isCurrent) {
              circleColor = '#ea580c';
              textColor = '#ea580c';
            }

            return (
              <div 
                key={step} 
                onClick={() => handleStepClick(step)}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, zIndex: 2, cursor: 'pointer', position: 'relative' }}
              >
                <div style={{ 
                  width: '28px', height: '28px', borderRadius: '50%', backgroundColor: circleColor, color: '#fff', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '12px',
                  border: isCurrent ? '4px solid #ffedd5' : 'none', transition: 'all 0.2s'
                }}>
                  {idx + 1}
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, marginTop: '8px', color: textColor }}>{step}</span>
                {isCurrent && (
                  <span style={{ fontSize: '10px', color: '#f97316', position: 'absolute', top: '48px', whiteSpace: 'nowrap' }}>
                    [진행중]
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ height: '10px' }} />
      </div>

      {/* Tabs Layout */}
      <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '4px', borderRadius: '8px' }}>
        {[
          { id: 'basic', label: '📋 기본 정보' },
          { id: 'items', label: '📦 품목 명세' },
          { id: 'supplierPo', label: '🚚 공급사 발주서' },
          { id: 'docs', label: '📂 서류 & 링크 관리' }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              flex: 1, padding: '10px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', cursor: 'pointer', border: 'none',
              background: activeTab === tab.id ? '#2563eb' : 'transparent',
              color: activeTab === tab.id ? '#fff' : '#475569',
              transition: 'all 0.15s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tabs Content */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '24px' }}>
        
        {/* TAB 1: Basic Info */}
        {activeTab === 'basic' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>기본 계약 및 거래 조건</span>
              <button 
                onClick={() => {
                  if (isEditing) handleSaveBasic();
                  else setIsEditing(true);
                }}
                style={{ padding: '8px 16px', background: isEditing ? '#16a34a' : '#2563eb', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
              >
                {isEditing ? '💾 저장 완료' : '✏️ 편집 모드'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>고객사</span>
                <input type="text" value={order.customer} disabled style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#f8fafc' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>고객사 PO 번호</span>
                <input type="text" value={basicForm.custPo} onChange={e => setBasicForm(prev => ({ ...prev, custPo: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>연결된 견적번호 (Quotation ID)</span>
                <input type="text" value={order.quotationId || '연결 없음'} disabled style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#f8fafc' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>인코텀즈</span>
                {isEditing ? (
                  <select value={basicForm.incoterms} onChange={e => setBasicForm(prev => ({ ...prev, incoterms: e.target.value as any }))} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
                    <option value="FOB">FOB</option>
                    <option value="CIF HCM">CIF HCM</option>
                    <option value="EXW">EXW</option>
                    <option value="CFR">CFR</option>
                    <option value="DAP">DAP</option>
                    <option value="DDP">DDP</option>
                  </select>
                ) : (
                  <input type="text" value={order.incoterms} disabled style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#f8fafc' }} />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>결제 조건</span>
                <input type="text" value={basicForm.paymentTerms} onChange={e => setBasicForm(prev => ({ ...prev, paymentTerms: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>담당 영업사원</span>
                <input type="text" value={basicForm.manager} onChange={e => setBasicForm(prev => ({ ...prev, manager: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>PO 접수일</span>
                <input type="date" value={basicForm.poDate} onChange={e => setBasicForm(prev => ({ ...prev, poDate: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>요청 납기일</span>
                <input type="date" value={basicForm.requestedDelivery} onChange={e => setBasicForm(prev => ({ ...prev, requestedDelivery: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>상태</span>
                <input type="text" value={order.status} disabled style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#f8fafc', fontWeight: 'bold' }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>비고 (Remarks)</span>
              <textarea rows={3} value={basicForm.remark} onChange={e => setBasicForm(prev => ({ ...prev, remark: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc', resize: 'vertical' }} />
            </div>
          </div>
        )}

        {/* TAB 2: Line Items */}
        {activeTab === 'items' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>수주 품목 명세 요약</span>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '10px 12px', width: '50px', textAlign: 'center' }}>No</th>
                  <th style={{ padding: '10px 12px' }}>품목 사양명</th>
                  <th style={{ padding: '10px 12px' }}>공급업체</th>
                  <th style={{ padding: '10px 12px' }}>Grade</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', width: '100px' }}>수량</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', width: '80px' }}>단위</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>단가 (USD)</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', width: '140px' }}>금액 (USD)</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.map((it, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{it.name}</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>{it.supplier}</td>
                    <td style={{ padding: '10px 12px' }}>{it.grade || '-'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{(it.qty || 0).toLocaleString()}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#64748b' }}>{it.unit}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>${(it.unitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>${(it.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', borderTop: '2px solid #e2e8f0', paddingTop: '15px' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>총 수량: {order.items?.reduce((s, it) => s + (it.qty || 0), 0).toLocaleString()}</span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#dc2626' }}>총 금액 합계: ${order.totalAmount?.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</span>
            </div>
          </div>
        )}

        {/* TAB 3: Supplier Purchase Orders Grouped Cards */}
        {activeTab === 'supplierPo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>공급사별 개별 발주서 발행 미리보기</span>
              <div style={{ fontSize: '12px', color: '#64748b' }}>품목 리스트의 공급업체 필드 값을 기준으로 자동 분류되어 발주서가 생성됩니다.</div>
            </div>

            {Object.keys(groupedSupplierItems).length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>공급사가 지정된 품목이 없습니다.</div>
            ) : (
              Object.entries(groupedSupplierItems).map(([supplierName, items]) => {
                const cleanSupplierName = supplierName.replace(/\s+/g, '');
                const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
                const poNum = `${order.id}-${supplierCode}`;
                const supplierTotal = items.reduce((sum, it) => sum + (it.amount || 0), 0);

                return (
                  <div key={supplierName} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }}>
                    
                    {/* Card Action Header */}
                    <div style={{ background: '#f8fafc', padding: '12px 20px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '14px' }}>📄 공급사 PO 번호: {poNum}</span>
                      <button 
                        onClick={() => handlePrintSupplierPo(supplierName, items)}
                        style={{ padding: '6px 14px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '5px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}
                      >
                        🖨️ 발주서 인쇄 / PDF 저장
                      </button>
                    </div>

                    {/* PO Body Simulation */}
                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#fff' }}>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontSize: '20px', fontWeight: 900, color: '#1e40af' }}>PURCHASE ORDER</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginTop: '4px' }}>YSACC CO., LTD.</div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '12px', color: '#475569' }}>
                          <div><strong>발주번호:</strong> {poNum}</div>
                          <div><strong>발행일자:</strong> {new Date().toISOString().split('T')[0]}</div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', background: '#f8fafc' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '6px' }}>RECEIVER (공급업체)</div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{supplierName}</div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>연락처: {items[0]?.supplierContact || '-'}</div>
                        </div>

                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px', background: '#f8fafc' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px', marginBottom: '6px' }}>DETAILS (발주 조건)</div>
                          <div style={{ fontSize: '12px', color: '#475569' }}>
                            <div>Incoterms: {order.incoterms}</div>
                            <div>납기요청일: {order.requestedDelivery || '-'}</div>
                            <div>결제조건: {order.paymentTerms || '-'}</div>
                          </div>
                        </div>
                      </div>

                      {/* Items table for this supplier */}
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '10px' }}>
                        <thead>
                          <tr style={{ background: '#1e40af', color: '#fff' }}>
                            <th style={{ padding: '8px', textAlign: 'center', width: '40px' }}>No</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>품목명</th>
                            <th style={{ padding: '8px', width: '80px' }}>Grade</th>
                            <th style={{ padding: '8px', textAlign: 'right', width: '80px' }}>수량</th>
                            <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}>단위</th>
                            <th style={{ padding: '8px', textAlign: 'right', width: '100px' }}>단가</th>
                            <th style={{ padding: '8px', textAlign: 'right', width: '120px' }}>금액 (USD)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                              <td style={{ padding: '8px', fontWeight: 600 }}>{it.name}</td>
                              <td style={{ padding: '8px' }}>{it.grade || '-'}</td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{(it.qty || 0).toLocaleString()}</td>
                              <td style={{ padding: '8px', textAlign: 'center', color: '#64748b' }}>{it.unit}</td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>${(it.unitPrice || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>${(it.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div style={{ alignSelf: 'flex-end', fontWeight: 800, color: '#dc2626', fontSize: '14px', borderTop: '1px solid #cbd5e1', paddingTop: '8px', width: '100%', textAlign: 'right' }}>
                        공급업체 발주 합계: ${supplierTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD
                      </div>

                    </div>

                  </div>
                );
              })
            )}

          </div>
        )}

        {/* TAB 4: Documents and External Links */}
        {activeTab === 'docs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Storage File Upload Area */}
            <div>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#1f2937', display: 'block', marginBottom: '8px' }}>📂 첨부 파일 업로드 및 관리</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input 
                  type="file" 
                  id="order-file-uploader" 
                  onChange={handleFileUpload} 
                  disabled={isUploading}
                  style={{ display: 'none' }} 
                />
                <label 
                  htmlFor="order-file-uploader"
                  style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
                >
                  {isUploading ? `업로드 중 (${uploadProgress}%)` : '📁 파일 선택 업로드'}
                </label>
                <span style={{ fontSize: '12px', color: '#64748b' }}>PDF, 이미지 등 통관/발주 관련 서류 업로드 (최대 100MB)</span>
              </div>

              {/* Uploaded files list */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginTop: '16px' }}>
                {order.attachments && order.attachments.length > 0 ? (
                  order.attachments.map((att, idx) => (
                    <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                        <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#2563eb', fontWeight: 600, fontSize: '12.5px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          📄 {att.name}
                        </a>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>Size: {(att.size / 1024).toFixed(1)} KB</span>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => handleDeleteAttachment(idx)}
                        style={{ border: 'none', background: 'transparent', color: '#ef4444', fontWeight: 700, cursor: 'pointer', fontSize: '14px' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={{ gridColumn: 'span 2', padding: '20px', border: '1px dashed #cbd5e1', borderRadius: '6px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                    등록된 첨부 파일이 없습니다.
                  </div>
                )}
              </div>
            </div>

            {/* Dropbox/Google Drive sharing links area */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#1f2937', display: 'block', marginBottom: '8px' }}>🔗 외부 클라우드 링크 등록 (Dropbox / Drive 등)</span>
              
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', color: '#64748b' }}>공유 링크 입력 (줄바꿈으로 구분)</label>
                  <textarea 
                    rows={4} 
                    value={basicForm.externalLinksStr} 
                    onChange={e => setBasicForm(prev => ({ ...prev, externalLinksStr: e.target.value }))}
                    placeholder="https://www.dropbox.com/sh/...\nhttps://drive.google.com/..." 
                    style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} 
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {order.externalLinks && order.externalLinks.length > 0 ? (
                    order.externalLinks.map((link, idx) => (
                      <div key={idx} style={{ padding: '8px 12px', background: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                        <a href={link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#1e40af', fontWeight: 600, fontSize: '13px', display: 'block', wordBreak: 'break-all' }}>
                          🔗 {link}
                        </a>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '16px', border: '1px dashed #cbd5e1', borderRadius: '6px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                      등록된 외부 공유 클라우드 링크가 없습니다. (편집 모드에서 추가할 수 있습니다.)
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

    </div>
  );
};
