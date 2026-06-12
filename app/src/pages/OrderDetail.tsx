import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, COMPANY_ID, storage } from '../firebase';
import type { Order, OrderItem } from '../types/order';

const steps = ["ORDER기본정보", "발주서 발행", "공급사별 납기 결정", "선적&진행현황", "선적서류 작성 및 수출신고", "공급사 세금계산서 및 결제", "선적서류 발송 및 은행제출", "이익계산"] as const;

export const OrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState<typeof steps[number]>("ORDER기본정보");
  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingField, setUploadingField] = useState<'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'otherFiles' | null>(null);
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
    paymentStatusByVendor: '',
    ciPlSentDate: '',
    bankSubmissionDate: '',
    paymentCollectedDate: '',

    // 8-step fields
    isLc: '' as 'Y' | 'N' | '',
    supplierPoSent: {} as Record<string, boolean>,
    supplierProductionDates: {} as Record<string, string>,
    forwarderQuotationAmount: 0,
    cfsAddress: '',
    cfsContact: '',
    ciPlStatus: '' as 'Y' | 'N' | '',
    containerWorkStatus: '',
    cooStatus: '' as 'Y' | 'N' | '',
    blStatus: '' as 'Y' | 'N' | '',
    shippingDocsSentStatus: '' as 'Y' | 'N' | '',
    shippingDocsSentDate: '',
    shippingDocsTrackingNo: '',
    supplierPayments: {} as Record<string, { status: string; date: string; }>,
    
    supplierTaxInvoice: {} as Record<string, 'Y' | 'N' | ''>,
    supplierPurchaseCertificate: {} as Record<string, 'Y' | 'N' | ''>,
    bankSubmissionStatus: '' as 'Y' | 'N' | ''
  });

  // Load Order document
  useEffect(() => {
    if (!id) return;
    const docRef = doc(db, 'companies', COMPANY_ID, 'orders', id);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Order;
        setOrder(data);
        if (data.status) {
          setActiveStep(data.status as typeof steps[number]);
        }
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
          paymentStatusByVendor: data.paymentStatusByVendor || '',
          ciPlSentDate: data.ciPlSentDate || '',
          bankSubmissionDate: data.bankSubmissionDate || '',
          paymentCollectedDate: data.paymentCollectedDate || '',

          isLc: data.isLc || '',
          supplierPoSent: data.supplierPoSent || {},
          supplierProductionDates: data.supplierProductionDates || {},
          forwarderQuotationAmount: data.forwarderQuotationAmount || 0,
          cfsAddress: data.cfsAddress || '',
          cfsContact: data.cfsContact || '',
          ciPlStatus: data.ciPlStatus || '',
          containerWorkStatus: data.containerWorkStatus || '',
          cooStatus: data.cooStatus || '',
          blStatus: data.blStatus || '',
          shippingDocsSentStatus: data.shippingDocsSentStatus || '',
          shippingDocsSentDate: data.shippingDocsSentDate || '',
          shippingDocsTrackingNo: data.shippingDocsTrackingNo || '',
          supplierPayments: data.supplierPayments || {},
          
          supplierTaxInvoice: data.supplierTaxInvoice || {},
          supplierPurchaseCertificate: data.supplierPurchaseCertificate || {},
          bankSubmissionStatus: data.bankSubmissionStatus || ''
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

  const currentStepIdx = order ? steps.indexOf(order.status as any) : 0;

  // Change order status manually or progress through stepper click
  const handleStepClick = async (stepName: typeof steps[number]) => {
    if (!order) return;
    
    setActiveStep(stepName);
    setIsEditing(true);

    if (order.status !== stepName) {
      if (window.confirm(`상태를 [${stepName}] 단계로 변경하시겠습니까?`)) {
        try {
          const docRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
          await setDoc(docRef, {
            status: stepName,
            updatedAt: serverTimestamp(),
            ...(stepName === '발주서 발행' && !order.poIssuedAt ? { poIssuedAt: serverTimestamp() } : {})
          }, { merge: true });
        } catch (e: any) {
          alert("상태 업데이트 실패: " + e.message);
        }
      }
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
        ciPlSentDate: basicForm.ciPlSentDate,
        bankSubmissionDate: basicForm.bankSubmissionDate,
        paymentCollectedDate: basicForm.paymentCollectedDate,

        // 8-step inputs saving
        isLc: basicForm.isLc,
        supplierPoSent: basicForm.supplierPoSent,
        supplierProductionDates: basicForm.supplierProductionDates,
        forwarderQuotationAmount: Number(basicForm.forwarderQuotationAmount) || 0,
        cfsAddress: basicForm.cfsAddress,
        cfsContact: basicForm.cfsContact,
        ciPlStatus: basicForm.ciPlStatus,
        containerWorkStatus: basicForm.containerWorkStatus,
        cooStatus: basicForm.cooStatus,
        blStatus: basicForm.blStatus,
        shippingDocsSentStatus: basicForm.shippingDocsSentStatus,
        shippingDocsSentDate: basicForm.shippingDocsSentDate,
        shippingDocsTrackingNo: basicForm.shippingDocsTrackingNo,
        supplierPayments: basicForm.supplierPayments,
        
        supplierTaxInvoice: basicForm.supplierTaxInvoice,
        supplierPurchaseCertificate: basicForm.supplierPurchaseCertificate,
        bankSubmissionStatus: basicForm.bankSubmissionStatus,
        
        updatedAt: serverTimestamp()
      }, { merge: true });

      setIsEditing(false);
      alert('✅ 저장되었습니다.');
    } catch (e: any) {
      alert('❌ 저장 실패: ' + e.message);
    }
  };

  // Upload document attachment file to Firebase Storage for specific fields (CI, PL, COO, BL, other)
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'otherFiles') => {
    const files = e.target.files;
    if (!files || files.length === 0 || !order) return;
    
    setUploadingField(fieldName);

    const file = files[0];
    const uniqueFileName = `${Date.now()}_${file.name}`;
    const storageRef = ref(storage, `tasks/${order.id}/${uniqueFileName}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on('state_changed', 
      () => {}, 
      (error) => {
        console.error("Upload failed", error);
        alert("업로드 중 에러가 발생했습니다: " + error.message);
        setUploadingField(null);
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
          const updatedList = [...(order[fieldName] || []), newAttachment];
          await setDoc(orderRef, { [fieldName]: updatedList, updatedAt: serverTimestamp() }, { merge: true });
          
          alert("✅ 파일이 성공적으로 업로드되었습니다.");
        } catch (err: any) {
          alert("파일 정보 저장 실패: " + err.message);
        } finally {
          setUploadingField(null);
        }
      }
    );
  };

  // Delete document attachment from Storage & Firestore for specific fields
  const handleDeleteDoc = async (fieldName: 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'otherFiles', idx: number) => {
    if (!order) return;
    const fileList = order[fieldName] || [];
    const target = fileList[idx];
    if (!target) return;
    if (!window.confirm(`'${target.name}' 파일을 영구 삭제하시겠습니까?`)) return;

    try {
      if (target.path) {
        const fileRef = ref(storage, target.path);
        await deleteObject(fileRef).catch(e => console.warn("Failed to delete from storage:", e));
      }
      const updatedList = fileList.filter((_, i) => i !== idx);
      const orderRef = doc(db, 'companies', COMPANY_ID, 'orders', order.id);
      await setDoc(orderRef, { [fieldName]: updatedList, updatedAt: serverTimestamp() }, { merge: true });
      alert("✅ 파일이 삭제되었습니다.");
    } catch (err: any) {
      alert("파일 삭제 실패: " + err.message);
    }
  };

  // Helper render for document file attachment widgets
  const renderFileField = (
    label: string,
    fieldName: 'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'otherFiles',
    inputDocId: string
  ) => {
    const fileList = order?.[fieldName] || [];
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', background: '#f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>📎 {label}</span>
          {isEditing && (
            <div>
              <input
                type="file"
                id={inputDocId}
                style={{ display: 'none' }}
                onChange={(e) => handleDocUpload(e, fieldName)}
                disabled={uploadingField !== null}
              />
              <label
                htmlFor={inputDocId}
                style={{
                  padding: '4px 8px',
                  background: uploadingField === fieldName ? '#94a3b8' : '#3b82f6',
                  color: '#fff',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: uploadingField === fieldName ? 'not-allowed' : 'pointer',
                  fontWeight: 600
                }}
              >
                {uploadingField === fieldName ? '업로드 중...' : '파일 추가'}
              </label>
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
          {fileList.length > 0 ? (
            fileList.map((file, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#2563eb', fontSize: '12px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>
                  📄 {file.name}
                </a>
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => handleDeleteDoc(fieldName, idx)}
                    style={{ border: 'none', background: 'transparent', color: '#ef4444', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))
          ) : (
            <span style={{ fontSize: '11.5px', color: '#94a3b8', fontStyle: 'italic' }}>첨부 파일 없음</span>
          )}
        </div>
      </div>
    );
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

      {/* Top Panel: PI Info, File Upload & Cloud Links */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '20px', alignItems: 'stretch' }}>
        {/* 1. 연결된 PI 정보 */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#1e3a8a', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📄</span> 연결된 PI 정보
          </div>
          {piData ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 20px', fontSize: '12.5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>PI 번호</span>
                <strong style={{ color: '#0f172a', textAlign: 'right' }}>{piData.piNumber}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>PI 발행일자</span>
                <span style={{ textAlign: 'right' }}>{piData.piDate}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>고객사</span>
                <span style={{ textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={piData.customerName}>{piData.customerName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>출발항 / 도착항</span>
                <span style={{ fontWeight: 600, textAlign: 'right' }}>{piData.departurePort || '-'} / {piData.destinationPort || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>인코텀즈 / 결제</span>
                <span style={{ textAlign: 'right' }}>{piData.incoterms} / {piData.paymentTerms}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>운송 수단</span>
                <span style={{ textAlign: 'right' }}>{piData.shippingMethod || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', borderTop: '1px dashed #cbd5e1', paddingTop: '8px' }}>
                <span style={{ color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>PI 총 합계</span>
                <strong style={{ color: '#2563eb', textAlign: 'right' }}>${(piData.totalUsd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', borderTop: '1px dashed #cbd5e1', paddingTop: '8px' }}>
                <span style={{ color: '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>원화 환산금액</span>
                <strong style={{ color: '#059669', textAlign: 'right' }}>₩{(piData.totalKrw || 0).toLocaleString()} KRW</strong>
              </div>
            </div>
          ) : (
            <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '12.5px' }}>
              연결된 PI 번호가 없거나 불러올 수 없습니다.
            </div>
          )}
        </div>

        {/* 2. 첨부 파일 업로드 및 관리 */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1f2937' }}>📂 첨부 파일 업로드 및 관리</div>
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
              style={{ padding: '8px 12px', background: '#3b82f6', color: '#fff', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
            >
              {isUploading ? `업로드 중 (${uploadProgress}%)` : '📁 파일 업로드'}
            </label>
          </div>

          {/* Uploaded Files list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto', maxHeight: '100px' }}>
            {order.attachments && order.attachments.length > 0 ? (
              order.attachments.map((att, idx) => (
                <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                  <a href={att.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#2563eb', fontWeight: 600, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                    📄 {att.name}
                  </a>
                  <button 
                    type="button" 
                    onClick={() => handleDeleteAttachment(idx)}
                    style={{ border: 'none', background: 'transparent', color: '#ef4444', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}
                  >
                    ✕
                  </button>
                </div>
              ))
            ) : (
              <div style={{ padding: '12px', border: '1px dashed #cbd5e1', borderRadius: '6px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                등록된 첨부 파일이 없습니다.
              </div>
            )}
          </div>
        </div>

        {/* 3. 외부 클라우드 링크 */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1f2937' }}>🔗 외부 클라우드 링크</div>
          
          {isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
              <textarea 
                rows={2} 
                value={basicForm.externalLinksStr} 
                onChange={e => setBasicForm(prev => ({ ...prev, externalLinksStr: e.target.value }))}
                placeholder="https://www.dropbox.com/sh/..." 
                style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', width: '100%', boxSizing: 'border-box', height: '100%', resize: 'none' }} 
              />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflowY: 'auto', maxHeight: '120px' }}>
              {order.externalLinks && order.externalLinks.length > 0 ? (
                order.externalLinks.map((link, idx) => (
                  <div key={idx} style={{ padding: '6px 10px', background: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                    <a href={link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#1e40af', fontWeight: 600, fontSize: '12px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🔗 {link}
                    </a>
                  </div>
                ))
              ) : (
                <div style={{ padding: '12px', border: '1px dashed #cbd5e1', borderRadius: '6px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                  외부 공유 링크가 없습니다.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content: Selected activeStep Input Forms */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '24px', minHeight: '400px', width: '100%', boxSizing: 'border-box' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #2563eb', paddingBottom: '12px', marginBottom: '20px' }}>
            <div>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#1e3a8a' }}>
                👉 단계: {activeStep}
              </span>
              <span style={{ fontSize: '12.5px', color: '#64748b', marginLeft: '10px' }}>
                (상단 Stepper에서 원하는 단계를 선택하여 바로 이동할 수 있습니다)
              </span>
            </div>
            <button 
              onClick={() => {
                if (isEditing) handleSaveBasic();
                else setIsEditing(true);
              }}
              style={{ padding: '8px 18px', background: isEditing ? '#16a34a' : '#2563eb', border: 'none', color: '#fff', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}
            >
              {isEditing ? '💾 저장 완료' : '✏️ 편집 모드'}
            </button>
          </div>

          {/* Render corresponding form/contents based on activeStep */}

          {/* 1. ORDER기본정보 */}
          {activeStep === 'ORDER기본정보' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>고객사 PO 번호</span>
                  <input type="text" value={basicForm.custPo} onChange={e => setBasicForm(prev => ({ ...prev, custPo: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>인코텀즈</span>
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
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>결제 조건</span>
                  <input type="text" value={basicForm.paymentTerms} onChange={e => setBasicForm(prev => ({ ...prev, paymentTerms: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>담당 영업사원</span>
                  <input type="text" value={basicForm.manager} onChange={e => setBasicForm(prev => ({ ...prev, manager: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>PO 접수일</span>
                  <input type="date" value={basicForm.poDate} onChange={e => setBasicForm(prev => ({ ...prev, poDate: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>요청 납기일</span>
                  <input type="date" value={basicForm.requestedDelivery} onChange={e => setBasicForm(prev => ({ ...prev, requestedDelivery: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>발행사 (발주서 기준)</span>
                  {isEditing ? (
                    <select value={basicForm.issuingCompany} onChange={e => setBasicForm(prev => ({ ...prev, issuingCompany: e.target.value as 'YSACC' | 'YS' }))} style={{ padding: '9px 11px', border: '2px solid #3b82f6', borderRadius: '6px', fontSize: '13px', fontWeight: 700, background: '#eff6ff' }}>
                      <option value="YSACC">YSACC (와이에스에이씨씨)</option>
                      <option value="YS">영성ACC (YS ACC)</option>
                    </select>
                  ) : (
                    <input type="text" value={order.issuingCompany === 'YS' ? '영성ACC (YS ACC)' : 'YSACC (와이에스에이씨씨)'} disabled style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#f8fafc', fontWeight: 700 }} />
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>L/C 거래 여부</span>
                  {isEditing ? (
                    <select value={basicForm.isLc} onChange={e => setBasicForm(prev => ({ ...prev, isLc: e.target.value as any }))} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }}>
                      <option value="">선택사항 (기본 T/T)</option>
                      <option value="Y">L/C 거래 (Y)</option>
                      <option value="N">T/T 거래 (N)</option>
                    </select>
                  ) : (
                    <input type="text" value={basicForm.isLc === 'Y' ? 'L/C 거래 (Y)' : basicForm.isLc === 'N' ? 'T/T 거래 (N)' : '일반 거래'} disabled style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: '#f8fafc' }} />
                  )}
                </div>
                {basicForm.isLc === 'Y' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', gridColumn: 'span 2' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>L/C 번호</span>
                    <input type="text" value={basicForm.lcNo} onChange={e => setBasicForm(prev => ({ ...prev, lcNo: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc' }} placeholder="L/C 번호 입력" />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>비고 (Remarks)</span>
                <textarea rows={3} value={basicForm.remark} onChange={e => setBasicForm(prev => ({ ...prev, remark: e.target.value }))} disabled={!isEditing} style={{ padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', background: isEditing ? '#fff' : '#f8fafc', resize: 'vertical' }} />
              </div>
            </div>
          )}

          {/* 2. 발주서 발행 */}
          {activeStep === '발주서 발행' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 'bold', color: '#475569', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '10px' }}>
                  🚚 공급업체별 발주서 전달 완료 체크
                </div>
                {Object.keys(groupedSupplierItems).length === 0 ? (
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>품목 명세에 등록된 공급업체가 없습니다.</span>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {Object.keys(groupedSupplierItems).map(supplier => {
                      const isSent = basicForm.supplierPoSent[supplier] || false;
                      return (
                        <div key={supplier} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>{supplier}</span>
                          <input 
                            type="checkbox" 
                            checked={isSent} 
                            disabled={!isEditing}
                            onChange={e => {
                              const val = e.target.checked;
                              setBasicForm(prev => ({
                                ...prev,
                                supplierPoSent: {
                                  ...prev.supplierPoSent,
                                  [supplier]: val
                                }
                              }));
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* SUPPLIER PO CARDS INTERPOLATED DIRECTLY HERE */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderTop: '2px dashed #cbd5e1', paddingTop: '20px' }}>
                <span style={{ fontSize: '14.5px', fontWeight: 800, color: '#1e3a8a' }}>🚚 공급업체별 발주서(PO) 인쇄 및 다운로드</span>
                {Object.keys(groupedSupplierItems).length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>발주할 공급업체가 없습니다.</div>
                ) : (
                  Object.entries(groupedSupplierItems).map(([supplierName, items]) => {
                    const cleanSupplierName = supplierName.replace(/\s+/g, '');
                    const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
                    const poNum = `${order.id}-${supplierCode}`;

                    return (
                      <div key={supplierName} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.03)' }}>
                        <div style={{ background: '#f8fafc', padding: '12px 20px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '13.5px' }}>📄 {supplierName} PO ({poNum})</span>
                          <button 
                            onClick={() => handlePrintSupplierPo(supplierName, items)}
                            style={{ padding: '6px 14px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '5px', cursor: 'pointer', fontWeight: 700, fontSize: '12px' }}
                          >
                            🖨️ 발주서 출력 / PDF 저장
                          </button>
                        </div>
                        <div style={{ padding: '16px', background: '#fff', fontSize: '12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span><strong>상호:</strong> {order.issuingCompany === 'YS' ? 'YS ACC' : 'YSACC CO., LTD.'}</span>
                            <span><strong>일자:</strong> {new Date().toISOString().split('T')[0]}</span>
                          </div>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginTop: '5px' }}>
                            <thead>
                              <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                                <th style={{ padding: '6px', textAlign: 'left' }}>품목명</th>
                                <th style={{ padding: '6px', textAlign: 'center' }}>규격</th>
                                <th style={{ padding: '6px', textAlign: 'right' }}>수량</th>
                                <th style={{ padding: '6px', textAlign: 'right' }}>단가</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((it, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '6px' }}>{it.name}</td>
                                  <td style={{ padding: '6px', textAlign: 'center' }}>{it.grade || '-'}</td>
                                  <td style={{ padding: '6px', textAlign: 'right' }}>{it.qty?.toLocaleString()} {it.unit}</td>
                                  <td style={{ padding: '6px', textAlign: 'right' }}>{it.currency === 'KRW' ? '₩' : '$'}{it.unitPrice?.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 3. 공급사별 납기 결정 */}
          {activeStep === '공급사별 납기 결정' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                📅 각 공급업체별 생산완료일(납기일) 지정
              </div>
              {Object.keys(groupedSupplierItems).length === 0 ? (
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>공급업체가 없습니다.</span>
              ) : (
                Object.keys(groupedSupplierItems).map(supplier => {
                  const prodDate = basicForm.supplierProductionDates[supplier] || '';
                  return (
                    <div key={supplier} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>{supplier}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12.5px', color: '#64748b' }}>생산완료일:</span>
                        <input 
                          type="date" 
                          value={prodDate}
                          disabled={!isEditing}
                          onChange={e => {
                            const val = e.target.value;
                            setBasicForm(prev => ({
                              ...prev,
                              supplierProductionDates: {
                                ...prev.supplierProductionDates,
                                [supplier]: val
                              }
                            }));
                          }}
                          style={{ padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px' }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '12px', borderTop: '1px solid #cbd5e1', paddingTop: '12px', maxWidth: '300px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>화물준비일</span>
                <input 
                  type="date" 
                  value={basicForm.cargoReadyDate} 
                  onChange={e => setBasicForm(p => ({ ...p, cargoReadyDate: e.target.value }))} 
                  disabled={!isEditing} 
                  style={inputStyle(isEditing)} 
                />
              </div>
            </div>
          )}

          {/* 4. 선적&진행현황 */}
          {activeStep === '선적&진행현황' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>지정 포워더(Forwarder)</span>
                <input type="text" value={basicForm.forwarderConfirmed} onChange={e => setBasicForm(p => ({ ...p, forwarderConfirmed: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 현대글로비스" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>포워더 견적금액 (KRW)</span>
                <input type="number" value={basicForm.forwarderQuotationAmount || ''} onChange={e => setBasicForm(p => ({ ...p, forwarderQuotationAmount: parseFloat(e.target.value) || 0 }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="원화 견적 금액" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>Vessel 확정 (선박명/항차)</span>
                <input type="text" value={basicForm.vesselBooking} onChange={e => setBasicForm(p => ({ ...p, vesselBooking: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: HYUNDAI TOKYO V.024E" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>컨테이너 작업장소</span>
                {isEditing ? (
                  <select value={basicForm.containerWorkspaceType} onChange={e => setBasicForm(p => ({ ...p, containerWorkspaceType: e.target.value as any }))} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '100%' }}>
                    <option value="">선택사항</option>
                    <option value="CFS">CFS 작업</option>
                    <option value="Door">Door 작업</option>
                  </select>
                ) : (
                  <input type="text" value={basicForm.containerWorkspaceType === 'CFS' ? 'CFS 작업' : basicForm.containerWorkspaceType === 'Door' ? 'Door 작업' : '-'} disabled style={inputStyle(false)} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>컨테이너(CFS)입고일</span>
                <input type="date" value={basicForm.cfsEntryDate} onChange={e => setBasicForm(p => ({ ...p, cfsEntryDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
              </div>
              {basicForm.containerWorkspaceType === 'CFS' && (
                <div style={{ gridColumn: 'span 2', display: 'grid', gridTemplateColumns: '1fr', gap: '14px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>CFS 주소 및 정보</span>
                    <input type="text" style={inputStyle(isEditing)} value={basicForm.cfsAddress} onChange={e => setBasicForm(p => ({ ...p, cfsAddress: e.target.value }))} disabled={!isEditing} placeholder="주소 및 담당자 정보" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. 선적서류 작성 및 수출신고 */}
          {activeStep === '선적서류 작성 및 수출신고' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
              {renderFileField('CI (Commercial Invoice) 유첨', 'ciFiles', 'ci-file-input')}
              {renderFileField('PL (Packing List) 유첨', 'plFiles', 'pl-file-input')}
              {renderFileField('COO (원산지증명서) 유첨', 'cooFiles', 'coo-file-input')}
              {renderFileField('B/L (선하증권) 유첨', 'blFiles', 'bl-file-input')}
              <div style={{ gridColumn: 'span 2' }}>
                {renderFileField('그밖의 서류 유첨', 'otherFiles', 'other-docs-input')}
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>수출신고번호</span>
                <input type="text" value={basicForm.exportDeclarationNo} onChange={e => setBasicForm(p => ({ ...p, exportDeclarationNo: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 010-22-19-1234567" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>인보이스 송부 일자</span>
                <input type="date" value={basicForm.ciPlSentDate} onChange={e => setBasicForm(p => ({ ...p, ciPlSentDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>수출면장 기준환율</span>
                <input type="number" step="0.01" value={basicForm.customsExchangeRate || ''} onChange={e => setBasicForm(p => ({ ...p, customsExchangeRate: parseFloat(e.target.value) || 0 }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 1352.50" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>쇼링/적재 현황</span>
                <input type="text" value={basicForm.containerWorkStatus} onChange={e => setBasicForm(p => ({ ...p, containerWorkStatus: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 적재완료" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>서류마감 여부</span>
                {isEditing ? (
                  <select value={basicForm.shipmentCompleted} onChange={e => setBasicForm(p => ({ ...p, shipmentCompleted: e.target.value as any }))} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', width: '100%' }}>
                    <option value="">선택사항</option>
                    <option value="N">미완료 (N)</option>
                    <option value="Y">마감완료 (Y)</option>
                  </select>
                ) : (
                  <input type="text" value={basicForm.shipmentCompleted === 'Y' ? '마감완료 (Y)' : basicForm.shipmentCompleted === 'N' ? '미완료 (N)' : '-'} disabled style={inputStyle(false)} />
                )}
              </div>
            </div>
          )}

          {/* 6. 공급사 세금계산서 및 결제 */}
          {activeStep === '공급사 세금계산서 및 결제' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                📝 공급업체별 결제 및 구매확인서 현황
              </div>
              {Object.keys(groupedSupplierItems).length === 0 ? (
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>공급업체가 없습니다.</span>
              ) : (
                Object.keys(groupedSupplierItems).map(supplier => {
                  const payment = basicForm.supplierPayments[supplier] || { status: '미결제', date: '' };
                  const taxInv = basicForm.supplierTaxInvoice[supplier] || '';
                  const cert = basicForm.supplierPurchaseCertificate[supplier] || '';
                  return (
                    <div key={supplier} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontWeight: 800, fontSize: '13px', color: '#1e3a8a', borderBottom: '1px dashed #cbd5e1', paddingBottom: '4px' }}>{supplier}</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>세금계산서</span>
                          {isEditing ? (
                            <select value={taxInv} onChange={e => setBasicForm(prev => ({ ...prev, supplierTaxInvoice: { ...prev.supplierTaxInvoice, [supplier]: e.target.value as any } }))} style={{ padding: '4px', fontSize: '12px' }}>
                              <option value="">선택</option>
                              <option value="Y">발행완료</option>
                              <option value="N">미발행</option>
                            </select>
                          ) : (
                            <span style={{ fontSize: '12.5px', fontWeight: 600, color: taxInv === 'Y' ? '#059669' : '#dc2626' }}>{taxInv === 'Y' ? '발행완료' : '미발행'}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>결제상태</span>
                          {isEditing ? (
                            <select value={payment.status} onChange={e => setBasicForm(prev => ({ ...prev, supplierPayments: { ...prev.supplierPayments, [supplier]: { ...payment, status: e.target.value } } }))} style={{ padding: '4px', fontSize: '12px' }}>
                              <option value="미결제">미결제</option>
                              <option value="일부결제">일부결제</option>
                              <option value="결제완료">결제완료</option>
                            </select>
                          ) : (
                            <span style={{ fontSize: '12.5px', fontWeight: 600, color: payment.status === '결제완료' ? '#059669' : '#d97706' }}>{payment.status}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontSize: '11px', color: '#64748b' }}>구매확인서</span>
                          {isEditing ? (
                            <select value={cert} onChange={e => setBasicForm(prev => ({ ...prev, supplierPurchaseCertificate: { ...prev.supplierPurchaseCertificate, [supplier]: e.target.value as any } }))} style={{ padding: '4px', fontSize: '12px' }}>
                              <option value="">선택</option>
                              <option value="Y">발행완료</option>
                              <option value="N">미발행</option>
                            </select>
                          ) : (
                            <span style={{ fontSize: '12.5px', fontWeight: 600, color: cert === 'Y' ? '#059669' : '#dc2626' }}>{cert === 'Y' ? '발행완료' : '미발행'}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* 7. 선적서류 발송 및 은행제출 */}
          {activeStep === '선적서류 발송 및 은행제출' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>선적 서류 발송</span>
                {isEditing ? (
                  <select value={basicForm.shippingDocsSentStatus} onChange={e => setBasicForm(p => ({ ...p, shippingDocsSentStatus: e.target.value as any }))} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}>
                    <option value="">선택사항</option>
                    <option value="N">미발송</option>
                    <option value="Y">발송완료</option>
                  </select>
                ) : (
                  <input type="text" value={basicForm.shippingDocsSentStatus === 'Y' ? '발송완료 (Y)' : '미발송 (N)'} disabled style={inputStyle(false)} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>발송 일자</span>
                <input type="date" value={basicForm.shippingDocsSentDate} onChange={e => setBasicForm(p => ({ ...p, shippingDocsSentDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>은행 네고 제출</span>
                {isEditing ? (
                  <select value={basicForm.bankSubmissionStatus} onChange={e => setBasicForm(p => ({ ...p, bankSubmissionStatus: e.target.value as any }))} style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}>
                    <option value="">선택사항</option>
                    <option value="N">미제출</option>
                    <option value="Y">제출완료</option>
                  </select>
                ) : (
                  <input type="text" value={basicForm.bankSubmissionStatus === 'Y' ? '제출완료 (Y)' : '미제출 (N)'} disabled style={inputStyle(false)} />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>은행 네고 제출 일자</span>
                <input type="date" value={basicForm.bankSubmissionDate} onChange={e => setBasicForm(p => ({ ...p, bankSubmissionDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>Tracking 번호</span>
                <input type="text" value={basicForm.shippingDocsTrackingNo} onChange={e => setBasicForm(p => ({ ...p, shippingDocsTrackingNo: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="DHL 등 번호" />
              </div>
            </div>
          )}

          {/* 8. 이익계산 */}
          {activeStep === '이익계산' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(() => {
                const customsRate = basicForm.customsExchangeRate || piData?.exchangeRate || 1350;
                const revenueUsd = piData?.totalUsd || 0;
                const revenueKrw = piData?.totalKrw || 0;
                const consolidatedRevenueKrw = Math.round((revenueUsd * customsRate) + revenueKrw);

                const purchaseUsd = order.items?.filter(it => it.currency !== 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
                const purchaseKrw = order.items?.filter(it => it.currency === 'KRW').reduce((sum, it) => sum + (it.amount || 0), 0) || 0;
                const consolidatedPurchaseKrw = Math.round((purchaseUsd * customsRate) + purchaseKrw);

                const forwarderExpenseKrw = basicForm.forwarderQuotationAmount || 0;
                const totalCostKrw = consolidatedPurchaseKrw + forwarderExpenseKrw;
                const profitKrw = consolidatedRevenueKrw - totalCostKrw;
                const profitMargin = consolidatedRevenueKrw > 0 ? ((profitKrw / consolidatedRevenueKrw) * 100).toFixed(2) : '0.00';

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', background: '#f8fafc' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>총 매출액 (PI)</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', marginTop: '6px' }}>₩{consolidatedRevenueKrw.toLocaleString()} KRW</div>
                      </div>
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px', background: '#f8fafc' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>총 비용 (원가)</div>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: '#991b1b', marginTop: '6px' }}>₩{totalCostKrw.toLocaleString()} KRW</div>
                      </div>
                      <div style={{ border: '1px solid #1e3a8a', borderRadius: '6px', padding: '10px', background: '#eff6ff' }}>
                        <div style={{ fontSize: '11px', color: '#1e3a8a', fontWeight: 700 }}>예상 순이익 (마진)</div>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: '#1e3a8a', marginTop: '5px' }}>₩{profitKrw.toLocaleString()} KRW ({profitMargin}%)</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '300px', marginTop: '12px', borderTop: '1px solid #cbd5e1', paddingTop: '12px' }}>
                      <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>대금 영수 일자</span>
                      <input type="date" value={basicForm.paymentCollectedDate} onChange={e => setBasicForm(p => ({ ...p, paymentCollectedDate: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} />
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        </div>

      {/* Bottom Section: 품목 명세 요약 상시 노출 */}
      {(activeStep === 'ORDER기본정보' || activeStep === '발주서 발행') && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '24px', marginTop: '24px' }}>
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', display: 'block', marginBottom: '14px' }}>
            📦 수주 품목 명세 요약 (상시 노출)
          </span>
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
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', borderTop: '2px solid #e2e8f0', paddingTop: '15px', marginTop: '15px' }}>
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
