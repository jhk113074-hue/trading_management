import React, { useState, useEffect, useRef, useMemo } from 'react';
import { doc, setDoc, serverTimestamp, collection, getDocs, query, where } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Customer, CustomerContact } from '../types/customer';
import type { Supplier } from '../types/supplier';
import { SupplierSearchModal } from './SupplierSearchModal';

interface Props {
  initialCustomer?: Customer;
  onClose: () => void;
  onSave?: (savedCustomer: Customer) => void;
}

export const CustomerModal: React.FC<Props> = ({ initialCustomer, onClose, onSave }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'crm'>('info');
  const [crmTasks, setCrmTasks] = useState<any[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // 다중 담당자 임시 추가용 state
  const [newContactName, setNewContactName] = useState('');
  const [newContactPosition, setNewContactPosition] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactRemarks, setNewContactRemarks] = useState('');
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  // Integrated Sales & Payment History State
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(false);
  const [selectedSalesYear, setSelectedSalesYear] = useState<string>('ALL');

  const availableYears = useMemo<string[]>(() => {
    return Array.from(new Set(salesHistory.map((s: any) => s.year).filter((y: any) => y && y !== '-'))).sort().reverse();
  }, [salesHistory]);

  const filteredList = useMemo<any[]>(() => {
    if (selectedSalesYear === 'ALL') return salesHistory;
    return salesHistory.filter((s: any) => s.year === selectedSalesYear);
  }, [salesHistory, selectedSalesYear]);

  const salesCount = useMemo<number>(() => filteredList.length, [filteredList]);

  const [formData, setFormData] = useState<Partial<Customer>>({
    customerCode: '', name: '', nameKo: '', countryName: '', city: '',
    representative: '', taxId: '', addressEn: '', phone: '', email: '', website: '',
    preferredIncoterms: 'FOB', shippingPort: '', paymentTerms: '',
    bankName: '', bankAccount: '', swiftCode: '', iban: '', bankHolder: '',
    contacts: [], remarks: ''
  });

  const customerId = initialCustomer?.id || '';
  const customerCode = formData.customerCode || initialCustomer?.customerCode || '';
  const customerName = formData.name || initialCustomer?.name || '';

  const stableCustomerKey = useMemo(
    () => `${customerId}|${customerCode}|${customerName}`,
    [customerId, customerCode, customerName]
  );

  useEffect(() => {
    console.log('stableCustomerKey 변경됨:', stableCustomerKey, new Date().toISOString());
  }, [stableCustomerKey]);

  // 겸업(공급사 연결) 검색용
  const [isSupplierSearchOpen, setIsSupplierSearchOpen] = useState(false);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);

  const openSupplierSearch = async () => {
    try {
      const snap = await getDocs(collection(db, 'companies', COMPANY_ID, 'suppliers'));
      setAllSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Supplier)));
    } catch (err) {
      console.error('공급업체 목록 조회 오류:', err);
    }
    setIsSupplierSearchOpen(true);
  };

  useEffect(() => {
    if (initialCustomer) {
      setFormData({
        ...initialCustomer,
        contacts: initialCustomer.contacts || []
      });
      if (!initialCustomer.customerCode || initialCustomer.customerCode.trim() === '' || initialCustomer.customerCode.trim() === '-') {
        const fetchNextCode = async () => {
          try {
            const snap = await getDocs(collection(db, 'companies', COMPANY_ID, 'customers'));
            let maxNum = 0;
            snap.forEach(d => {
              const code = d.data().customerCode || '';
              if (code.startsWith('CU')) {
                const num = parseInt(code.substring(2), 10);
                if (!isNaN(num) && num > maxNum) maxNum = num;
              }
            });
            const nextCode = 'CU' + String(maxNum + 1).padStart(5, '0');
            setFormData(prev => ({ ...prev, customerCode: nextCode }));
          } catch (e) {
            console.error("Error generating customer code:", e);
          }
        };
        fetchNextCode();
      }
    } else {
      const fetchNextCode = async () => {
        try {
          const snap = await getDocs(collection(db, 'companies', COMPANY_ID, 'customers'));
          let maxNum = 0;
          snap.forEach(d => {
            const code = d.data().customerCode || '';
            if (code.startsWith('CU')) {
              const num = parseInt(code.substring(2), 10);
              if (!isNaN(num) && num > maxNum) maxNum = num;
            }
          });
          const nextCode = 'CU' + String(maxNum + 1).padStart(5, '0');
          setFormData(prev => ({ ...prev, customerCode: nextCode }));
        } catch (e) {
          console.error("Error generating customer code:", e);
        }
      };
      fetchNextCode();
    }
  }, [initialCustomer]);

  useEffect(() => {
    const fetchCrmTasks = async () => {
      const customerIdQuery = initialCustomer?.id || formData.customerCode;
      const nameToQuery = formData.name || initialCustomer?.name;
      
      if (!customerIdQuery && !nameToQuery) {
        setCrmTasks([]);
        return;
      }
      
      setIsLoadingTasks(true);
      try {
        let taskList: any[] = [];
        let meetingList: any[] = [];
        
        // 1. Fetch Tasks
        if (customerIdQuery) {
          const qId = query(
            collection(db, 'tasks'),
            where('customerId', '==', customerIdQuery)
          );
          const snapId = await getDocs(qId);
          snapId.forEach(d => {
            taskList.push({ id: d.id, crmType: 'TASK', ...d.data() });
          });
        }
        if (taskList.length === 0 && nameToQuery) {
          const qName = query(
            collection(db, 'tasks'),
            where('customerName', '==', nameToQuery)
          );
          const snapName = await getDocs(qName);
          snapName.forEach(d => {
            if (!taskList.some(existing => existing.id === d.id)) {
              taskList.push({ id: d.id, crmType: 'TASK', ...d.data() });
            }
          });
        }

        // 2. Fetch Meetings
        if (customerIdQuery) {
          const qMeetId = query(
            collection(db, 'meetings'),
            where('customerId', '==', customerIdQuery)
          );
          const snapMeetId = await getDocs(qMeetId);
          snapMeetId.forEach(d => {
            meetingList.push({ id: d.id, crmType: 'MEETING', ...d.data() });
          });
        }
        if (meetingList.length === 0 && nameToQuery) {
          const qMeetName = query(
            collection(db, 'meetings'),
            where('customerName', '==', nameToQuery)
          );
          const snapMeetName = await getDocs(qMeetName);
          snapMeetName.forEach(d => {
            if (!meetingList.some(existing => existing.id === d.id)) {
              meetingList.push({ id: d.id, crmType: 'MEETING', ...d.data() });
            }
          });
        }

        // 3. Merge and Sort CRM Tasks
        const mergedList = [...taskList, ...meetingList];
        mergedList.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        
        setCrmTasks(mergedList);
      } catch (err) {
        console.error("Error fetching CRM items:", err);
      } finally {
        setIsLoadingTasks(false);
      }
    };

    fetchCrmTasks();

    // Real-time Sales & Payment History Subscription
    const targetId = String(initialCustomer?.id || formData.customerCode || '').trim();
    const targetCode = String(formData.customerCode || initialCustomer?.customerCode || '').trim();
    const targetName = String(formData.name || initialCustomer?.name || '').trim().toLowerCase().replace(/\s+/g, '');
    const targetNameKo = String(formData.nameKo || initialCustomer?.nameKo || '').trim().toLowerCase().replace(/\s+/g, '');
    console.log('EARLY CHECK:', targetId, targetCode, targetName, targetNameKo);
    if (!targetId && !targetCode && !targetName && !targetNameKo) {
      setSalesHistory([]);
      setIsLoadingSales(false);
      return;
    }

    // 1회 비동기 조회 방식 (getDocs) — 구독/해제 타이밍 이슈 원천 해결
    let cancelled = false;

    const fetchSalesHistory = async () => {
      const exactName   = String(formData.name      || initialCustomer?.name      || '').trim();
      const exactNameKo = String(formData.nameKo    || initialCustomer?.nameKo    || '').trim();

      setIsLoadingSales(true);

      try {
        const ordersRef  = collection(db, 'companies', COMPANY_ID, 'orders');
        const importsRef = collection(db, 'companies', COMPANY_ID, 'imports');
        const domRef     = collection(db, 'companies', COMPANY_ID, 'domesticTrades');

        // Helper: convert a Firestore doc to record
        const toExportRecord = (d: any) => {
          const data = d.data();
          const totAmt = Number(data.totalAmount || data.grandTotal || data.orderAmountUsd || data.contractAmount || data.price || 0);
          const paidAmt = data.paymentStatus === 'PAID' ? totAmt : Number(data.paidAmount || 0);
          const dateStr = data.orderDate || data.piDate || data.createdAt?.substring(0, 10) || '-';
          return { id: d.id, type: '수출', date: dateStr, year: dateStr.substring(0, 4), ciNumber: data.ciNumber || data.piNumber || data.custPo || data.orderNo || d.id, totalAmount: totAmt, currency: data.currency || 'USD', paidAmount: paidAmt, paymentStatus: data.paymentStatus || (paidAmt >= totAmt && totAmt > 0 ? 'PAID' : 'UNPAID') };
        };
        const toImportRecord = (d: any) => {
          const data = d.data();
          const totAmt = Number(data.totalAmount || data.invoiceAmount || 0);
          const paidAmt = data.paymentStatus === 'COMPLETED' || data.status === '완료' ? totAmt : Number(data.paidAmount || 0);
          const dateStr = data.importDate || data.blDate || data.createdAt?.substring(0, 10) || '-';
          return { id: d.id, type: '수입', date: dateStr, year: dateStr.substring(0, 4), ciNumber: data.invoiceNo || data.blNo || data.importNo || d.id, totalAmount: totAmt, currency: data.currency || 'USD', paidAmount: paidAmt, paymentStatus: data.paymentStatus || (paidAmt >= totAmt && totAmt > 0 ? 'COMPLETED' : 'PENDING') };
        };
        const toDomesticRecord = (d: any) => {
          const data = d.data();
          const totAmt = Number(data.totalAmount || data.totalPrice || 0);
          const paidAmt = data.depositStatus === '입금완료' || data.status === '완료' ? totAmt : Number(data.depositAmount || 0);
          const dateStr = data.tradeDate || data.invoiceDate || data.createdAt?.substring(0, 10) || '-';
          return { id: d.id, type: '국내', date: dateStr, year: dateStr.substring(0, 4), ciNumber: data.tradeNo || data.statementNo || d.id, totalAmount: totAmt, currency: data.currency || 'KRW', paidAmt: paidAmt, paymentStatus: data.depositStatus || (paidAmt >= totAmt && totAmt > 0 ? '입금완료' : '미입금') };
        };

        const exportRecords: any[] = [];
        const importRecords: any[] = [];
        const domesticRecords: any[] = [];

        // A. Export Orders (getDocs)
        const orderSnap = await getDocs(ordersRef);
        // 즉시 중단하고 결과만 출력
        if (!cancelled) {
          setSalesHistory([{
            id: 'DEBUG_ORDERS',
            type: `수출오더 getDocs: ${orderSnap.size}건`,
            date: '-', year: '-',
            ciNumber: `경로: companies/${COMPANY_ID}/orders`,
            totalAmount: 0, currency: '', paidAmount: 0, paymentStatus: ''
          }]);
          setIsLoadingSales(false);
          return;
        }
        const cleanTargetName   = targetName.replace(/[^a-z0-9]/g, '');
        const cleanTargetNameKo = targetNameKo.replace(/[^a-z0-9가-힣]/g, '');
        const orderResults = new Map<string, any>();

        orderSnap.docs.forEach((d: any) => {
          const data = d.data();
          const rawCVal = String(data.customer || data.customerName || '').trim();
          const cValClean = rawCVal.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
          const cId = String(data.customerId || '').trim().toLowerCase();
          const cCode = String(data.customerCode || '').trim().toLowerCase();

          const matchCode = targetCode && (cCode === targetCode.toLowerCase() || cId === targetCode.toLowerCase());
          const matchId = targetId && (cId === targetId.toLowerCase() || cCode === targetId.toLowerCase());

          let matchName = false;
          if (cleanTargetName && cleanTargetName.length >= 2) {
            matchName = cValClean.includes(cleanTargetName) || cleanTargetName.includes(cValClean);
          }
          let matchNameKo = false;
          if (cleanTargetNameKo && cleanTargetNameKo.length >= 2) {
            matchNameKo = cValClean.includes(cleanTargetNameKo) || cleanTargetNameKo.includes(cValClean);
          }

          if (matchCode || matchId || matchName || matchNameKo) {
            orderResults.set(d.id, toExportRecord(d));
          }
        });
        exportRecords.push(...orderResults.values());

        // B. Imports (getDocs)
        const importQueries: any[] = [];
        if (targetCode) {
          importQueries.push(query(importsRef, where('customerId',   '==', targetCode)));
          importQueries.push(query(importsRef, where('customerCode', '==', targetCode)));
        }
        if (targetId && targetId !== targetCode) {
          importQueries.push(query(importsRef, where('customerId', '==', targetId)));
        }
        if (exactName)   importQueries.push(query(importsRef, where('finalCustomer', '==', exactName)));
        if (exactNameKo) importQueries.push(query(importsRef, where('finalCustomer', '==', exactNameKo)));
        if (exactName)   importQueries.push(query(importsRef, where('customerName',  '==', exactName)));
        if (exactNameKo) importQueries.push(query(importsRef, where('customerName',  '==', exactNameKo)));

        const importResults = new Map<string, any>();
        if (importQueries.length > 0) {
          const importSnaps = await Promise.all(importQueries.map(q => getDocs(q)));
          importSnaps.forEach(snap => {
            snap.docs.forEach((d: any) => { importResults.set(d.id, toImportRecord(d)); });
          });
        }
        importRecords.push(...importResults.values());

        // C. Domestic Trades (getDocs)
        const domQueries: any[] = [];
        if (targetCode) {
          domQueries.push(query(domRef, where('customerId',   '==', targetCode)));
          domQueries.push(query(domRef, where('customerCode', '==', targetCode)));
        }
        if (targetId && targetId !== targetCode) {
          domQueries.push(query(domRef, where('customerId', '==', targetId)));
        }
        if (exactName)   domQueries.push(query(domRef, where('customer',     '==', exactName)));
        if (exactNameKo) domQueries.push(query(domRef, where('customer',     '==', exactNameKo)));
        if (exactName)   domQueries.push(query(domRef, where('customerName', '==', exactName)));
        if (exactNameKo) domQueries.push(query(domRef, where('customerName', '==', exactNameKo)));
        if (exactName)   domQueries.push(query(domRef, where('buyer',        '==', exactName)));

        const domResults = new Map<string, any>();
        if (domQueries.length > 0) {
          const domSnaps = await Promise.all(domQueries.map(q => getDocs(q)));
          domSnaps.forEach(snap => {
            snap.docs.forEach((d: any) => { domResults.set(d.id, toDomesticRecord(d)); });
          });
        }
        domesticRecords.push(...domResults.values());

        // Combined Sales History List
        if (!cancelled) {
          const combinedMap = new Map<string, any>();
          [...exportRecords, ...importRecords, ...domesticRecords].forEach(r => {
            combinedMap.set(r.id, r);
          });
          const list = Array.from(combinedMap.values());
          list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
          setSalesHistory(list);
        }
      } catch (err) {
        console.error('[CRM] fetchSalesHistory error:', err);
        if (!cancelled) setSalesHistory([]);
      } finally {
        if (!cancelled) setIsLoadingSales(false);
      }
    };

    setSalesHistory([{ id: 'DEBUG2', type: `fetchSalesHistory 호출됨 | stableKey: ${stableCustomerKey}`, date: '-', year: '-', ciNumber: `targetId:${targetId} targetCode:${targetCode} targetName:${targetName}`, totalAmount: 0, currency: '', paidAmount: 0, paymentStatus: '' }]);
    fetchSalesHistory();

    return () => { cancelled = true; };
  }, [stableCustomerKey]);

  const handleChange = (field: keyof Customer, value: any) => {
    setIsDirty(true);
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.customerCode?.trim()) { alert('고객코드는 필수 입력사항입니다.'); return; }
    if (!formData.name?.trim()) { alert('고객명(영문)은 필수 입력사항입니다.'); return; }

    setIsSaving(true);
    try {
      const docId = initialCustomer?.id || formData.customerCode;
      
      let legacyFields = {
        contactPerson: '',
        contactPhone: '',
        contactEmail: ''
      };

      if (formData.contacts && formData.contacts.length > 0) {
        const primary = formData.contacts.find(c => c.isPrimary) || formData.contacts[0];
        legacyFields = {
          contactPerson: primary.name,
          contactPhone: primary.phone || '',
          contactEmail: primary.email || ''
        };
      }

      const finalData: Partial<Customer> = {
        ...formData,
        ...legacyFields,
        updatedAt: serverTimestamp(),
      };

      if (!initialCustomer) {
        finalData.createdAt = serverTimestamp();
      }

      const cleanUndefined = (obj: any): any => {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) return obj.map(cleanUndefined);
        if (typeof obj === 'object') {
          if (obj.constructor && (obj.constructor.name.includes('FieldValue') || obj.constructor.name === 'Date')) {
            return obj;
          }
          if (obj.constructor && obj.constructor.name !== 'Object') {
            return obj;
          }
          const clean: any = {};
          for (const key of Object.keys(obj)) {
            if (obj[key] !== undefined) {
              clean[key] = cleanUndefined(obj[key]);
            }
          }
          return clean;
        }
        return obj;
      };

      const sanitizedData = cleanUndefined(finalData);
      await setDoc(doc(db, 'companies', COMPANY_ID, 'customers', docId), sanitizedData);
      alert('✅ 성공적으로 저장되었습니다.');
      onSave?.({ id: docId, ...sanitizedData } as Customer);
      onClose();
    } catch (err: any) {
      alert('❌ 저장 실패: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const [isDirty, setIsDirty] = useState(false);

  const handleClose = () => {
    if (isDirty) {
      const confirmClose = window.confirm("⚠️ 작성 중인 내용이 저장되지 않았습니다. 정말로 창을 닫으시겠습니까?");
      if (!confirmClose) return;
    }
    onClose();
  };

  const [position, setPosition] = useState({ x: 120, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const nextX = Math.max(10, Math.min(window.innerWidth - 300, e.clientX - dragStartRef.current.x));
    const nextY = Math.max(10, Math.min(window.innerHeight - 150, e.clientY - dragStartRef.current.y));
    setPosition({ x: nextX, y: nextY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <>
    <div style={{
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: '96%',
      maxWidth: '1100px',
      zIndex: 3000,
      pointerEvents: 'auto',
      userSelect: isDragging ? 'none' : 'auto'
    }}>
      <div style={{ background: '#fff', borderRadius: '4px', width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(15,23,42,0.3)', border: '1px solid #cbd5e1', overflow: 'hidden' }}>

        {/* Header */}
        <div
          onMouseDown={handleMouseDown}
          style={{ padding: '16px 24px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', cursor: 'move', userSelect: 'none' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🌐</span>
              <span>{initialCustomer ? '고객사 정보 수정' : '신규 고객사 등록'}</span>
              {(formData.customerCode || formData.name) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
                  {formData.customerCode && (
                    <span style={{ fontSize: '12px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                      {formData.customerCode}
                    </span>
                  )}
                  {formData.name && (
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                      {formData.name}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <button onClick={handleClose} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', padding: '0 16px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            style={{
              padding: '12px 18px',
              border: 'none',
              background: activeTab === 'info' ? '#ffffff' : 'transparent',
              borderBottom: activeTab === 'info' ? '3px solid #3b82f6' : '3px solid transparent',
              color: activeTab === 'info' ? '#3b82f6' : '#475569',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.15s'
            }}
          >
            📂 기본 정보 및 담당자 관리
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('crm')}
            style={{
              padding: '12px 18px',
              border: 'none',
              background: activeTab === 'crm' ? '#ffffff' : 'transparent',
              borderBottom: activeTab === 'crm' ? '3px solid #3b82f6' : '3px solid transparent',
              color: activeTab === 'crm' ? '#3b82f6' : '#475569',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.15s'
            }}
          >
            📝 CRM 및 업무 이력 연동 ({isLoadingSales ? '...' : salesCount > 0 ? `매출 ${salesCount}건` : crmTasks.length})
          </button>
        </div>

        {/* Body Container (Ultra Compact, scrollable only if screen is tiny) */}
        {activeTab === 'crm' ? (
          <div style={{ padding: '8px 12px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc' }}>
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  💼 CRM 연동 업무 및 회의록 이력 ({crmTasks.length}건)
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  * 거래처명이 "{formData.name || initialCustomer?.name || ''}"로 지정된 데이터 리스트입니다.
                </span>
              </div>
              
              {isLoadingTasks ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  ⏳ 업무 이력을 불러오는 중입니다...
                </div>
              ) : crmTasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  📭 등록된 연동 업무 히스토리가 없습니다.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {crmTasks.map((t) => (
                    <div key={t.id} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden', background: '#fff' }}>
                      {/* 업무 / 회의록 요약 헤더 */}
                      <div style={{ background: '#f8fafc', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ 
                            fontSize: '10.5px', 
                            fontWeight: 800, 
                            padding: '2px 6px', 
                            borderRadius: '4px',
                            background: t.crmType === 'MEETING' ? '#f3e8ff' : (t.status === 'DONE' ? '#dcfce7' : '#fee2e2'),
                            color: t.crmType === 'MEETING' ? '#7e22ce' : (t.status === 'DONE' ? '#15803d' : '#b91c1c')
                          }}>
                            {t.crmType === 'MEETING' ? '📝 회의록' : (t.status === 'DONE' ? '완료' : '진행중')}
                          </span>
                          {t.crmType === 'TASK' && (
                            <span style={{ 
                              fontSize: '10.5px', 
                              fontWeight: 800, 
                              padding: '2px 6px', 
                              borderRadius: '4px',
                              background: '#e0f2fe',
                              color: '#0369a1'
                            }}>
                              중요도: {t.importance || 'B'}
                            </span>
                          )}
                          <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>{t.title}</span>
                          {t.crmType === 'MEETING' && t.projectName && (
                            <span style={{ fontSize: '11px', color: 'var(--focus-ring)', background: '#f0fdfa', padding: '1px 6px', borderRadius: '3px', fontWeight: 700 }}>
                              🚀 {t.projectName}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {t.crmType === 'MEETING' ? (
                            <>작성: <strong style={{ color: '#334155' }}>{t.createdByName || '시스템'}</strong> | 회의일: {t.date || t.createdAt?.substring(0,10)}</>
                          ) : (
                            <>담당: <strong style={{ color: '#334155' }}>{t.assigneeName || '미지정'}</strong> | 등록일: {t.createdAt ? t.createdAt.substring(0,10) : '-'}</>
                          )}
                        </div>
                      </div>
                      
                      {/* 업무 / 회의록 본문 설명 및 메모 */}
                      <div 
                        style={{ padding: '12px', background: '#ffffff', fontSize: '13px', color: '#334155', lineHeight: '1.6', fontFamily: 'inherit' }}
                        dangerouslySetInnerHTML={{ __html: t.content || t.description || '<span style="color: var(--text-muted); font-style: italic;">작성된 내용이 없습니다.</span>' }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SECTION 2: 통합 판매 및 수금 이력 (수출/수입/국내) */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginTop: '8px' }}>
              {(() => {
                const totalAmtUSD = filteredList.filter((s: any) => s.currency === 'USD').reduce((sum: number, s: any) => sum + s.totalAmount, 0);
                const totalPaidUSD = filteredList.filter((s: any) => s.currency === 'USD').reduce((sum: number, s: any) => sum + s.paidAmount, 0);
                const totalAmtKRW = filteredList.filter((s: any) => s.currency === 'KRW').reduce((sum: number, s: any) => sum + s.totalAmount, 0);
                const totalPaidKRW = filteredList.filter((s: any) => s.currency === 'KRW').reduce((sum: number, s: any) => sum + s.paidAmount, 0);

                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          💰 통합 주문/판매 및 수금 이력 ({salesCount}건)
                        </span>
                        {/* Year Filter Dropdown */}
                        <select
                          value={selectedSalesYear}
                          onChange={(e) => setSelectedSalesYear(e.target.value)}
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            border: '1px solid #cbd5e1',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#1e293b',
                            backgroundColor: '#f8fafc',
                            cursor: 'pointer',
                            outline: 'none'
                          }}
                        >
                          <option value="ALL">📅 전체 연도 보기 ({salesHistory.length}건)</option>
                          {availableYears.map((yr: string) => (
                            <option key={yr} value={yr}>{yr}년 ({salesHistory.filter((s: any) => s.year === yr).length}건)</option>
                          ))}
                        </select>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        * 수출주문관리, 수입주문관리, 국내주문관리 실시간 매칭 기록
                      </span>
                    </div>



                    {/* Financial Summary Badges */}
                    {filteredList.length > 0 && (
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        {totalAmtUSD > 0 && (
                          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontWeight: 800, color: '#1e40af' }}>USD 총 매출:</span>
                            <span style={{ fontWeight: 800, color: '#2563eb' }}>${totalAmtUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span style={{ color: '#94a3b8' }}>|</span>
                            <span style={{ fontWeight: 800, color: '#16a34a' }}>수금 완료: ${totalPaidUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            {totalAmtUSD - totalPaidUSD > 0 && (
                              <span style={{ fontWeight: 800, color: '#dc2626' }}>(미수금: ${(totalAmtUSD - totalPaidUSD).toLocaleString(undefined, { minimumFractionDigits: 2 })})</span>
                            )}
                          </div>
                        )}
                        {totalAmtKRW > 0 && (
                          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontWeight: 800, color: '#166534' }}>KRW 총 매출:</span>
                            <span style={{ fontWeight: 800, color: '#16a34a' }}>₩{Math.round(totalAmtKRW).toLocaleString()}</span>
                            <span style={{ color: '#94a3b8' }}>|</span>
                            <span style={{ fontWeight: 800, color: '#2563eb' }}>수금 완료: ₩{Math.round(totalPaidKRW).toLocaleString()}</span>
                            {totalAmtKRW - totalPaidKRW > 0 && (
                              <span style={{ fontWeight: 800, color: '#dc2626' }}>(미수금: ₩{Math.round(totalAmtKRW - totalPaidKRW).toLocaleString()})</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Table */}
                    {isLoadingSales ? (
                      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        ⏳ 주문/판매 및 수금 이력을 불러오는 중입니다...
                      </div>
                    ) : filteredList.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        📭 해당 조건의 등록된 판매/수금 이력이 없습니다.
                      </div>
                    ) : (
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                            <tr>
                              <th style={{ padding: '8px 10px', fontWeight: 750, color: '#475569' }}>년월일 (Date)</th>
                              <th style={{ padding: '8px 10px', fontWeight: 750, color: '#475569' }}>구분</th>
                              <th style={{ padding: '8px 10px', fontWeight: 750, color: '#475569' }}>CI / 문서 번호</th>
                              <th style={{ padding: '8px 10px', fontWeight: 750, color: '#475569', textAlign: 'right' }}>판매/계약 금액</th>
                              <th style={{ padding: '8px 10px', fontWeight: 750, color: '#475569', textAlign: 'right' }}>수금/입금 금액</th>
                              <th style={{ padding: '8px 10px', fontWeight: 750, color: '#475569', textAlign: 'center' }}>수금 상태</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredList.map((s: any) => {
                              const amtFormatted = s.currency === 'KRW'
                                ? `₩${Math.round(s.totalAmount).toLocaleString()}`
                                : `$${s.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                              
                              const paidFormatted = s.currency === 'KRW'
                                ? `₩${Math.round(s.paidAmount).toLocaleString()}`
                                : `$${s.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                              const isPaidFull = s.paidAmount >= s.totalAmount && s.totalAmount > 0;

                              return (
                                <tr key={s.id} style={{ borderBottom: '1px solid #e2e8f0', height: '40px' }}>
                                  <td style={{ padding: '6px 10px', color: '#1e293b', fontWeight: 600 }}>{s.date}</td>
                                  <td style={{ padding: '6px 10px' }}>
                                    <span style={{
                                      fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                                      background: s.type === '수출' ? '#eff6ff' : s.type === '수입' ? '#f0fdf4' : '#fffbeb',
                                      color: s.type === '수출' ? '#2563eb' : s.type === '수입' ? '#16a34a' : '#d97706'
                                    }}>
                                      {s.type === '수출' ? '🚢 수출' : s.type === '수입' ? '🛃 수입' : '🇰🇷 국내'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '6px 10px', fontWeight: 700, color: '#2563eb' }}>{s.ciNumber}</td>
                                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>{amtFormatted}</td>
                                  <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: isPaidFull ? '#16a34a' : '#3b82f6' }}>{paidFormatted}</td>
                                  <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                    <span style={{
                                      fontSize: '11px', fontWeight: 800, padding: '2px 7px', borderRadius: '4px',
                                      background: isPaidFull ? '#dcfce7' : '#fee2e2',
                                      color: isPaidFull ? '#15803d' : '#b91c1c'
                                    }}>
                                      {isPaidFull ? '🟢 수금완료' : '🔴 미수금'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>

                          {/* TOTAL Row */}
                          <tfoot style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                            <tr>
                              <td colSpan={3} style={{ padding: '10px', color: '#1e293b', fontSize: '13px' }}>
                                📊 합계 (TOTAL - {selectedSalesYear === 'ALL' ? '전체' : selectedSalesYear + '년'} 총 {filteredList.length}건)
                              </td>
                              <td style={{ padding: '10px', textAlign: 'right', color: '#0f172a', fontSize: '13.5px' }}>
                                {totalAmtUSD > 0 && <div>${totalAmtUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
                                {totalAmtKRW > 0 && <div>₩{Math.round(totalAmtKRW).toLocaleString()}</div>}
                              </td>
                              <td style={{ padding: '10px', textAlign: 'right', color: '#16a34a', fontSize: '13.5px' }}>
                                {totalAmtUSD > 0 && <div>${totalPaidUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}
                                {totalAmtKRW > 0 && <div>₩{Math.round(totalPaidKRW).toLocaleString()}</div>}
                              </td>
                              <td style={{ padding: '10px', textAlign: 'center' }}>
                                {totalAmtUSD - totalPaidUSD > 0 || totalAmtKRW - totalPaidKRW > 0 ? (
                                  <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', background: '#fee2e2', color: '#b91c1c', fontWeight: 800 }}>
                                    미수금 잔액 존재
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', background: '#dcfce7', color: '#15803d', fontWeight: 800 }}>
                                    전액 수금 완료
                                  </span>
                                )}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc' }}>
            
            {/* SECTION 1: 회사 기본 규격 */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                <span style={{ color: '#2563eb' }}>🏢</span> 회사 기본 정보 (Company Profile)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                <Input label="고객코드 (자동지정)" value={formData.customerCode} onChange={(v: any) => handleChange('customerCode', v)} disabled={true} placeholder="생성 중..." />
                <Input label="고객사명 (필수) ★" value={formData.name} onChange={(v: any) => handleChange('name', v)} placeholder="예: AL BASSAM FACTORIES" labelColor="#2563eb" />
                <Input label="고객약자 (Abbreviation)" value={formData.nameKo} onChange={(v: any) => handleChange('nameKo', v)} placeholder="예: AL-BASSAM" />
                <Input label="대표자 (Representative)" value={formData.representative} onChange={(v: any) => handleChange('representative', v)} placeholder="CEO / President Name" />
                
                <Input label="국가명" value={formData.countryName} onChange={(v: any) => handleChange('countryName', v)} placeholder="예: UAE" />
                <Input label="도시 (City)" value={formData.city} onChange={(v: any) => handleChange('city', v)} placeholder="예: Dubai" />
                <Input label="회사 유선전화" value={formData.phone} onChange={(v: any) => handleChange('phone', v)} placeholder="+971-4-XXX-XXXX" />
                <Input label="대표 이메일" value={formData.email} onChange={(v: any) => handleChange('email', v)} type="email" placeholder="info@company.com" />
                
                <div style={{ gridColumn: 'span 2' }}>
                  <Input label="공식 웹사이트 (Website)" value={formData.website} onChange={(v: any) => handleChange('website', v)} placeholder="https://www.company.com" />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <Input label="영문 주소 (Corporate Address)" value={formData.addressEn} onChange={(v: any) => handleChange('addressEn', v)} placeholder="Full street address, ZIP Code" />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <Input label="한글 주소 (국내 고객사 세금계산서용)" value={formData.addressKo} onChange={(v: any) => handleChange('addressKo', v)} placeholder="국내 고객사인 경우 한글 사업장주소 입력" />
                </div>
                <Input label="사업자등록번호" value={formData.bizRegNumber} onChange={(v: any) => handleChange('bizRegNumber', v)} placeholder="000-00-00000 (국내 고객사)" />
                <Input label="업태" value={formData.bizType} onChange={(v: any) => handleChange('bizType', v)} placeholder="예: 도매 및 상품중개업" />
                <Input label="종목" value={formData.itemName} onChange={(v: any) => handleChange('itemName', v)} placeholder="예: 화학원료" />
                
                {/* 겸업 연결 통합 */}
                <div style={{ gridColumn: 'span 3', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>겸업 연결 (이 업체가 공급사이기도 한 경우)</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', height: '34px' }}>
                    {formData.linkedSupplierId ? (
                      <>
                        <span style={{ flex: 1, display: 'flex', alignItems: 'center', height: '34px', background: '#faf5ff', color: '#7e22ce', border: '1px solid #e9d5ff', padding: '0 10px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' }}>
                          🟣 연결됨: {formData.linkedSupplierName || formData.linkedSupplierId}
                        </span>
                        <button type="button" onClick={() => { handleChange('linkedSupplierId', ''); handleChange('linkedSupplierName', ''); }}
                          style={{ height: '34px', padding: '0 12px', background: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                          연결 해제
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={openSupplierSearch}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '34px', background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#7c3aed', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700 }}>
                        🔍 공급업체 목록에서 연결하기
                      </button>
                    )}
                  </div>
                </div>

                {/* 종합 비고 통합 */}
                <div style={{ gridColumn: 'span 4' }}>
                  <Input label="바이어 특이사항 / 종합 비고 (General Remarks)" value={formData.remarks} onChange={(v: any) => handleChange('remarks', v)} placeholder="예: 바이어 신용 등급 및 특이 조항 등" />
                </div>
              </div>
            </div>

            {/* SECTION 2: 무역 선적 & 세무 금융 정보 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              
              {/* 무역/선적 스펙 */}
              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                  <span style={{ color: '#1d4ed8' }}>🚢</span> 무역 거래 및 선적 조건
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <Select label="기본 인도조건 (Incoterms)" value={formData.preferredIncoterms} onChange={(v: any) => handleChange('preferredIncoterms', v)} options={['FOB', 'EXW', 'CIF', 'CFR', 'FCA', 'CPT', 'CIP', 'DAP', 'DDP']} />
                  <Input label="도착항 (Destination Port)" value={formData.shippingPort} onChange={(v: any) => handleChange('shippingPort', v)} placeholder="예: JEBEL ALI PORT" />
                  <div style={{ gridColumn: 'span 2' }}>
                    <Input label="결제조건 (Payment Terms)" value={formData.paymentTerms} onChange={(v: any) => handleChange('paymentTerms', v)} placeholder="예: 100% LC at sight / NET 30 Days" />
                  </div>
                </div>
              </div>

              {/* 세무/금융 금융계좌 (2줄로 나누어 공간 최적 확보) */}
              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>💳</span> 세무 등록 및 외환 계좌 정보
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <Input label="TAX-ID / VAT" value={formData.taxId} onChange={(v: any) => handleChange('taxId', v)} placeholder="VAT Number" />
                  <Input label="은행명" value={formData.bankName} onChange={(v: any) => handleChange('bankName', v)} placeholder="Bank Name" />
                  <Input label="계좌번호" value={formData.bankAccount} onChange={(v: any) => handleChange('bankAccount', v)} placeholder="Account No" />
                  <Input label="예금주" value={formData.bankHolder} onChange={(v: any) => handleChange('bankHolder', v)} placeholder="Holder" />
                  <Input label="SWIFT Code" value={formData.swiftCode} onChange={(v: any) => handleChange('swiftCode', v)} placeholder="SWIFT" />
                  <Input label="IBAN Number" value={formData.iban} onChange={(v: any) => handleChange('iban', v)} placeholder="IBAN" />
                </div>
              </div>
            </div>

            {/* SECTION 3: 다중 담당자 입체 관리 */}
            <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 10px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>
                <span style={{ color: '#3b82f6' }}>👥</span> 바이어 담당자 명부 관리 (Multiple Contacts)
              </div>

              {/* 인라인 등록 폼 */}
              <div style={{ display: 'flex', gap: '6px', background: '#f8fafc', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', marginBottom: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>담당자명 *</label>
                  <input type="text" value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="예: John Smith" style={{ boxSizing: 'border-box', width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>직책/부서</label>
                  <input type="text" value={newContactPosition} onChange={e => setNewContactPosition(e.target.value)} placeholder="예: Sourcing Mgr" style={{ boxSizing: 'border-box', width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
                </div>
                <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>연락처 (Mobile)</label>
                  <input type="text" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="예: +971-50-XXX" style={{ boxSizing: 'border-box', width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
                </div>
                <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>이메일 주소</label>
                  <input type="email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} placeholder="예: john@buyer.com" style={{ boxSizing: 'border-box', width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
                </div>
                <div style={{ flex: 2.2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>비고 (역할 등)</label>
                  <input type="text" value={newContactRemarks} onChange={e => setNewContactRemarks(e.target.value)} placeholder="예: 주 통신 채널" style={{ boxSizing: 'border-box', width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
                </div>
                {editingContactId ? (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!newContactName.trim()) { alert('담당자 이름은 필수입니다.'); return; }
                        setFormData(prev => ({
                          ...prev,
                          contacts: (prev.contacts || []).map(c => c.id === editingContactId ? {
                            ...c,
                            name: newContactName.trim(),
                            position: newContactPosition.trim() || undefined,
                            phone: newContactPhone.trim() || undefined,
                            email: newContactEmail.trim() || undefined,
                            remarks: newContactRemarks.trim() || undefined
                          } : c)
                        }));
                        setEditingContactId(null);
                        setNewContactName(''); setNewContactPosition(''); setNewContactPhone(''); setNewContactEmail(''); setNewContactRemarks('');
                      }}
                      style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 10px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', height: '26px', whiteSpace: 'nowrap' }}
                    >
                      수정완료
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingContactId(null);
                        setNewContactName(''); setNewContactPosition(''); setNewContactPhone(''); setNewContactEmail(''); setNewContactRemarks('');
                      }}
                      style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', padding: '5px 10px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', height: '26px', whiteSpace: 'nowrap' }}
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!newContactName.trim()) { alert('담당자 이름은 필수입니다.'); return; }
                      const newContact: CustomerContact = {
                        id: 'contact_' + Math.random().toString(36).substr(2, 9),
                        name: newContactName.trim(),
                        position: newContactPosition.trim() || undefined,
                        phone: newContactPhone.trim() || undefined,
                        email: newContactEmail.trim() || undefined,
                        isPrimary: (formData.contacts || []).length === 0,
                        remarks: newContactRemarks.trim() || undefined
                      };
                      setFormData(prev => ({
                        ...prev,
                        contacts: [...(prev.contacts || []), newContact]
                      }));
                      setNewContactName(''); setNewContactPosition(''); setNewContactPhone(''); setNewContactEmail(''); setNewContactRemarks('');
                    }}
                    style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 12px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', height: '26px' }}
                  >
                    + 추가
                  </button>
                )}
              </div>

              {/* 테이블 명부 */}
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '5px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700 }}>
                      <th style={{ padding: '3px 6px', width: '45px', textAlign: 'center' }}>대표</th>
                      <th style={{ padding: '3px 6px', width: '140px' }}>이름 (직책)</th>
                      <th style={{ padding: '3px 6px', width: '230px' }}>연락망 (연락처 / 이메일)</th>
                      <th style={{ padding: '3px 6px' }}>역할 / 특이사항</th>
                      <th style={{ padding: '3px 6px', width: '100px', textAlign: 'center' }}>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formData.contacts || []).map((c: any) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                          <input type="radio" checked={c.isPrimary} onChange={() => setFormData(prev => ({ ...prev, contacts: prev.contacts?.map((ct: any) => ({ ...ct, isPrimary: ct.id === c.id })) }))} />
                        </td>
                        <td style={{ padding: '3px 6px' }}>{c.name}<br /><span style={{ color: 'var(--text-secondary)' }}>{c.position}</span></td>
                        <td style={{ padding: '3px 6px' }}>{c.phone}<br /><span style={{ color: 'var(--text-secondary)' }}>{c.email}</span></td>
                        <td style={{ padding: '3px 6px' }}>{c.remarks}</td>
                        <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                          <button type="button" onClick={() => { setEditingContactId(c.id); setNewContactName(c.name); setNewContactPosition(c.position || ''); setNewContactPhone(c.phone || ''); setNewContactEmail(c.email || ''); setNewContactRemarks(c.remarks || ''); }} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', marginRight: '12px', fontSize: '13px', fontWeight: 600 }}>수정</button>
                          <button type="button" onClick={() => setFormData(prev => ({ ...prev, contacts: prev.contacts?.filter((ct: any) => ct.id !== c.id) }))} title="삭제" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '14px' }}>🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button 
            onClick={handleClose} 
            style={{ padding: '0 18px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', fontWeight: 700, color: '#475569', cursor: 'pointer', fontSize: '13px', transition: 'background 0.2s', height: '34px', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          >취소</button>
          <button 
            onClick={handleSave} 
            disabled={isSaving} 
            style={{ padding: '0 18px', borderRadius: '4px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px', transition: 'background 0.2s', height: '34px', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            {isSaving ? '저장 중...' : '✔ 고객 정보 저장'}
          </button>
        </div>

      </div>
    </div>
    {isSupplierSearchOpen && (
      <SupplierSearchModal
        suppliers={allSuppliers}
        onClose={() => setIsSupplierSearchOpen(false)}
        onSelect={(s) => {
          handleChange('linkedSupplierId', s.id);
          handleChange('linkedSupplierName', s.name || s.supplierCode);
          setIsSupplierSearchOpen(false);
        }}
      />
    )}
    </>
  );
};

const Input = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '', step, labelColor = '#475569' }: any) => {
  const isRequired = label?.includes('★');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '11px', fontWeight: 750, color: labelColor, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
        {label?.replace(' ★', '')}
        {isRequired && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
      </label>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        step={step}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          padding: '0 10px',
          border: '1px solid #cbd5e1',
          borderRadius: '4px',
          fontSize: '13px',
          fontWeight: 600,
          background: disabled ? '#f8fafc' : '#fff',
          color: disabled ? '#94a3b8' : '#1e293b',
          outline: 'none',
          height: '34px',
          transition: 'all 0.1s'
        }}
        onFocus={e => { if(!disabled) { e.target.style.borderColor = '#3b82f6'; } }}
        onBlur={e => { e.target.style.borderColor = '#cbd5e1'; }}
      />
    </div>
  );
};

const Select = ({ label, value, onChange, options }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>{label}</label>
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        padding: '0 10px',
        border: '1px solid #cbd5e1',
        borderRadius: '4px',
        fontSize: '13px',
        fontWeight: 600,
        background: '#fff',
        color: '#1e293b',
        outline: 'none',
        height: '34px'
      }}
    >
      {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);
