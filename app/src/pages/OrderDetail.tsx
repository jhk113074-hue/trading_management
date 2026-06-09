import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, COMPANY_ID, storage } from '../firebase';
import type { Order, OrderItem } from '../types/order';

export const OrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'basic' | 'shipping' | 'items' | 'supplierPo' | 'docs'>('basic');
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [piData, setPiData] = useState<any | null>(null);

  // Form states for details editing
  const [basicForm, setBasicForm] = useState({
    custPo: '',
    incoterms: 'FOB' as any,
    paymentTerms: '',
    poDate: '',
    requestedDelivery: '',
    remark: '',
    manager: '',
    externalLinksStr: '', // comma or newline separated links
    issuingCompany: 'YSACC' as 'YSACC' | 'YS',
    
    // New progress tracking fields
    ciNumber: '',
    vesselBooking: '',
    forwarderConfirmed: '',
    cargoReadyDate: '',
    cfsEntryDate: '',
    cfsContactInfo: '',
    docCutoffDate: '',
    etd: '',
    eta: '',
    containerVolumeQuantities: '',
    exportDeclarationNo: '',
    lcNo: '',
    customsExchangeRate: 0,
    dispatchStatusByVendor: '',
    containerWorkspaceType: '' as 'CFS' | 'Door' | '',
    shipmentCompleted: '' as 'Y' | 'N' | '',
    docsSentOrBankSubmitted: '',
    purchaseCertificateByVendor: '',
    paymentStatusByVendor: ''
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
          externalLinksStr: data.externalLinks ? data.externalLinks.join('\n') : '',
          issuingCompany: (data.issuingCompany || 'YSACC') as 'YSACC' | 'YS',
          
          ciNumber: data.ciNumber || '',
          vesselBooking: data.vesselBooking || '',
          forwarderConfirmed: data.forwarderConfirmed || '',
          cargoReadyDate: data.cargoReadyDate || '',
          cfsEntryDate: data.cfsEntryDate || '',
          cfsContactInfo: data.cfsContactInfo || '',
          docCutoffDate: data.docCutoffDate || '',
          etd: data.etd || '',
          eta: data.eta || '',
          containerVolumeQuantities: data.containerVolumeQuantities || '',
          exportDeclarationNo: data.exportDeclarationNo || '',
          lcNo: data.lcNo || '',
          customsExchangeRate: data.customsExchangeRate || 0,
          dispatchStatusByVendor: data.dispatchStatusByVendor || '',
          containerWorkspaceType: data.containerWorkspaceType || '',
          shipmentCompleted: data.shipmentCompleted || '',
          docsSentOrBankSubmitted: data.docsSentOrBankSubmitted || '',
          purchaseCertificateByVendor: data.purchaseCertificateByVendor || '',
          paymentStatusByVendor: data.paymentStatusByVendor || ''
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

  // Load connected PI document
  useEffect(() => {
    if (!order?.quotationId) {
      setPiData(null);
      return;
    }
    const piRef = doc(db, 'companies', COMPANY_ID, 'proforma_invoices', order.quotationId);
    const unsubscribe = onSnapshot(piRef, (docSnap) => {
      if (docSnap.exists()) {
        setPiData(docSnap.data());
      } else {
        setPiData(null);
      }
    }, (err) => {
      console.warn("Failed to sync connected PI details:", err);
    });
    return () => unsubscribe();
  }, [order?.quotationId]);

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

  // Save details changes
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
        issuingCompany: basicForm.issuingCompany,
        
        ciNumber: basicForm.ciNumber,
        vesselBooking: basicForm.vesselBooking,
        forwarderConfirmed: basicForm.forwarderConfirmed,
        cargoReadyDate: basicForm.cargoReadyDate,
        cfsEntryDate: basicForm.cfsEntryDate,
        cfsContactInfo: basicForm.cfsContactInfo,
        docCutoffDate: basicForm.docCutoffDate,
        etd: basicForm.etd,
        eta: basicForm.eta,
        containerVolumeQuantities: basicForm.containerVolumeQuantities,
        exportDeclarationNo: basicForm.exportDeclarationNo,
        lcNo: basicForm.lcNo,
        customsExchangeRate: Number(basicForm.customsExchangeRate) || 0,
        dispatchStatusByVendor: basicForm.dispatchStatusByVendor,
        containerWorkspaceType: basicForm.containerWorkspaceType,
        shipmentCompleted: basicForm.shipmentCompleted,
        docsSentOrBankSubmitted: basicForm.docsSentOrBankSubmitted,
        purchaseCertificateByVendor: basicForm.purchaseCertificateByVendor,
        paymentStatusByVendor: basicForm.paymentStatusByVendor,
        
        updatedAt: serverTimestamp()
      }, { merge: true });

      setIsEditing(false);
      alert('✅ 저장되었습니다.');
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

    const logoVersion = Date.now();
    const isYS = order.issuingCompany === 'YS';

    const printHtml = `
      <html>
        <head>
          <title>발주서 - ${poNum}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&display=swap');
            body { font-family: 'Noto Sans KR', sans-serif; padding: 20px; color: #000; font-size: 12px; line-height: 1.4; }
            .no-print { display: block; position: fixed; top: 15px; right: 15px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 13px; z-index: 9999; }
            @media print {
              .no-print { display: none !important; }
              body { padding: 0; }
            }
            .po-title-container { text-align: center; margin-bottom: 25px; position: relative; }
            .po-title { font-size: 36px; font-weight: 800; letter-spacing: 12px; margin: 0; display: inline-block; border-bottom: 2px solid #000; padding-bottom: 5px; }
            .po-subtitle { position: absolute; right: 0; bottom: 5px; font-size: 11px; font-weight: bold; }
            
            .meta-grid { display: grid; grid-template-columns: 1.1fr 1.3fr; gap: 10px; margin-bottom: 15px; }
            .meta-left { display: flex; flex-direction: column; gap: 4px; justify-content: center; }
            .meta-left div { font-size: 11px; }
            .meta-left strong { width: 70px; display: inline-block; }

            .business-table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: center; }
            .business-table th, .business-table td { border: 1px solid #000; padding: 4px; height: 26px; }
            .business-table th { background-color: #f3f4f6; font-weight: 600; width: 25%; }
            .business-table td { width: 75%; position: relative; }
            
            .supplier-seal-container { display: flex; align-items: center; justify-content: space-between; font-weight: bold; padding: 0 10px; width: 100%; height: 100%; box-sizing: border-box; }
            .supplier-seal-container img.seal-bg { position: absolute; left: 45%; top: 50%; transform: translate(-50%, -50%); height: 28px; width: auto; z-index: 1; opacity: 0.12; }
            .supplier-seal-container img.seal-stamp { position: absolute; right: 20px; top: 50%; transform: translateY(-50%); height: 48px; width: auto; z-index: 5; opacity: 0.85; }

            .delivery-info { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 8px 0; margin-bottom: 15px; font-size: 12px; }
            .delivery-info div { margin-bottom: 4px; }
            .delivery-info div:last-child { margin-bottom: 0; }

            .items-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px; }
            .items-table th, .items-table td { border: 1px solid #000; padding: 6px 4px; }
            .items-table th { background-color: #f3f4f6; font-weight: 600; text-align: center; }
            .items-table td { text-align: left; }
            .items-table td.center { text-align: center; }
            .items-table td.right { text-align: right; }

            .notes-box { border: 1.5px solid #000; padding: 10px; margin-bottom: 15px; font-size: 11px; }
            .notes-title { font-weight: 700; margin-bottom: 5px; text-decoration: underline; }
            .notes-box ol { margin: 0; padding-left: 15px; }
            .notes-box li { margin-bottom: 4px; }

            .bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 11px; }
            .bottom-box { border: 1px solid #000; padding: 8px; min-height: 80px; }
            .bottom-box-title { font-weight: 700; margin-bottom: 4px; }
            
            .bottom-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
            .bottom-table td { border: 1px solid #000; padding: 3px; font-size: 10px; }
            .bottom-table td.label { background-color: #f3f4f6; text-align: center; font-weight: 600; width: 20%; }
            .bottom-table td.value { text-align: center; width: 80%; }

            .footer-name { text-align: center; margin-top: 25px; font-size: 18px; font-weight: 900; letter-spacing: 2px; display: flex; align-items: center; justify-content: center; gap: 8px; }
            .footer-logo { height: 24px; width: auto; object-fit: contain; }
          </style>
        </head>
        <body>
          <button class="no-print" onclick="window.print()">🖨️ 인쇄하기 / PDF 저장</button>
          
          <div class="po-title-container">
            <h1 class="po-title">발 주 서</h1>
            <div class="po-subtitle">* 물탱크용 부자재 및 관련 자재</div>
          </div>

          <div class="meta-grid">
            <div class="meta-left">
              <div><strong>발주번호 :</strong> ${poNum}</div>
              <div><strong>발주일자 :</strong> ${new Date().toISOString().split('T')[0].replace(/-/g, '년 ').concat('일').replace(/(\d{4})년\s0?(\d{1,2})월\s0?(\d{1,2})일/, '$1년 $2월 $3일')}</div>
              <div><strong>수&nbsp;&nbsp;&nbsp;&nbsp;신 :</strong> ${supplierName}</div>
              <div><strong>참&nbsp;&nbsp;&nbsp;&nbsp;조 :</strong> ${items[0]?.supplierContact || '-'}</div>
              <div><strong>전화번호 :</strong> -</div>
              <div><strong>F A X :</strong> -</div>
            </div>
            <div>
              <table class="business-table">
                <tr>
                  <th>등록번호</th>
                  <td style="font-weight: bold; letter-spacing: 1px;">${isYS ? '730-17-00185' : '217-87-00384'}</td>
                </tr>
                <tr>
                  <th>상  호</th>
                  <td style="position: relative; padding: 0;">
                    <div class="supplier-seal-container">
                      <img src="/logo.png?v=${logoVersion}" class="seal-bg" />
                      <img src="${isYS ? '/YS_ACC_STAMP.jpg' : '/YSACC_STAMP.png'}?v=${logoVersion}" class="seal-stamp" />
                      <div style="width: 100%; display: flex; justify-content: space-between; padding: 0 10px; z-index: 3; position: relative;">
                        <span>${isYS ? '영성에이씨씨(영성ACC)' : '(주)와이에스에이씨씨'}</span>
                        <span style="font-weight: normal; margin-right: 50px;">김 주 한</span>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr>
                  <th>사업장</th>
                  <td style="font-size: 10px; text-align: left; padding-left: 8px;">${isYS ? '충북 청주시 흥덕구 월명로 76, 111-201호' : '충북 청주시 흥덕구 가로수로 1251, 201-1호'}</td>
                </tr>
                <tr>
                  <th>업  태</th>
                  <td>${isYS ? '도소매업 외' : '제조업 외'}</td>
                </tr>
                <tr>
                  <th>종  목</th>
                  <td>${isYS ? '물탱크 및 기자재' : '물탱크 및 관련부품'}</td>
                </tr>
              </table>
            </div>
          </div>

          <div style="font-weight: bold; font-size: 12px; margin-bottom: 15px;">하기와 같이 발주 드립니다.</div>

          <div class="delivery-info">
            <div><strong>입고요청일 :</strong> 추후 안내 예정</div>
            <div><strong>납품처(주소, 담당자, 연락처) :</strong> 추후 통보예정</div>
          </div>

          <table class="items-table">
            <thead>
              <tr>
                <th style="width: 250px;">품 명</th>
                <th style="width: 120px;">규 격</th>
                <th style="width: 70px;">수량</th>
                <th style="width: 90px;">단 가</th>
                <th style="width: 110px;">금 액</th>
                <th style="width: 100px;">부가세</th>
                <th>비 고</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it) => {
                const isKrw = it.currency === 'KRW';
                const currencySymbol = isKrw ? '' : '$';
                const rawAmt = it.amount || 0;
                const vatAmt = isKrw ? Math.round(rawAmt * 0.1) : parseFloat((rawAmt * 0.1).toFixed(2));
                return `
                  <tr>
                    <td><strong>${it.name}</strong></td>
                    <td class="center">${it.grade || '-'}</td>
                    <td class="right">${(it.qty || 0).toLocaleString()}</td>
                    <td class="right">${currencySymbol}${(it.unitPrice || 0).toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
                    <td class="right">${currencySymbol}${rawAmt.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
                    <td class="right">${currencySymbol}${vatAmt.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
                    <td style="font-size: 10px; color: #475569;">${it.unit} 발주</td>
                  </tr>
                `;
              }).join('')}
              
              <!-- Blank rows for layout stability -->
              ${Array.from({ length: Math.max(0, 5 - items.length) }).map(() => `
                <tr>
                  <td style="height: 25px;"></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              `).join('')}

              <tr style="font-weight: bold; background-color: #fafafa;">
                <td colspan="2" class="center">합   계</td>
                <td class="right">${items.reduce((sum, it) => sum + (it.qty || 0), 0).toLocaleString()}</td>
                <td></td>
                <td class="right">
                  ${(() => {
                    const usdSub = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
                    const krwSub = items.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
                    const parts = [];
                    if (usdSub > 0) parts.push(`$${usdSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                    if (krwSub > 0) parts.push(`${krwSub.toLocaleString()}`);
                    return parts.join(' / ');
                  })()}
                </td>
                <td class="right">
                  ${(() => {
                    const usdTotal = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
                    const krwTotal = items.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
                    const usdVat = parseFloat((usdTotal * 0.1).toFixed(2));
                    const krwVat = Math.round(krwTotal * 0.1);
                    const parts = [];
                    if (usdTotal > 0) parts.push(`$${usdVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                    if (krwTotal > 0) parts.push(`${krwVat.toLocaleString()}`);
                    return parts.join(' / ');
                  })()}
                </td>
                <td class="right" style="color: #dc2626;">
                  ${(() => {
                    const usdTotal = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
                    const krwTotal = items.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
                    const usdGrand = parseFloat((usdTotal * 1.1).toFixed(2));
                    const krwGrand = Math.round(krwTotal * 1.1);
                    const parts = [];
                    if (usdTotal > 0) parts.push(`$${usdGrand.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD`);
                    if (krwTotal > 0) parts.push(`₩${krwGrand.toLocaleString()} KRW`);
                    return parts.join(' / ');
                  })()}
                </td>
              </tr>
            </tbody>
          </table>

          <div class="notes-box">
            <div class="notes-title">※ 특이사항:</div>
            <ol>
              <li>부산항 도착도 조건 (기본 인코텀즈: ${order.incoterms || 'FOB'})</li>
              <li>세금계산서는 일반 전자세금계산서 발급조건입니다.</li>
              <li>Shipping Mark는 출하 3일 전에 보내드릴 예정입니다.</li>
            </ol>
          </div>

          <div class="bottom-grid">
            <div class="bottom-box">
              <div class="bottom-box-title">※ 일반사항</div>
              <div style="font-size: 10px; color: #334155; line-height: 1.4;">
                1. 부가가치세(VAT): 일반 전자세금계산서 발행 기준<br/>
                2. 결제조건: ${order.paymentTerms || '현금 선입금 후 출고 조건 결제'}
              </div>
            </div>
            <div class="bottom-box" style="padding: 4px;">
              <div class="bottom-box-title" style="margin-left: 4px; font-size: 11px;">※ 참고사항</div>
              <table class="bottom-table">
                <tr>
                  <td colspan="2" class="label" style="height: 18px; padding: 2px;">발주담당</td>
                </tr>
                <tr>
                  <td class="label">직 위</td>
                  <td class="value">대표이사</td>
                </tr>
                <tr>
                  <td class="label">성 명</td>
                  <td class="value">김 주 한</td>
                </tr>
                <tr>
                  <td class="label">연락처</td>
                  <td class="value">010-4494-1028</td>
                </tr>
              </table>
            </div>
          </div>

          <div class="footer-name">
            <img src="/logo.png?v=${logoVersion}" class="footer-logo" />
            <span>${isYS ? '영성에이씨씨' : '(주)와이에스에이씨씨'}</span>
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

  const handleDeleteOrder = async () => {
    if (!order) return;
    if (!window.confirm("⚠️ 이 발주서(PO)를 영구 삭제하고 발주를 취소하시겠습니까?\n연결된 Proforma Invoice(PI)의 상태가 다시 'PO확정' 대기 상태로 되돌아갑니다.")) return;
    
    try {
      // 1. Delete PO document
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await deleteDoc(orderRef);
      
      // 2. Revert PI status to 'confirmed' if quotationId is linked
      if (order.quotationId) {
        const piRef = doc(db, 'companies', COMPANY_ID, 'proforma_invoices', order.quotationId);
        await setDoc(piRef, { status: 'confirmed', updatedAt: serverTimestamp() }, { merge: true });
      }
      
      alert("✅ 발주서(PO)가 취소 및 삭제되었으며, PI 상태가 복원되었습니다.");
      navigate('/orders');
    } catch (e: any) {
      alert("❌ 발주 취소 중 오류 발생: " + e.message);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            onClick={() => navigate('/orders')}
            style={{ background: '#fff', border: '1px solid #cbd5e1', color: '#475569', padding: '6px 14px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
          >
            이전으로
          </button>
          <span style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>PO 상세 정보 - {order.id}</span>
        </div>
        <button 
          onClick={handleDeleteOrder}
          style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
        >
          ❌ PO 삭제 및 발주 취소
        </button>
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
          { id: 'shipping', label: '🚢 선적 & 진행 현황' },
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>발행사 (발주서 기준)</span>
                {isEditing ? (
                  <select
                    value={basicForm.issuingCompany}
                    onChange={e => setBasicForm(prev => ({ ...prev, issuingCompany: e.target.value as 'YSACC' | 'YS' }))}
                    style={{ padding: '9px 11px', border: '2px solid #3b82f6', borderRadius: '6px', fontSize: '13px', fontWeight: 700, background: '#eff6ff' }}
                  >
                    <option value="YSACC">YSACC (와이에스에이씨씨)</option>
                    <option value="YS">영성ACC (YS ACC)</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={order.issuingCompany === 'YS' ? '영성ACC (YS ACC)' : 'YSACC (와이에스에이씨씨)'}
                    disabled
                    style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#f8fafc',
                      color: order.issuingCompany === 'YS' ? '#059669' : '#2563eb', fontWeight: 700 }}
                  />
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginTop: '10px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>비고 (Remarks)</span>
              <textarea rows={3} value={basicForm.remark} onChange={e => setBasicForm(prev => ({ ...prev, remark: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc', resize: 'vertical' }} />
            </div>
          </div>
        )}

        {/* TAB: Shipping & Progress */}
        {activeTab === 'shipping' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* PI Info & Shipping Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>🚢 선적 및 진행 현황 관리</span>
                <div style={{ fontSize: '12.5px', color: '#6b7280', marginTop: '4px' }}>수송/부킹/통관 및 대금지급 단계별 진행현황 입력 및 확인</div>
              </div>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '24px' }}>
              {/* Left Column: Connected PI Information Summary */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', alignSelf: 'start' }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: '#1e3a8a', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>📄</span> 연결된 Proforma Invoice (PI) 정보
                </div>
                {piData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12.5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>PI 번호</span>
                      <strong style={{ color: '#0f172a' }}>{piData.piNumber}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>PI 발행일자</span>
                      <span>{piData.piDate}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>고객사</span>
                      <span>{piData.customerName}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>출발항 / 도착항</span>
                      <span style={{ fontWeight: 600 }}>{piData.departurePort || '-'} / {piData.destinationPort || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>인코텀즈 / 결제조건</span>
                      <span>{piData.incoterms} / {piData.paymentTerms}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>운송 수단</span>
                      <span>{piData.shippingMethod || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>포장 스펙</span>
                      <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={piData.packagingSpec}>{piData.packagingSpec || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>면장 기준환율</span>
                      <span>{piData.exchangeRate ? `1 USD = ${piData.exchangeRate.toLocaleString()} KRW` : '-'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '8px', marginTop: '4px' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>PI 총 합계</span>
                      <strong style={{ color: '#2563eb' }}>${(piData.totalUsd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>원화 환산금액</span>
                      <strong style={{ color: '#059669' }}>₩{(piData.totalKrw || 0).toLocaleString()} KRW</strong>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                    {order.quotationId ? '연결된 PI 문서를 로드할 수 없거나 없습니다.' : '연결된 PI 번호가 없습니다.'}
                  </div>
                )}
              </div>

              {/* Right Column: Step-by-Step Inputs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* 1. 물류 및 부킹 단계 */}
                <div style={{ border: '1px solid #bfdbfe', background: '#f0f7ff', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e40af', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📦</span> 물류 예약 및 컨테이너 정보
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>CI 번호 확정</span>
                      <input type="text" value={basicForm.ciNumber} onChange={e => setBasicForm(p => ({ ...p, ciNumber: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: CI-2026-0001" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>Vessel 부킹 (선박명/항차)</span>
                      <input type="text" value={basicForm.vesselBooking} onChange={e => setBasicForm(p => ({ ...p, vesselBooking: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: HYUNDAI TOKYO V.024E" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>지정 포워더(Forwarder)</span>
                      <input type="text" value={basicForm.forwarderConfirmed} onChange={e => setBasicForm(p => ({ ...p, forwarderConfirmed: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 현대글로비스" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>컨테이너 규격 및 수량 (Container Volume/Qty)</span>
                      <input type="text" value={basicForm.containerVolumeQuantities} onChange={e => setBasicForm(p => ({ ...p, containerVolumeQuantities: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 20' Dry x 2, 40' HQ x 1" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>컨테이너 작업장 분류</span>
                      {isEditing ? (
                        <select value={basicForm.containerWorkspaceType} onChange={e => setBasicForm(p => ({ ...p, containerWorkspaceType: e.target.value as any }))} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '100%' }}>
                          <option value="">선택사항</option>
                          <option value="CFS">CFS 작업</option>
                          <option value="Door">Door 작업 (공장 직접 적재)</option>
                        </select>
                      ) : (
                        <input type="text" value={basicForm.containerWorkspaceType === 'CFS' ? 'CFS 작업' : basicForm.containerWorkspaceType === 'Door' ? 'Door 작업' : '-'} disabled style={inputStyle(false)} />
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. 상세 스케줄 단계 */}
                <div style={{ border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#c2410c', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>📅</span> 상세 운송 및 선적 일정
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>화물 준비 완료일 (Cargo Ready)</span>
                      <input type="date" value={basicForm.cargoReadyDate} onChange={e => setBasicForm(p => ({ ...p, cargoReadyDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>CFS 입고일 / 반입일</span>
                      <input type="date" value={basicForm.cfsEntryDate} onChange={e => setBasicForm(p => ({ ...p, cfsEntryDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>서류/화물 마감일 (Cut-off Date)</span>
                      <input type="date" value={basicForm.docCutoffDate} onChange={e => setBasicForm(p => ({ ...p, docCutoffDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>ETD (출발예정일)</span>
                      <input type="date" value={basicForm.etd} onChange={e => setBasicForm(p => ({ ...p, etd: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>ETA (도착예정일)</span>
                      <input type="date" value={basicForm.eta} onChange={e => setBasicForm(p => ({ ...p, eta: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>CFS 주소 및 담당자 정보</span>
                    <textarea rows={2} value={basicForm.cfsContactInfo} onChange={e => setBasicForm(p => ({ ...p, cfsContactInfo: e.target.value }))} disabled={!isEditing} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc', resize: 'vertical', width: '100%', boxSizing: 'border-box' }} placeholder="창고 주소, 담당자 성함 및 전화번호 입력..." />
                  </div>
                </div>

                {/* 3. 통관 및 금융 관련 */}
                <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#166534', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🧾</span> 수출 신고 및 대금 관련
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>수출신고번호</span>
                      <input type="text" value={basicForm.exportDeclarationNo} onChange={e => setBasicForm(p => ({ ...p, exportDeclarationNo: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="000-00-00-000000U" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>L/C 번호</span>
                      <input type="text" value={basicForm.lcNo} onChange={e => setBasicForm(p => ({ ...p, lcNo: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="L/C 번호 입력" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>수출면장 적용 환율 (면장환율)</span>
                      <input type="number" step="0.01" value={basicForm.customsExchangeRate || ''} onChange={e => setBasicForm(p => ({ ...p, customsExchangeRate: parseFloat(e.target.value) || 0 }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 1350.50" />
                    </div>
                  </div>
                </div>

                {/* 4. 작업 진척/체크 리스트 */}
                <div style={{ border: '1px solid #ddd6fe', background: '#f5f3ff', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#5b21b6', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>✔</span> 거래처별 진척 및 마감 여부
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>거래처별 차량 배차 여부</span>
                      <input type="text" value={basicForm.dispatchStatusByVendor} onChange={e => setBasicForm(p => ({ ...p, dispatchStatusByVendor: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 가나운수 배차완료" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>선적 완료 여부</span>
                      {isEditing ? (
                        <select value={basicForm.shipmentCompleted} onChange={e => setBasicForm(p => ({ ...p, shipmentCompleted: e.target.value as any }))} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '100%' }}>
                          <option value="">선택사항</option>
                          <option value="N">미완료 (N)</option>
                          <option value="Y">완료 (Y)</option>
                        </select>
                      ) : (
                        <input type="text" value={basicForm.shipmentCompleted === 'Y' ? '완료 (Y)' : basicForm.shipmentCompleted === 'N' ? '미완료 (N)' : '-'} disabled style={inputStyle(false)} />
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>선적서류 발송 / 은행 제출 여부</span>
                      <input type="text" value={basicForm.docsSentOrBankSubmitted} onChange={e => setBasicForm(p => ({ ...p, docsSentOrBankSubmitted: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 은행제출 완료(6/9)" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>구매확인서 발급 (업체별 여부)</span>
                      <input type="text" value={basicForm.purchaseCertificateByVendor} onChange={e => setBasicForm(p => ({ ...p, purchaseCertificateByVendor: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 태성기술 완료, 현대이피 미완료" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>대금 지급 현황 (업체별 여부)</span>
                      <input type="text" value={basicForm.paymentStatusByVendor} onChange={e => setBasicForm(p => ({ ...p, paymentStatusByVendor: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 원자재처 완납, 포워더 미지급" />
                    </div>
                  </div>
                </div>

              </div>
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
                  <th style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>단가</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', width: '140px' }}>금액</th>
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
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{it.currency === 'KRW' ? '₩' : '$'}{(it.unitPrice || 0).toLocaleString(undefined, it.currency === 'KRW' ? {} : { minimumFractionDigits: 2 })}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{it.currency === 'KRW' ? '₩' : '$'}{(it.amount || 0).toLocaleString(undefined, it.currency === 'KRW' ? {} : { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', borderTop: '2px solid #e2e8f0', paddingTop: '15px' }}>
              <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>총 수량: {order.items?.reduce((s, it) => s + (it.qty || 0), 0).toLocaleString()}</span>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#dc2626' }}>
                총 금액 합계: {(() => {
                  const usdTotal = order.items?.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
                  const krwTotal = order.items?.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
                  const parts = [];
                  if (usdTotal > 0) parts.push(`$${usdTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`);
                  if (krwTotal > 0) parts.push(`₩${krwTotal.toLocaleString('en-US')} KRW`);
                  if (parts.length === 0) return '$0.00 USD';
                  return parts.join(' / ');
                })()}
              </span>
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
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569', marginTop: '4px' }}>{order.issuingCompany === 'YS' ? 'YS ACC' : 'YSACC CO., LTD.'}</div>
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
                            <th style={{ padding: '8px', textAlign: 'right', width: '120px' }}>금액</th>
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
                              <td style={{ padding: '8px', textAlign: 'right' }}>{it.currency === 'KRW' ? '₩' : '$'}{(it.unitPrice || 0).toLocaleString(undefined, it.currency === 'KRW' ? {} : { minimumFractionDigits: 2 })}</td>
                              <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{it.currency === 'KRW' ? '₩' : '$'}{(it.amount || 0).toLocaleString(undefined, it.currency === 'KRW' ? {} : { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div style={{ alignSelf: 'flex-end', fontWeight: 800, color: '#dc2626', fontSize: '14px', borderTop: '1px solid #cbd5e1', paddingTop: '8px', width: '100%', textAlign: 'right' }}>
                        공급업체 발주 합계: {(() => {
                          const usdTotal = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
                          const krwTotal = items.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0);
                          const parts = [];
                          if (usdTotal > 0) parts.push(`$${usdTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} USD`);
                          if (krwTotal > 0) parts.push(`₩${krwTotal.toLocaleString()} KRW`);
                          if (parts.length === 0) return '$0.00 USD';
                          return parts.join(' / ');
                        })()}
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

const inputStyle = (isEditing: boolean) => ({
  padding: '8px 10px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '13px',
  background: isEditing ? '#fff' : '#f8fafc',
  color: isEditing ? '#0f172a' : '#4b5563',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box' as const
});
