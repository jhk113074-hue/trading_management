import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, setDoc, serverTimestamp, deleteDoc, collection } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, COMPANY_ID, storage } from '../firebase';
import type { Order, OrderItem } from '../types/order';
import type { Supplier } from '../types/supplier';

const steps = ["발주", "선적관리", "이익관리"] as const;

export const OrderDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState<typeof steps[number]>("발주");
  const isEditing = true;
  const [uploadingField, setUploadingField] = useState<'ciFiles' | 'plFiles' | 'cooFiles' | 'blFiles' | 'otherFiles' | null>(null);
  const [supplierSubTab, setSupplierSubTab] = useState<'tax' | 'cert' | 'pay'>('tax');
  const [uploadingCertSupplier, setUploadingCertSupplier] = useState<string | null>(null);
  const [piData, setPiData] = useState<any | null>(null);
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'companies', COMPANY_ID, 'suppliers'), (snapshot) => {
      const list: Supplier[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Supplier);
      });
      setSuppliersList(list);
    });
    return () => unsubscribe();
  }, []);

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
    supplierTaxTypes: {} as Record<string, '영세' | '과세'>,
    supplierTaxInvoiceDetails: {} as Record<string, { date: string; invoiceNo: string; }>,
    supplierPurchaseCertFiles: {} as Record<string, Array<{ name: string; url: string; size: number; path: string }>>,
    supplierPaymentInstallments: {} as Record<string, Array<{ date: string; amount: number; }>>,
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
          const mappedStatus = data.status === '주문' ? '발주' : data.status;
          setActiveStep(mappedStatus as any);
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
          supplierTaxTypes: data.supplierTaxTypes || {},
          supplierTaxInvoiceDetails: data.supplierTaxInvoiceDetails || {},
          supplierPurchaseCertFiles: data.supplierPurchaseCertFiles || {},
          supplierPaymentInstallments: data.supplierPaymentInstallments || {},
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
  }, [id, navigate]);

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

  // Switch active tab view locally
  const handleStepClick = (stepName: typeof steps[number]) => {
    setActiveStep(stepName);
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
        supplierTaxTypes: basicForm.supplierTaxTypes,
        supplierTaxInvoiceDetails: basicForm.supplierTaxInvoiceDetails,
        supplierPurchaseCertFiles: basicForm.supplierPurchaseCertFiles,
        supplierPaymentInstallments: basicForm.supplierPaymentInstallments,
        bankSubmissionStatus: basicForm.bankSubmissionStatus,
        
        items: order.items,
        
        updatedAt: serverTimestamp()
      }, { merge: true });

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

  const handleSupplierCertUpload = async (file: File, supplierName: string) => {
    if (!order) return;
    setUploadingCertSupplier(supplierName);
    try {
      const uniqueFileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `tasks/${order.id}/cert_${supplierName}/${uniqueFileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, () => resolve());
      });

      const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
      const newFile = {
        name: file.name,
        url: downloadUrl,
        size: file.size,
        path: uploadTask.snapshot.ref.fullPath
      };

      setBasicForm(prev => {
        const currentFiles = prev.supplierPurchaseCertFiles[supplierName] || [];
        return {
          ...prev,
          supplierPurchaseCertFiles: {
            ...prev.supplierPurchaseCertFiles,
            [supplierName]: [...currentFiles, newFile]
          }
        };
      });
      alert('✅ 구매확인서 파일이 성공적으로 업로드되었습니다.');
    } catch (err: any) {
      alert('❌ 업로드 실패: ' + err.message);
    } finally {
      setUploadingCertSupplier(null);
    }
  };

  const handleDeleteSupplierCertFile = (supplierName: string, idx: number) => {
    if (!window.confirm('이 파일을 삭제하시겠습니까?')) return;
    setBasicForm(prev => {
      const currentFiles = prev.supplierPurchaseCertFiles[supplierName] || [];
      const updated = currentFiles.filter((_, i) => i !== idx);
      return {
        ...prev,
        supplierPurchaseCertFiles: {
          ...prev.supplierPurchaseCertFiles,
          [supplierName]: updated
        }
      };
    });
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



  // Grouped Supplier PO Print handler
  const handlePrintSupplierPo = (supplierName: string, items: OrderItem[]) => {
    if (!order) return;
    const taxType = basicForm.supplierTaxTypes[supplierName] || '과세';
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
                const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                const rawAmt = price * (it.qty || 0);
                const vatAmt = taxType === '영세' ? 0 : (isKrw ? Math.round(rawAmt * 0.1) : parseFloat((rawAmt * 0.1).toFixed(2)));
                return `
                  <tr>
                    <td><strong>${it.name}</strong></td>
                    <td class="center">${it.grade || '-'}</td>
                    <td class="right">${(it.qty || 0).toLocaleString()}</td>
                    <td class="right">${currencySymbol}${price.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })}</td>
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
                    const usdSub = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => {
                      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                      return sum + price * (it.qty || 0);
                    }, 0);
                    const krwSub = items.filter(it => it.currency === 'KRW').reduce((sum, it) => {
                      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                      return sum + price * (it.qty || 0);
                    }, 0);
                    const parts = [];
                    if (usdSub > 0) parts.push(`$${usdSub.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                    if (krwSub > 0) parts.push(`${krwSub.toLocaleString()}`);
                    return parts.join(' / ');
                  })()}
                </td>
                <td class="right">
                  ${(() => {
                    const usdTotal = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => {
                      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                      return sum + price * (it.qty || 0);
                    }, 0);
                    const krwTotal = items.filter(it => it.currency === 'KRW').reduce((sum, it) => {
                      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                      return sum + price * (it.qty || 0);
                    }, 0);
                    const usdVat = taxType === '영세' ? 0 : parseFloat((usdTotal * 0.1).toFixed(2));
                    const krwVat = taxType === '영세' ? 0 : Math.round(krwTotal * 0.1);
                    const parts = [];
                    if (usdTotal > 0) parts.push(`$${usdVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
                    if (krwTotal > 0) parts.push(`${krwVat.toLocaleString()}`);
                    return parts.join(' / ');
                  })()}
                </td>
                <td class="right" style="color: #dc2626;">
                  ${(() => {
                    const usdTotal = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => {
                      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                      return sum + price * (it.qty || 0);
                    }, 0);
                    const krwTotal = items.filter(it => it.currency === 'KRW').reduce((sum, it) => {
                      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                      return sum + price * (it.qty || 0);
                    }, 0);
                    const usdVat = taxType === '영세' ? 0 : parseFloat((usdTotal * 0.1).toFixed(2));
                    const krwVat = taxType === '영세' ? 0 : Math.round(krwTotal * 0.1);
                    const usdGrand = usdTotal + usdVat;
                    const krwGrand = krwTotal + krwVat;
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
              <li>세금계산서는 ${taxType === '영세' ? '영세율 전자세금계산서' : '일반 전자세금계산서'} 발급조건입니다.</li>
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

  const handleEmailSupplierPo = (supplierName: string, items: OrderItem[]) => {
    if (!order) return;
    const cleanSupplierName = supplierName.replace(/\s+/g, '');
    const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
    const poNum = `${order.id}-${supplierCode}`;

    const email = prompt("발송할 공급업체 이메일 주소를 입력해주세요:", "");
    if (email === null) return; // User cancelled

    const subject = encodeURIComponent(`[발주서] PO No: ${poNum} (${order.issuingCompany === 'YS' ? 'YS ACC' : 'YSACC CO., LTD.'})`);
    
    const itemsText = items.map(it => {
      const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
      const currencySymbol = it.currency === 'KRW' ? '₩' : '$';
      const spec = it.grade ? ` / 규격: ${it.grade}` : '';
      return `- 품명: ${it.name}${spec} / 수량: ${it.qty?.toLocaleString()} ${it.unit} / 단가: ${currencySymbol}${price.toLocaleString()}`;
    }).join('\n');

    const body = encodeURIComponent(
      `안녕하세요,\n\n` +
      `${supplierName} 담당자님 귀하,\n\n` +
      `아래와 같이 발주서를 전달해 드립니다.\n\n` +
      `- 발주번호: ${poNum}\n` +
      `- 발주일자: ${new Date().toISOString().split('T')[0]}\n\n` +
      `[발주 내역]\n` +
      `${itemsText}\n\n` +
      `자세한 내용은 본 이메일 혹은 시스템에 접속하여 첨부된 발주서(PDF)를 참조해 주시기 바랍니다.\n` +
      `감사합니다.\n` +
      `\n` +
      `${order.issuingCompany === 'YS' ? '영성에이씨씨' : '(주)와이에스에이씨씨'} 대표이사 김주한`
    );

    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={handleSaveBasic}
            style={{ background: '#10b981', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
          >
            💾 변경사항 저장
          </button>
          <button 
            onClick={handleDeleteOrder}
            style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
          >
            ❌ PO 삭제 및 발주 취소
          </button>
        </div>
      </div>

      {/* Tab Menu */}
      <div style={{ display: 'flex', gap: '6px', padding: '4px 0', borderBottom: '1px solid #e2e8f0' }}>
        {steps.map((step) => {
          const isCurrent = step === activeStep;
          return (
            <button
              key={step}
              onClick={() => handleStepClick(step)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                border: isCurrent ? '1px solid #2563eb' : '1px solid #cbd5e1',
                background: isCurrent ? '#2563eb' : '#f8fafc',
                color: isCurrent ? '#fff' : '#64748b',
                fontWeight: isCurrent ? 700 : 500,
                fontSize: '12.5px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                boxShadow: isCurrent ? '0 2px 4px rgba(37, 99, 235, 0.2)' : 'none'
              }}
            >
              {step}
            </button>
          );
        })}
      </div>

      {/* Top Panel: PI Info & CI, Items Summary (Consolidated) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '16px', alignItems: 'stretch' }}>
        
        {/* Left: Consolidated Order Information */}
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px' }}>📦</span>
              <span style={{ fontWeight: 800, fontSize: '13px', color: '#1e3a8a' }}>주문 기본 정보</span>
            </div>
            {piData && (
              <div style={{ fontSize: '11.5px', color: '#475569' }}>
                <strong style={{ color: '#0f172a' }}>PI: {piData.piNumber}</strong> | <span style={{ fontSize: '11px' }}>고객사: {piData.customerName}</span> | <strong style={{ color: '#2563eb' }}>${(piData.totalUsd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD</strong>
              </div>
            )}
          </div>

          {/* Form Fields Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>발행사 (발주서 기준)</span>
              {isEditing ? (
                <select value={basicForm.issuingCompany} onChange={e => setBasicForm(prev => ({ ...prev, issuingCompany: e.target.value as 'YSACC' | 'YS' }))} style={{ padding: '4px 6px', border: '2px solid #3b82f6', borderRadius: '5px', fontSize: '11.5px', fontWeight: 700, background: '#eff6ff', outline: 'none' }}>
                  <option value="YSACC">YSACC (와이에스에이씨씨)</option>
                  <option value="YS">영성ACC (YS ACC)</option>
                </select>
              ) : (
                <input type="text" value={order.issuingCompany === 'YS' ? '영성ACC (YS ACC)' : 'YSACC (와이에스에이씨씨)'} disabled style={{ ...inputStyle(false), padding: '4px 6px', fontSize: '11.5px' }} />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>고객사 PO 번호</span>
              <input type="text" value={basicForm.custPo} onChange={e => setBasicForm(prev => ({ ...prev, custPo: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>PO 접수일</span>
              <input type="date" value={basicForm.poDate} onChange={e => setBasicForm(prev => ({ ...prev, poDate: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>인코텀즈</span>
              {isEditing ? (
                <select value={basicForm.incoterms} onChange={e => setBasicForm(prev => ({ ...prev, incoterms: e.target.value as any }))} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', outline: 'none' }}>
                  <option value="FOB">FOB</option>
                  <option value="CIF HCM">CIF HCM</option>
                  <option value="EXW">EXW</option>
                  <option value="CFR">CFR</option>
                  <option value="DAP">DAP</option>
                  <option value="DDP">DDP</option>
                </select>
              ) : (
                <input type="text" value={order.incoterms} disabled style={{ ...inputStyle(false), padding: '4px 6px', fontSize: '11.5px' }} />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>결제 조건</span>
              <input type="text" value={basicForm.paymentTerms} onChange={e => setBasicForm(prev => ({ ...prev, paymentTerms: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>L/C 거래 여부</span>
              {isEditing ? (
                <select value={basicForm.isLc} onChange={e => setBasicForm(prev => ({ ...prev, isLc: e.target.value as any }))} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', outline: 'none' }}>
                  <option value="">선택사항 (기본 T/T)</option>
                  <option value="Y">L/C 거래 (Y)</option>
                  <option value="N">T/T 거래 (N)</option>
                </select>
              ) : (
                <input type="text" value={basicForm.isLc === 'Y' ? 'L/C 거래 (Y)' : basicForm.isLc === 'N' ? 'T/T 거래 (N)' : '일반 거래'} disabled style={{ ...inputStyle(false), padding: '4px 6px', fontSize: '11.5px' }} />
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>담당 영업사원</span>
              <input type="text" value={basicForm.manager} onChange={e => setBasicForm(prev => ({ ...prev, manager: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>요청 납기일</span>
              <input type="date" value={basicForm.requestedDelivery} onChange={e => setBasicForm(prev => ({ ...prev, requestedDelivery: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>확정 CI 번호</span>
              <input
                type="text"
                placeholder="CI 번호 입력"
                value={basicForm.ciNumber}
                onChange={e => setBasicForm(p => ({ ...p, ciNumber: e.target.value }))}
                style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: '#fff', outline: 'none' }}
              />
            </div>

            {basicForm.isLc === 'Y' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 3' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>L/C 번호</span>
                <input type="text" value={basicForm.lcNo} onChange={e => setBasicForm(prev => ({ ...prev, lcNo: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', outline: 'none' }} placeholder="L/C 번호 입력" />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', gridColumn: 'span 3' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#4b5563' }}>비고 (Remarks)</span>
              <textarea rows={1} value={basicForm.remark} onChange={e => setBasicForm(prev => ({ ...prev, remark: e.target.value }))} disabled={!isEditing} style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '11.5px', background: isEditing ? '#fff' : '#f8fafc', resize: 'vertical', outline: 'none' }} />
            </div>
          </div>
        </div>

        {/* Right: 수주품목 명세요약 또는 운송비/컨테이너 정보 및 비용 */}
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {activeStep === '선적관리' ? (
            <>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>🚚 운송비 & 컨테이너 정보 요약</div>
              <div style={{ overflowY: 'auto', maxHeight: '220px', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>구분</th>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>상세 정보</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '130px' }}>비용 (KRW)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: '#4b5563' }}>지정 포워더</td>
                      <td style={{ padding: '6px 8px', color: '#0f172a' }}>{basicForm.forwarderConfirmed || '-'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                        ₩{(basicForm.forwarderQuotationAmount || 0).toLocaleString()}
                      </td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: '#4b5563' }}>Vessel 선박/항차</td>
                      <td style={{ padding: '6px 8px', color: '#0f172a' }} colSpan={2}>{basicForm.vesselBooking || '-'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: '#4b5563' }}>컨테이너 볼륨/수량</td>
                      <td style={{ padding: '6px 8px', color: '#0f172a' }} colSpan={2}>{basicForm.containerVolumeQuantities || '-'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: '#4b5563' }}>작업 장소</td>
                      <td style={{ padding: '6px 8px', color: '#0f172a' }} colSpan={2}>
                        {basicForm.containerWorkspaceType ? `${basicForm.containerWorkspaceType} 작업` : '-'}
                      </td>
                    </tr>
                    {basicForm.containerWorkspaceType === 'CFS' && (
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: '#4b5563' }}>CFS 입고일 / 주소</td>
                        <td style={{ padding: '6px 8px', color: '#0f172a' }} colSpan={2}>
                          {basicForm.cfsEntryDate ? `${basicForm.cfsEntryDate} / ` : ''}{basicForm.cfsAddress || '-'}
                        </td>
                      </tr>
                    )}
                    {/* Proforma Invoice 해상운임 (freightCharges) 정보 */}
                    {piData && piData.freightCharges && piData.freightCharges.length > 0 && (
                      <>
                        <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', borderBottom: '1px solid #cbd5e1' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1e3a8a' }} colSpan={2}>🚢 PI 해상운임 (Freight Charges)</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#1e3a8a' }}>USD</td>
                        </tr>
                        {piData.freightCharges.map((fc: any, fcIdx: number) => (
                          <tr key={fcIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 8px', color: '#475569', fontWeight: 500 }}>{fc.type || fc.name}</td>
                            <td style={{ padding: '6px 8px', color: '#0f172a' }}>{fc.qty} x ${fc.price?.toLocaleString()} {fc.remarks ? `(${fc.remarks})` : ''}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                              ${((fc.qty || 0) * (fc.price || 0)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                        <tr style={{ background: '#eff6ff', fontWeight: 700, borderTop: '1px solid #cbd5e1' }}>
                          <td style={{ padding: '6px 8px', color: '#1d4ed8' }} colSpan={2}>PI 해상운임 합계</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1d4ed8' }}>
                            ${(piData.freightTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>📋 수주품목 명세요약</div>
              <div style={{ overflowY: 'auto', maxHeight: '220px', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                      <th style={{ padding: '6px 8px', textAlign: 'left' }}>품목명</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '80px' }}>수량</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '100px' }}>단가</th>
                      <th style={{ padding: '6px 8px', textAlign: 'right', width: '110px' }}>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items && order.items.length > 0 ? (
                      <>
                        {order.items.map((it, idx) => {
                          const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                          const totalAmt = price * (it.qty || 0);
                          return (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '6px 8px', fontWeight: 600, color: '#334155' }} title={it.name}>{it.name}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{it.qty?.toLocaleString()} {it.unit}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{it.currency === 'KRW' ? '₩' : '$'}{price?.toLocaleString()}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{it.currency === 'KRW' ? '₩' : '$'}{totalAmt?.toLocaleString()}</td>
                            </tr>
                          );
                        })}
                        {basicForm.forwarderQuotationAmount > 0 && (
                          <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <td style={{ padding: '6px 8px', fontWeight: 600, color: '#0284c7' }}>🚚 운송비 (컨테이너비)</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>1 식</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>₩{basicForm.forwarderQuotationAmount.toLocaleString()}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>₩{basicForm.forwarderQuotationAmount.toLocaleString()}</td>
                          </tr>
                        )}
                      </>
                    ) : (
                      <>
                        {basicForm.forwarderQuotationAmount > 0 ? (
                          <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                            <td style={{ padding: '6px 8px', fontWeight: 600, color: '#0284c7' }}>🚚 운송비 (컨테이너비)</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>1 식</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>₩{basicForm.forwarderQuotationAmount.toLocaleString()}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#0284c7' }}>₩{basicForm.forwarderQuotationAmount.toLocaleString()}</td>
                          </tr>
                        ) : (
                          <tr>
                            <td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>등록된 수주 품목이 없습니다.</td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </>
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
          </div>
          {/* Render corresponding form/contents based on activeStep */}

          {/* 2. 발주 */}
          {activeStep === '발주' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {Object.keys(groupedSupplierItems).length === 0 ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>발주할 공급업체가 없습니다.</div>
                ) : (
                  Object.entries(groupedSupplierItems).map(([supplierName, items]) => {
                    const cleanSupplierName = supplierName.replace(/\s+/g, '');
                    const supplierCode = cleanSupplierName.substring(0, 3).toUpperCase();
                    const poNum = `${order.id}-${supplierCode}`;

                    return (
                      <div key={supplierName} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.03)', marginBottom: '8px' }}>
                        <div style={{ background: '#f8fafc', padding: '10px 16px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '13px' }}>📄 {supplierName} PO ({poNum})</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px' }}>
                              <span style={{ fontWeight: 600, color: '#4b5563' }}>세율:</span>
                              <select
                                value={basicForm.supplierTaxTypes[supplierName] || '과세'}
                                onChange={(e) => {
                                  const val = e.target.value as '영세' | '과세';
                                  setBasicForm(prev => ({
                                    ...prev,
                                    supplierTaxTypes: {
                                      ...prev.supplierTaxTypes,
                                      [supplierName]: val
                                    }
                                  }));
                                }}
                                style={{ padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '11.5px', fontWeight: 600, outline: 'none' }}
                              >
                                <option value="과세">과세 (10%)</option>
                                <option value="영세">영세 (0%)</option>
                              </select>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button 
                              onClick={() => handlePrintSupplierPo(supplierName, items)}
                              style={{ padding: '5px 10px', background: '#3b82f6', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                            >
                              🖨️ 인쇄 / PDF
                            </button>
                            <button 
                              onClick={() => handleEmailSupplierPo(supplierName, items)}
                              style={{ padding: '5px 10px', background: '#10b981', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                            >
                              ✉️ 이메일 발송
                            </button>
                          </div>
                        </div>
                        <div style={{ padding: '12px 16px', background: '#fff', fontSize: '12px' }}>
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
                                <th style={{ padding: '6px', textAlign: 'right' }}>단가(견적시-가지고옴)</th>
                                <th style={{ padding: '6px', textAlign: 'right', width: '160px' }}>단가(실구매가-수정가능)</th>
                                <th style={{ padding: '6px', textAlign: 'right' }}>총액(실구매가*수량)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((it, idx) => {
                                const purchasePrice = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                                const totalPurchaseAmount = purchasePrice * (it.qty || 0);
                                return (
                                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '6px' }}>{it.name}</td>
                                    <td style={{ padding: '6px', textAlign: 'center' }}>{it.grade || '-'}</td>
                                    <td style={{ padding: '6px', textAlign: 'right' }}>{it.qty?.toLocaleString()} {it.unit}</td>
                                    <td style={{ padding: '6px', textAlign: 'right' }}>{it.currency === 'KRW' ? '₩' : '$'}{it.unitPrice?.toLocaleString()}</td>
                                    <td style={{ padding: '6px', textAlign: 'right' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                                        <span>{it.currency === 'KRW' ? '₩' : '$'}</span>
                                        <input
                                          type="number"
                                          step="any"
                                          value={it.purchaseUnitPrice ?? it.unitPrice}
                                          disabled={!isEditing}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value) || 0;
                                            setOrder(prev => {
                                              if (!prev) return prev;
                                              const updatedItems = prev.items.map(item => {
                                                if (item.itemId === it.itemId) {
                                                  return { ...item, purchaseUnitPrice: val };
                                                }
                                                return item;
                                              });
                                              return { ...prev, items: updatedItems };
                                            });
                                          }}
                                          style={{
                                            width: '90px',
                                            padding: '3px 6px',
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            textAlign: 'right'
                                          }}
                                        />
                                      </div>
                                    </td>
                                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 700 }}>
                                      {it.currency === 'KRW' ? '₩' : '$'}{totalPurchaseAmount.toLocaleString(undefined, it.currency === 'KRW' ? {} : { minimumFractionDigits: 2 })}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        {/* 생산완료일 지정 영역을 카드 하단에 병합 */}
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', background: '#f8fafc', padding: '8px 16px', borderTop: '1px solid #cbd5e1' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 600, fontSize: '11.5px', color: '#4b5563' }}>생산완료일(납기일):</span>
                            <input 
                              type="date"
                              value={basicForm.supplierProductionDates[supplierName] || ''}
                              disabled={!isEditing}
                              onChange={e => {
                                const val = e.target.value;
                                setBasicForm(prev => {
                                  const newDates = {
                                    ...prev.supplierProductionDates,
                                    [supplierName]: val
                                  };
                                  const activeDates = Object.values(newDates).filter(d => !!d);
                                  const maxDate = activeDates.length > 0 
                                    ? activeDates.reduce((max, cur) => cur > max ? cur : max) 
                                    : prev.cargoReadyDate;
                                  return {
                                    ...prev,
                                    supplierProductionDates: newDates,
                                    cargoReadyDate: maxDate
                                  };
                                });
                              }}
                              style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11.5px' }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              
              {/* 화물준비일 지정 영역 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginTop: '4px', background: '#f0fdf4', padding: '10px 16px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534' }}>최종 화물준비일 (생산완료일 기준 자동 계산 또는 수동 설정):</span>
                <input 
                  type="date" 
                  value={basicForm.cargoReadyDate || ''} 
                  onChange={e => setBasicForm(p => ({ ...p, cargoReadyDate: e.target.value }))} 
                  disabled={!isEditing} 
                  style={{ padding: '5px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: isEditing ? '#fff' : '#f8fafc' }} 
                />
              </div>

              {/* 6. 공급사 관리 서브메뉴 (세금계산서/구매확인서/결제) */}
              <div style={{ borderTop: '2px dashed #cbd5e1', paddingTop: '20px', marginTop: '20px' }}>
                {/* Sub Tab Buttons */}
                <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px', marginBottom: '16px' }}>
                  <button
                    type="button"
                    onClick={() => setSupplierSubTab('tax')}
                    style={{
                      padding: '8px 16px',
                      background: supplierSubTab === 'tax' ? '#1e3a8a' : '#fff',
                      color: supplierSubTab === 'tax' ? '#fff' : '#475569',
                      border: '1px solid ' + (supplierSubTab === 'tax' ? '#1e3a8a' : '#cbd5e1'),
                      borderRadius: '6px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    📄 1. 세금계산서 발행
                  </button>
                  <button
                    type="button"
                    onClick={() => setSupplierSubTab('cert')}
                    style={{
                      padding: '8px 16px',
                      background: supplierSubTab === 'cert' ? '#1e3a8a' : '#fff',
                      color: supplierSubTab === 'cert' ? '#fff' : '#475569',
                      border: '1px solid ' + (supplierSubTab === 'cert' ? '#1e3a8a' : '#cbd5e1'),
                      borderRadius: '6px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    📑 2. 구매확인서 발행
                  </button>
                  <button
                    type="button"
                    onClick={() => setSupplierSubTab('pay')}
                    style={{
                      padding: '8px 16px',
                      background: supplierSubTab === 'pay' ? '#1e3a8a' : '#fff',
                      color: supplierSubTab === 'pay' ? '#fff' : '#475569',
                      border: '1px solid ' + (supplierSubTab === 'pay' ? '#1e3a8a' : '#cbd5e1'),
                      borderRadius: '6px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    💳 3. 결제 관리
                  </button>
                </div>

                {/* Sub Tab 1: 세금계산서 발행 */}
                {supplierSubTab === 'tax' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>각 업체별 세금계산서 발행일과 국세청 승인(발급)번호를 입력합니다.</div>
                    {Object.keys(groupedSupplierItems).length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '12.5px' }}>공급업체가 없습니다.</div>
                    ) : (
                      Object.keys(groupedSupplierItems).map(supplier => {
                        const details = basicForm.supplierTaxInvoiceDetails[supplier] || { date: '', invoiceNo: '' };
                        return (
                          <div key={supplier} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontWeight: 800, fontSize: '13px', color: '#1e3a8a' }}>{supplier}</span>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>발행일자</span>
                                <input
                                  type="date"
                                  value={details.date}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setBasicForm(prev => ({
                                      ...prev,
                                      supplierTaxInvoiceDetails: {
                                        ...prev.supplierTaxInvoiceDetails,
                                        [supplier]: { ...details, date: val }
                                      }
                                    }));
                                  }}
                                  style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px' }}
                                />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#4b5563' }}>세금계산서 발급번호</span>
                                <input
                                  type="text"
                                  placeholder="국세청 승인번호 입력"
                                  value={details.invoiceNo}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setBasicForm(prev => ({
                                      ...prev,
                                      supplierTaxInvoiceDetails: {
                                        ...prev.supplierTaxInvoiceDetails,
                                        [supplier]: { ...details, invoiceNo: val }
                                      }
                                    }));
                                  }}
                                  style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px' }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Sub Tab 2: 구매확인서 발행 */}
                {supplierSubTab === 'cert' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>영세율 세금계산서 발행업체만 표시됩니다. 마우스 드래그로 구매확인서 PDF 등을 첨부할 수 있습니다.</div>
                    {(() => {
                      const zeroTaxSuppliers = Object.keys(groupedSupplierItems).filter(supplier => basicForm.supplierTaxTypes[supplier] === '영세');
                      if (zeroTaxSuppliers.length === 0) {
                        return (
                          <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#94a3b8', fontSize: '13px' }}>
                            영세율로 설정된 공급업체가 없습니다. <br />
                            <span style={{ fontSize: '11.5px', color: '#64748b', marginTop: '6px', display: 'block' }}>(위 "공급업체별 발주서(PO) 인쇄 및 다운로드"에서 공급사별 세율 구분을 "영세"로 변경 후 저장해 주세요)</span>
                          </div>
                        );
                      }

                      return zeroTaxSuppliers.map(supplier => {
                        const fileList = basicForm.supplierPurchaseCertFiles[supplier] || [];
                        const isUploadingThis = uploadingCertSupplier === supplier;

                        return (
                          <div key={supplier} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <span style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>{supplier}</span>
                            
                            {/* Drag and Drop Zone */}
                            <div 
                              onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#2563eb'; }}
                              onDragLeave={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#cbd5e1'; }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.currentTarget.style.borderColor = '#cbd5e1';
                                const files = e.dataTransfer.files;
                                if (files && files.length > 0) {
                                  handleSupplierCertUpload(files[0], supplier);
                                }
                              }}
                              style={{
                                border: '2px dashed #cbd5e1',
                                borderRadius: '6px',
                                background: '#fff',
                                padding: '16px',
                                textAlign: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.15s',
                                position: 'relative'
                              }}
                              onClick={() => {
                                const fileInput = document.getElementById(`cert-uploader-${supplier}`);
                                fileInput?.click();
                              }}
                            >
                              <input 
                                type="file" 
                                id={`cert-uploader-${supplier}`}
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const files = e.target.files;
                                  if (files && files.length > 0) {
                                    handleSupplierCertUpload(files[0], supplier);
                                  }
                                }}
                              />
                              <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>
                                {isUploadingThis ? '⏳ 업로드 중...' : '📂 여기에 파일을 드래그하여 놓거나 클릭하여 구매확인서 등록'}
                              </span>
                            </div>

                            {/* Attached files list */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                              {fileList.length > 0 ? (
                                fileList.map((file, idx) => (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                    <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#2563eb', fontSize: '12px', fontWeight: 600 }}>
                                      📄 {file.name}
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSupplierCertFile(supplier, idx)}
                                      style={{ border: 'none', background: 'transparent', color: '#ef4444', fontWeight: 700, cursor: 'pointer', fontSize: '12px' }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>첨부된 구매확인서 파일이 없습니다.</span>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* Sub Tab 3: 결제 관리 */}
                {supplierSubTab === 'pay' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>각 공급업체별 1차~4차 결제일 및 결제금액(입금액)을 분할하여 지정할 수 있으며, 지급액 대비 미수금이 자동 계산됩니다.</div>
                    {Object.keys(groupedSupplierItems).length === 0 ? (
                       <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '12.5px' }}>공급업체가 없습니다.</div>
                    ) : (
                      Object.keys(groupedSupplierItems).map(supplier => {
                        const list = basicForm.supplierPaymentInstallments[supplier] || [];
                        const installments = list.length > 0 ? list : [{ date: '', amount: 0 }];
                        const matchingSupplier = suppliersList.find(s => s.name?.trim() === supplier.trim());

                        // Calculate grand total from tax invoice items for this supplier
                        const items = groupedSupplierItems[supplier] || [];
                        const taxType = basicForm.supplierTaxTypes[supplier] || '일반';
                        const usdTotal = items.filter(it => it.currency !== 'KRW').reduce((sum, it) => {
                          const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                          return sum + price * (it.qty || 0);
                        }, 0);
                        const krwTotal = items.filter(it => it.currency === 'KRW').reduce((sum, it) => {
                          const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                          return sum + price * (it.qty || 0);
                        }, 0);
                        const usdVat = taxType === '영세' ? 0 : parseFloat((usdTotal * 0.1).toFixed(2));
                        const krwVat = taxType === '영세' ? 0 : Math.round(krwTotal * 0.1);
                        const usdGrand = usdTotal + usdVat;
                        const krwGrand = krwTotal + krwVat;

                        const isKrw = krwGrand > 0 || (usdGrand === 0 && krwGrand === 0);
                        const grandTotal = isKrw ? krwGrand : usdGrand;
                        const currencySymbol = isKrw ? '₩' : '$';
                        const currencyText = isKrw ? 'KRW' : 'USD';

                        const totalPaid = installments.reduce((sum, inst) => sum + (inst.amount || 0), 0);
                        const outstanding = Math.max(0, isKrw ? Math.round(grandTotal - totalPaid) : parseFloat((grandTotal - totalPaid).toFixed(2)));
                        const isCompleted = grandTotal > 0 && totalPaid >= (grandTotal - (isKrw ? 0.9 : 0.009));

                        const handleInstallmentChange = (idx: number, field: 'date' | 'amount', value: any) => {
                          const newList = [...installments];
                          newList[idx] = { ...newList[idx], [field]: value };
                          
                          const newTotalPaid = newList.reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          const newIsCompleted = grandTotal > 0 && newTotalPaid >= (grandTotal - (isKrw ? 0.9 : 0.009));
                          
                          const dates = newList.map(inst => inst.date).filter(d => d);
                          const lastDate = dates.length > 0 ? dates.sort().reverse()[0] : '';
                          
                          setBasicForm(prev => {
                            const updatedPayments = { ...prev.supplierPayments };
                            if (newIsCompleted) {
                              updatedPayments[supplier] = { status: '입금완료', date: lastDate };
                            } else {
                              updatedPayments[supplier] = { status: '미수금 발생', date: '' };
                            }
                            
                            return {
                              ...prev,
                              supplierPaymentInstallments: {
                                ...prev.supplierPaymentInstallments,
                                [supplier]: newList
                              },
                              supplierPayments: updatedPayments
                            };
                          });
                        };

                        const addInstallment = () => {
                          const newList = [...installments, { date: '', amount: 0 }];
                          setBasicForm(prev => ({
                            ...prev,
                            supplierPaymentInstallments: {
                              ...prev.supplierPaymentInstallments,
                              [supplier]: newList
                            }
                          }));
                        };

                        const removeInstallment = (idx: number) => {
                          const newList = installments.filter((_, i) => i !== idx);
                          const finalList = newList.length > 0 ? newList : [{ date: '', amount: 0 }];
                          
                          const newTotalPaid = finalList.reduce((sum, inst) => sum + (inst.amount || 0), 0);
                          const newIsCompleted = grandTotal > 0 && newTotalPaid >= (grandTotal - (isKrw ? 0.9 : 0.009));
                          const dates = finalList.map(inst => inst.date).filter(d => d);
                          const lastDate = dates.length > 0 ? dates.sort().reverse()[0] : '';

                          setBasicForm(prev => {
                            const updatedPayments = { ...prev.supplierPayments };
                            if (newIsCompleted) {
                              updatedPayments[supplier] = { status: '입금완료', date: lastDate };
                            } else {
                              updatedPayments[supplier] = { status: '미수금 발생', date: '' };
                            }
                            return {
                              ...prev,
                              supplierPaymentInstallments: {
                                ...prev.supplierPaymentInstallments,
                                [supplier]: finalList
                              },
                              supplierPayments: updatedPayments
                            };
                          });
                        };

                        return (
                          <div key={supplier} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #cbd5e1', paddingBottom: '8px', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e3a8a' }}>{supplier}</span>
                                <button
                                  type="button"
                                  onClick={addInstallment}
                                  style={{
                                    background: '#fff',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    padding: '3px 8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: '#0d9488',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px'
                                  }}
                                >
                                  ＋ 입금 추가
                                </button>
                              </div>
                              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '12.5px', color: '#475569' }}>
                                  지급 총액: <strong>{currencySymbol}{grandTotal.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })} {currencyText}</strong>
                                </span>
                                <span style={{ fontSize: '12.5px', color: '#475569' }}>
                                  입금 합계: <strong style={{ color: '#0d9488' }}>{currencySymbol}{totalPaid.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })} {currencyText}</strong>
                                </span>
                                <span style={{ fontSize: '12.5px', color: '#475569' }}>
                                  미수금: <strong style={{ color: outstanding > 0 ? '#ef4444' : '#64748b' }}>{currencySymbol}{outstanding.toLocaleString(undefined, isKrw ? {} : { minimumFractionDigits: 2 })} {currencyText}</strong>
                                </span>
                                <span style={{
                                  fontSize: '11.5px',
                                  fontWeight: 700,
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  background: isCompleted ? '#dcfce7' : '#fee2e2',
                                  color: isCompleted ? '#15803d' : '#b91c1c',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}>
                                  {isCompleted ? '✓ 입금완료' : '입금대기'}
                                </span>
                              </div>
                            </div>
                            {matchingSupplier && (
                              <div style={{ display: 'flex', gap: '20px', background: '#eff6ff', border: '1px solid #dbeafe', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', color: '#1e40af', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <span>🏦 <strong>원화계좌:</strong> {matchingSupplier.bankKrw || '등록정보 없음'}</span>
                                <span>🌍 <strong>외화계좌:</strong> {matchingSupplier.bankUsd || '등록정보 없음'}</span>
                              </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                              {installments.map((inst, idx) => (
                                <div key={idx} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569' }}>{idx + 1}차 입금</span>
                                    {installments.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => removeInstallment(idx)}
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          color: '#ef4444',
                                          cursor: 'pointer',
                                          fontSize: '11px',
                                          padding: '0 4px',
                                          fontWeight: 700
                                        }}
                                        title="삭제"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>입금일자</span>
                                    <input
                                      type="date"
                                      value={inst.date}
                                      onChange={e => handleInstallmentChange(idx, 'date', e.target.value)}
                                      style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>입금금액</span>
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={inst.amount || ''}
                                      onChange={e => handleInstallmentChange(idx, 'amount', parseFloat(e.target.value) || 0)}
                                      style={{ padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px', width: '100%', boxSizing: 'border-box', textAlign: 'right' }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 4. 선적관리 */}
          {activeStep === '선적관리' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {/* Row 1 */}
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

              {/* Row 2 */}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>CFS 주소 및 정보</span>
                <input 
                  type="text" 
                  style={inputStyle(isEditing && basicForm.containerWorkspaceType === 'CFS')} 
                  value={basicForm.cfsAddress || ''} 
                  onChange={e => setBasicForm(p => ({ ...p, cfsAddress: e.target.value }))} 
                  disabled={!isEditing || basicForm.containerWorkspaceType !== 'CFS'} 
                  placeholder={basicForm.containerWorkspaceType === 'CFS' ? "주소 및 담당자 정보" : "CFS 작업 시에만 입력 가능"} 
                />
              </div>

              {/* 수출신고번호, 수출면장 기준환율 */}
              <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', borderTop: '1px solid #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>수출신고번호</span>
                  <input type="text" value={basicForm.exportDeclarationNo || ''} onChange={e => setBasicForm(p => ({ ...p, exportDeclarationNo: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 010-22-19-1234567" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>수출면장 기준환율</span>
                  <input type="number" step="0.01" value={basicForm.customsExchangeRate || ''} onChange={e => setBasicForm(p => ({ ...p, customsExchangeRate: parseFloat(e.target.value) || 0 }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 1352.50" />
                </div>
                <div />
              </div>

              {/* 5개의 유첨 파일 - 1줄에 5개 박스 */}
              <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', borderTop: '1px solid #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                {renderFileField('CI 유첨', 'ciFiles', 'ci-file-input')}
                {renderFileField('PL 유첨', 'plFiles', 'pl-file-input')}
                {renderFileField('COO 유첨', 'cooFiles', 'coo-file-input')}
                {renderFileField('B/L 유첨', 'blFiles', 'bl-file-input')}
                {renderFileField('그밖의 서류 유첨', 'otherFiles', 'other-docs-input')}
              </div>

              {/* 선적서류 발송 및 은행제출 */}
              <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', borderTop: '1px solid #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
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
                  <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>Tracking 번호</span>
                  <input type="text" value={basicForm.shippingDocsTrackingNo} onChange={e => setBasicForm(p => ({ ...p, shippingDocsTrackingNo: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="DHL 등 번호" />
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
                <div />
              </div>
            </div>
          )}

          {/* 4. 이익관리 */}
          {activeStep === '이익관리' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(() => {
                const customsRate = basicForm.customsExchangeRate || piData?.exchangeRate || 1350;
                const revenueUsd = piData?.totalUsd || 0;
                const revenueKrw = piData?.totalKrw || 0;
                const consolidatedRevenueKrw = Math.round((revenueUsd * customsRate) + revenueKrw);

                const purchaseUsd = order.items?.filter((it: OrderItem) => it.currency !== 'KRW').reduce((sum: number, it: OrderItem) => {
                  const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                  return sum + (price * (it.qty || 0));
                }, 0) || 0;
                const purchaseKrw = order.items?.filter((it: OrderItem) => it.currency === 'KRW').reduce((sum: number, it: OrderItem) => {
                  const price = it.purchaseUnitPrice !== undefined ? it.purchaseUnitPrice : it.unitPrice;
                  return sum + (price * (it.qty || 0));
                }, 0) || 0;
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
