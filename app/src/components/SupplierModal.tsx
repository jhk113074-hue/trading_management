import React, { useState, useEffect, useRef, useMemo } from 'react';
import { doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Supplier, SupplierContact } from '../types/supplier';
import type { Customer } from '../types/customer';
import { CustomerSearchModal } from './CustomerSearchModal';

interface Props {
  initialSupplier?: Supplier;
  onClose: () => void;
  onSave?: (supplier: Supplier) => void;
  defaultCategory?: '공급사' | '포워딩사';
}

export const SupplierModal: React.FC<Props> = ({ initialSupplier, onClose, onSave, defaultCategory }) => {
  const [isSaving, setIsSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<'info' | 'purchase'>('info');

  // Integrated Purchase & Payment History State
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([]);
  const [isLoadingPurchase, setIsLoadingPurchase] = useState(false);
  const [selectedPurchaseYear, setSelectedPurchaseYear] = useState<string>('ALL');

  const availableYears = useMemo<string[]>(() => {
    return Array.from(new Set(purchaseHistory.map((s: any) => s.year).filter((y: any) => y && y !== '-'))).sort().reverse();
  }, [purchaseHistory]);

  const filteredList = useMemo<any[]>(() => {
    if (selectedPurchaseYear === 'ALL') return purchaseHistory;
    return purchaseHistory.filter((s: any) => s.year === selectedPurchaseYear);
  }, [purchaseHistory, selectedPurchaseYear]);

  const purchaseCount = useMemo<number>(() => filteredList.length, [filteredList]);

  // 다중 담당자 임시 추가용 state
  const [newContactName, setNewContactName] = useState('');
  const [newContactPosition, setNewContactPosition] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactRemarks, setNewContactRemarks] = useState('');

  // 세분화된 은행 상태
  const [krwBankName, setKrwBankName] = useState('');
  const [krwBankAccount, setKrwBankAccount] = useState('');
  const [krwBankHolder, setKrwBankHolder] = useState('');

  const [usdBankName, setUsdBankName] = useState('');
  const [usdBankAccount, setUsdBankAccount] = useState('');
  const [usdBankHolder, setUsdBankHolder] = useState('');
  const [usdSwift, setUsdSwift] = useState('');

  const [formData, setFormData] = useState<Partial<Supplier>>({
    supplierCode: '', name: '', bizNumber: '', representative: '',
    phone: '', purchaseEmail: '', address: '', managerName: '', managerPhone: '',
    category: defaultCategory || '공급사', bankKrw: '', bankUsd: '', contacts: [],
    countryType: '국내'
  });

  const supplierId = initialSupplier?.id || '';
  const supplierCode = formData.supplierCode || initialSupplier?.supplierCode || '';
  const supplierName = formData.name || initialSupplier?.name || '';

  const stableSupplierKey = useMemo(
    () => `${supplierId}|${supplierCode}|${supplierName}`,
    [supplierId, supplierCode, supplierName]
  );

  // 겸업(고객사 연결) 검색용
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);

  const openCustomerSearch = async () => {
    try {
      const snap = await getDocs(collection(db, 'companies', COMPANY_ID, 'customers'));
      setAllCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    } catch (err) {
      console.error('고객사 목록 조회 오류:', err);
    }
    setIsCustomerSearchOpen(true);
  };

  const parseBankString = (text: string) => {
    let swift = '';
    let bankName = '';
    let accountNo = '';
    let holder = '';

    const textClean = (text || '').trim();
    if (!textClean) return { bankName, accountNo, holder, swift };

    // 1. Extract SWIFT
    const swiftIndex = textClean.toUpperCase().indexOf('SWIFT:');
    let rawAccountAndHolder = textClean;
    if (swiftIndex !== -1) {
      swift = textClean.substring(swiftIndex + 6).trim();
      rawAccountAndHolder = textClean.substring(0, swiftIndex).trim();
    }

    // 2. Extract Holder inside parentheses
    const parenStart = rawAccountAndHolder.indexOf('(');
    const parenEnd = rawAccountAndHolder.lastIndexOf(')');
    let textLeft = rawAccountAndHolder;
    if (parenStart !== -1 && parenEnd !== -1 && parenEnd > parenStart) {
      holder = rawAccountAndHolder.substring(parenStart + 1, parenEnd).trim();
      textLeft = (rawAccountAndHolder.substring(0, parenStart) + ' ' + rawAccountAndHolder.substring(parenEnd + 1)).trim();
    }

    // 3. Extract Account Number (look for a token containing at least 4 digits, or digits with dashes)
    const tokens = textLeft.split(/\s+/);
    let accountTokenIndex = -1;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const digitCount = (tok.match(/\d/g) || []).length;
      if (digitCount >= 4) {
        accountNo = tok;
        accountTokenIndex = i;
        break;
      }
    }

    // 4. Determine Bank Name
    if (accountTokenIndex !== -1) {
      bankName = tokens.slice(0, accountTokenIndex).join(' ').trim();
      if (!holder) {
        holder = tokens.slice(accountTokenIndex + 1).join(' ').trim();
      }
    } else {
      if (tokens.length >= 2) {
        bankName = tokens[0];
        accountNo = tokens.slice(1).join(' ').trim();
      } else {
        accountNo = textLeft;
      }
    }

    return { bankName, accountNo, holder, swift };
  };

  // 기존 bankKrw/bankUsd 역파싱하여 개별 상태에 채워넣기
  useEffect(() => {
    if (initialSupplier) {
      setFormData({
        ...initialSupplier,
        contacts: initialSupplier.contacts || []
      });

      // 1. 원화 통장 역파싱
      if (initialSupplier.bankKrw) {
        const { bankName, accountNo, holder } = parseBankString(initialSupplier.bankKrw);
        setKrwBankName(bankName);
        setKrwBankAccount(accountNo);
        setKrwBankHolder(holder);
      }

      // 2. 외화 통장 역파싱
      if (initialSupplier.bankUsd) {
        const { bankName, accountNo, holder, swift } = parseBankString(initialSupplier.bankUsd);
        setUsdBankName(bankName);
        setUsdBankAccount(accountNo);
        setUsdBankHolder(holder);
        setUsdSwift(swift);
      }
    }
  }, [initialSupplier]);

  useEffect(() => {
    if (initialSupplier && initialSupplier.supplierCode && initialSupplier.supplierCode.trim() !== '' && initialSupplier.supplierCode.trim() !== '-') return;

    const generateCode = async () => {
      let maxNum = 0;
      try {
        const snap = await getDocs(collection(db, 'companies', COMPANY_ID, 'suppliers'));
        snap.docs.forEach(d => {
          const code = d.data().supplierCode || d.id;
          if (code && typeof code === 'string') {
            const match = code.match(/^(?:SUP-|S)(\d+)$/i);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxNum) maxNum = num;
            }
          }
        });
      } catch (err) {
        console.error('공급업체코드 자동발번 오류:', err);
      }
      
      const nextCode = 'S' + String(maxNum + 1).padStart(4, '0');
      setFormData(prev => ({ ...prev, supplierCode: nextCode }));
    };

    generateCode();
  }, [initialSupplier]);

  // Integrated Purchase & Payment History Subscription using getDocs (1-time async fetch)
  useEffect(() => {
    const targetId = String(initialSupplier?.id || formData.supplierCode || '').trim();
    const targetCode = String(formData.supplierCode || initialSupplier?.supplierCode || '').trim();
    const targetName = String(formData.name || initialSupplier?.name || '').trim().toLowerCase().replace(/\s+/g, '');

    if (!targetId && !targetCode && !targetName) {
      setPurchaseHistory([]);
      setIsLoadingPurchase(false);
      return;
    }

    let cancelled = false;

    const fetchPurchaseHistory = async () => {
      setIsLoadingPurchase(true);

      try {
        const ordersRef = collection(db, 'companies', COMPANY_ID, 'orders');
        const importsRef = collection(db, 'companies', COMPANY_ID, 'imports');
        const productsRef = collection(db, 'companies', COMPANY_ID, 'products');

        const parseDateStr = (rawDate: any) => {
          if (!rawDate) return '-';
          if (typeof rawDate === 'string') return rawDate.substring(0, 10);
          if (rawDate?.toDate && typeof rawDate.toDate === 'function') {
            return rawDate.toDate().toISOString().substring(0, 10);
          }
          return '-';
        };

        const cleanTargetName = targetName.replace(/[^a-z0-9가-힣]/g, '');

        // 상품 마스터 DB 조회 (발주서 표 단가 계산 알고리즘과 동일)
        const productsSnap = await getDocs(productsRef);
        const productsList: any[] = productsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const getSupplierPurchaseInfo = (it: any) => {
          const match = (it.name || '').match(/^\[(.*?)\]\s*(.*)$/);
          const itemCode = match ? match[1] : '-';
          const matchedProd = productsList.find(p => p.productCode === itemCode || p.id === itemCode);

          let defaultPrice = matchedProd ? (matchedProd.purchasePrice || 0) : (it.unitPrice || 0);
          let defaultCurrency = matchedProd ? (matchedProd.currency || 'USD') : 'USD';

          if (matchedProd && matchedProd.purchasePrices && matchedProd.purchasePrices.length > 0) {
            const activeSup = (it.supplier || '').trim();
            let matchedHists = matchedProd.purchasePrices.filter((p: any) => (p.supplierName || '').trim() === activeSup || p.supplierCode === activeSup);
            if (matchedHists.length === 0 && matchedProd.suppliers && matchedProd.suppliers.length > 0) {
              const def = matchedProd.suppliers.find((s: any) => s.isDefault) || matchedProd.suppliers[0];
              matchedHists = matchedProd.purchasePrices.filter((p: any) => p.supplierCode === def.supplierCode || p.supplierName === def.supplierName);
            }
            if (matchedHists.length > 0) {
              matchedHists.sort((a: any, b: any) => (b.validFrom || '').localeCompare(a.validFrom || ''));
              defaultPrice = matchedHists[0].price;
              defaultCurrency = matchedHists[0].currency;
            }
          }

          const originalPurchasePrice = it.originalPurchasePrice != null 
            ? it.originalPurchasePrice 
            : (it.purchaseUnitPrice != null ? it.purchaseUnitPrice : defaultPrice);
          const purchasePrice = defaultPrice > 0 ? defaultPrice : (it.purchaseUnitPrice != null ? it.purchaseUnitPrice : originalPurchasePrice);

          let purchaseCurrency = it.purchaseUnitCurrency;
          if (!purchaseCurrency) {
            if (it.originalPurchaseCurrency) {
              purchaseCurrency = it.originalPurchaseCurrency;
            } else if (purchasePrice > 1000) {
              purchaseCurrency = 'KRW';
            } else if (matchedProd) {
              purchaseCurrency = defaultCurrency === 'KRW' ? 'KRW' : 'USD';
            } else {
              purchaseCurrency = 'USD';
            }
          }
          return { purchasePrice, purchaseCurrency };
        };

        // 1. Imports Collection (수입 매입건)
        const importSnap = await getDocs(importsRef);
        const importRecords: any[] = [];
        importSnap.docs.forEach((d: any) => {
          const data = d.data();
          const sCode = String(data.supplierCode || data.sellerCode || '').trim().toLowerCase();
          const sId = String(data.supplierId || '').trim().toLowerCase();
          const rawSName = String(data.importerName || data.sellerName || data.supplierName || '').trim();
          const sNameClean = rawSName.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

          const matchCode = targetCode && (sCode === targetCode.toLowerCase() || sId === targetCode.toLowerCase());
          const matchId = targetId && (sId === targetId.toLowerCase() || sCode === targetId.toLowerCase());
          let matchName = false;
          if (cleanTargetName && cleanTargetName.length >= 2) {
            matchName = sNameClean.includes(cleanTargetName) || cleanTargetName.includes(sNameClean);
          }

          if (matchCode || matchId || matchName) {
            const piItemsTotal = (data.piItems || []).reduce((sum: number, item: any) => {
              return sum + Number(item.totalAmount || (Number(item.unitPrice || 0) * Number(item.qty || item.quantity || 1)));
            }, 0);
            const totAmtUsd = piItemsTotal > 0 ? piItemsTotal
              : Number(data.costBreakdown?.buyingPriceUsd || data.totalAmount || data.totalAmountUsd || data.invoiceAmount || 0);
            
            // 대금지급액 계산 (payments 배열의 송금 완료 금액 총합)
            let paidAmtUsd = 0;
            if (Array.isArray(data.payments) && data.payments.length > 0) {
              paidAmtUsd = data.payments.reduce((sum: number, p: any) => sum + Number(p.amountUsd || p.amount || 0), 0);
            } else if (data.payoutStatus === 'PAID' || data.paymentStatus === 'COMPLETED' || data.status === '완료') {
              paidAmtUsd = totAmtUsd;
            } else {
              paidAmtUsd = Number(data.paidAmountUsd || data.paidAmount || 0);
            }

            const isPaidFull = paidAmtUsd >= totAmtUsd && totAmtUsd > 0;
            const isPartial = paidAmtUsd > 0 && !isPaidFull;
            const dateStr = parseDateStr(data.importDate || data.requestDate || data.blDate || data.createdAt);

            importRecords.push({
              id: d.id,
              type: '수입',
              date: dateStr,
              year: dateStr.substring(0, 4),
              ciNumber: data.piNumber || data.poNumber || data.blAwb || data.invoiceNo || data.importNo || d.id,
              supplyAmount: totAmtUsd,
              vatAmount: 0,
              totalAmount: totAmtUsd,
              currency: 'USD',
              paidAmount: paidAmtUsd,
              paymentStatus: isPaidFull ? '지급완료' : isPartial ? '부분지급' : '미지급'
            });
          }
        });

        // 2. Export Orders Collection — 소싱/발주 탭의 공급사별 발주 내역
        const orderSnap = await getDocs(ordersRef);
        const orderRecords: any[] = [];

        const supplierNameForMatch = String(formData.name || initialSupplier?.name || '').trim();
        const supplierNameClean = supplierNameForMatch.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

        orderSnap.docs.forEach((d: any) => {
          const data = d.data();
          const items: any[] = data.items || [];
          const basicForm = data.basicForm || {};
          const supplierPaymentInstallments = data.supplierPaymentInstallments || basicForm.supplierPaymentInstallments || {};
          const supplierPayments = data.supplierPayments || basicForm.supplierPayments || {};

          // 이 오더에서 해당 공급사에 해당하는 품목만 필터링 (정확 일치 매칭)
          const matchedItems = items.filter((item: any) => {
            const iSupp = String(item.supplier || item.supplierName || '').trim();
            if (!iSupp) return false;
            const iSuppClean = iSupp.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
            const iCode = String(item.supplierCode || '').trim().toLowerCase();
            
            // 1순위: 공급사 코드로 정확 매칭
            if (targetCode && iCode === targetCode.toLowerCase()) return true;
            if (targetId && iCode === targetId.toLowerCase()) return true;
            // 2순위: 이름 정확 일치만 (포함 관계 제거)
            return iSuppClean === supplierNameClean;
          });

          if (matchedItems.length === 0) return; // 이 오더는 이 공급사와 무관 — 스킵

          // 발주 금액 계산 (공급가액, 부가세, 합계)
          let totAmtKrw = 0;
          let totAmtUsd = 0;
          let vatKrw = 0;
          let vatUsd = 0;
          const exRate = Number(data.exchangeRate || data.appliedExchangeRate || basicForm.exchangeRate || 1380);

          matchedItems.forEach((item: any) => {
            const qty = Number(item.qty || item.quantity || 1);
            const { purchasePrice, purchaseCurrency } = getSupplierPurchaseInfo(item);
            const currency = String(purchaseCurrency || 'KRW').toUpperCase();
            if (currency === 'USD') {
              totAmtUsd += qty * purchasePrice;
            } else {
              totAmtKrw += qty * purchasePrice;
            }
          });

          // 부가세(VAT) 계산 (기본 과세 10%, 영세인 경우 0)
          const supplierTaxTypes = data.supplierTaxTypes || basicForm.supplierTaxTypes || {};
          const matchedTaxTypeKey = Object.keys(supplierTaxTypes).find(key => {
            const keyClean = key.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
            return supplierNameClean && keyClean.includes(supplierNameClean);
          });
          const taxType = matchedTaxTypeKey ? supplierTaxTypes[matchedTaxTypeKey] : '과세';

          if (taxType !== '영세') {
            vatKrw = Math.round(totAmtKrw * 0.1);
            vatUsd = parseFloat((totAmtUsd * 0.1).toFixed(2));
          }

          let finalSupplyKrw = Math.round(totAmtKrw + (totAmtUsd * exRate));
          let finalVatKrw = Math.round(vatKrw + (vatUsd * exRate));
          let finalAmtKrw = finalSupplyKrw + finalVatKrw;

          // 1. 세금계산서 증빙 등록이 되어 있는 경우, 세금계산서 발행 금액을 최종 계약/매입 금액으로 최우선 적용
          const supplierTaxInvoiceDetails = data.supplierTaxInvoiceDetails || basicForm.supplierTaxInvoiceDetails || {};
          const matchedTaxKey = Object.keys(supplierTaxInvoiceDetails).find(key => {
            const keyClean = key.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
            return supplierNameClean && keyClean.includes(supplierNameClean);
          });

          if (matchedTaxKey && supplierTaxInvoiceDetails[matchedTaxKey]?.length > 0) {
            const taxInvoices: any[] = supplierTaxInvoiceDetails[matchedTaxKey];
            const sumSupply = taxInvoices.reduce((sum, inv) => sum + Number(inv.supplyAmount || 0), 0);
            const sumVat = taxInvoices.reduce((sum, inv) => sum + Number(inv.vatAmount || 0), 0);
            if (sumSupply > 0) {
              finalSupplyKrw = sumSupply;
              finalVatKrw = sumVat;
              finalAmtKrw = sumSupply + sumVat;
            }
          }

          // 2. 대금 지급 내역: supplierPaymentInstallments에서 송금 완료액 가져옴
          let paidAmtKrw = 0;
          let paymentStatusStr = '미지급';

          const matchedSupplierKey = Object.keys(supplierPaymentInstallments).find(key => {
            const keyClean = key.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
            return supplierNameClean && keyClean.includes(supplierNameClean);
          });

          if (matchedSupplierKey) {
            const installments: any[] = supplierPaymentInstallments[matchedSupplierKey] || [];
            paidAmtKrw = installments.reduce((sum: number, inst: any) => sum + Number(inst.amount || 0), 0);
            const payStatus = supplierPayments[matchedSupplierKey]?.status || '';
            if (payStatus === '입금완료' || payStatus === 'PAID' || (paidAmtKrw >= finalAmtKrw && finalAmtKrw > 0)) {
              paymentStatusStr = '지급완료';
            } else if (paidAmtKrw > 0) {
              paymentStatusStr = '부분지급';
            }
          }

          const dateStr = parseDateStr(data.orderDate || data.piDate || data.createdAt);
          orderRecords.push({
            id: d.id,
            type: '수출소싱',
            date: dateStr,
            year: dateStr.substring(0, 4),
            ciNumber: data.ciNumber || data.orderNo || d.id,
            supplyAmount: finalSupplyKrw,
            vatAmount: finalVatKrw,
            totalAmount: finalAmtKrw,
            currency: 'KRW',
            paidAmount: paidAmtKrw,
            paymentStatus: paymentStatusStr,
          });
        });

        if (!cancelled) {
          const list = [...importRecords, ...orderRecords];
          list.sort((a, b) => String(b.date).localeCompare(String(a.date)));
          setPurchaseHistory(list);
        }
      } catch (err: any) {
        console.error('[CRM Supplier] fetchPurchaseHistory error:', err);
        if (!cancelled) setPurchaseHistory([]);
      } finally {
        if (!cancelled) setIsLoadingPurchase(false);
      }
    };

    fetchPurchaseHistory();

    return () => { cancelled = true; };
  }, [stableSupplierKey]);

  const handleChange = (field: keyof Supplier, value: any) => {
    setIsDirty(true);
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.supplierCode?.trim()) { alert('공급업체코드는 필수 입력사항입니다.'); return; }
    if (!formData.name?.trim()) { alert('공급업체명은 필수 입력사항입니다.'); return; }

    setIsSaving(true);
    try {
      const docId = initialSupplier?.id || formData.supplierCode;
      
      let finalBankKrw = '';
      if (krwBankName.trim() || krwBankAccount.trim()) {
        finalBankKrw = (krwBankName.trim() + ' ' + krwBankAccount.trim() + ' (' + (krwBankHolder.trim() || '예금주미정') + ')').trim();
      }

      let finalBankUsd = '';
      if (usdBankName.trim() || usdBankAccount.trim()) {
        finalBankUsd = (usdBankName.trim() + ' ' + usdBankAccount.trim() + ' (' + (usdBankHolder.trim() || '예금주미정') + ')').trim();
        if (usdSwift.trim()) {
          finalBankUsd += ' SWIFT: ' + usdSwift.trim();
        }
      }

      let legacyFields = {
        managerName: '',
        managerPhone: '',
        purchaseEmail: ''
      };

      if (formData.contacts && formData.contacts.length > 0) {
        const primary = formData.contacts.find(c => c.isPrimary) || formData.contacts[0];
        legacyFields = {
          managerName: primary.name,
          managerPhone: primary.phone || '',
          purchaseEmail: primary.email || ''
        };
      }

      const finalData: Partial<Supplier> = {
        ...formData,
        ...legacyFields,
        bankKrw: finalBankKrw,
        bankUsd: finalBankUsd,
        updatedAt: serverTimestamp(),
      };

      if (!initialSupplier) {
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
      await setDoc(doc(db, 'companies', COMPANY_ID, 'suppliers', docId), sanitizedData);
      alert('✅ 성공적으로 저장되었습니다.');
      if (onSave) {
        onSave({ id: docId, ...finalData } as Supplier);
      } else {
        onClose();
      }
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

  const [position, setPosition] = useState({ x: 150, y: 120 });
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
      userSelect: isDragging ? 'none' : 'auto'
    }}>
      <div style={{ background: '#fff', borderRadius: '4px', width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(15,23,42,0.3)', border: '1px solid #cbd5e1', overflow: 'hidden' }}>

        {/* Header */}
        <div 
          onMouseDown={handleMouseDown}
          style={{ padding: '16px 24px 0 24px', borderBottom: '1px solid #cbd5e1', background: '#fafafa', cursor: 'move', userSelect: 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span>🏭</span>
              <span>{initialSupplier ? '공급업체 정보 수정 (Edit Supplier Master)' : '신규 공급업체 등록 (Register Supplier Master)'}</span>
              {(formData.name || formData.supplierCode) && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>|</span>
                  <span style={{ fontSize: '13.5px', color: '#1e3a8a', fontWeight: 800, background: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '4px' }}>
                    {formData.name || '미입력'}
                  </span>
                  {formData.supplierCode && (
                    <span style={{ fontSize: '12px', color: '#475569', fontWeight: 700, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px' }}>
                      코드: {formData.supplierCode}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button onClick={handleClose} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '20px', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Header Tabs */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setActiveTab('info')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderBottom: activeTab === 'info' ? '2.5px solid #3b82f6' : '2.5px solid transparent',
                background: 'transparent',
                fontWeight: activeTab === 'info' ? 800 : 600,
                color: activeTab === 'info' ? '#3b82f6' : '#64748b',
                cursor: 'pointer',
                fontSize: '13px',
                transition: 'all 0.15s'
              }}
            >
              📁 기본 정보 및 담당자 관리
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('purchase')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderBottom: activeTab === 'purchase' ? '2.5px solid #3b82f6' : '2.5px solid transparent',
                background: 'transparent',
                fontWeight: activeTab === 'purchase' ? 800 : 600,
                color: activeTab === 'purchase' ? '#3b82f6' : '#64748b',
                cursor: 'pointer',
                fontSize: '13px',
                transition: 'all 0.15s'
              }}
            >
              📝 매입 및 대금지급 이력 연동 ({purchaseCount > 0 ? `매입 ${purchaseCount}건` : '0건'})
            </button>
          </div>
        </div>

        {/* Body Container */}
        <div style={{ padding: '8px 12px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', background: '#f8fafc' }}>
          
          {activeTab === 'info' ? (
            <>
              {/* SECTION 1: 공급업체 기본 정보 */}
              <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                  <span style={{ color: '#0891b2' }}>🏭</span> 공급업체 기본 정보 (Supplier Profile)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  <Input label="공급업체코드 (필수) ★" value={formData.supplierCode} onChange={(v: any) => handleChange('supplierCode', v)} disabled={true} placeholder="자동 발번 중..." labelColor="#0891b2" />
                  <Input label="공급업체명 (필수) ★" value={formData.name} onChange={(v: any) => handleChange('name', v)} placeholder="예: 국도화학 주식회사" labelColor="#0891b2" />
                  <Select label="국내/해외 구분" value={formData.countryType || '국내'} onChange={(v: any) => handleChange('countryType', v)} options={['국내', '해외']} />
                  <Input label={formData.countryType === '해외' ? '사업자등록번호' : '사업자등록번호 (국내)'} value={formData.bizNumber} onChange={(v: any) => handleChange('bizNumber', v)} placeholder="000-00-00000" />
                  <Input label="대표자명" value={formData.representative} onChange={(v: any) => handleChange('representative', v)} placeholder="대표이사 성명" />
                  <Input label="업태" value={formData.bizType} onChange={(v: any) => handleChange('bizType', v)} placeholder="예: 도매 및 상품중개업" />
                  <Input label="종목" value={formData.itemName} onChange={(v: any) => handleChange('itemName', v)} placeholder="예: 화학원료" />
                  <Select label="업체 구분" value={formData.category || '공급사'} onChange={(v: any) => handleChange('category', v)} options={['공급사', '포워딩사']} />
                  <Input label="대표전화번호" value={formData.phone} onChange={(v: any) => handleChange('phone', v)} placeholder="02-XXX-XXXX" />
                  <div style={{ gridColumn: 'span 3' }}>
                    <Input label="본사 주소 (Address)" value={formData.address} onChange={(v: any) => handleChange('address', v)} placeholder="도로명 주소 또는 본사 영문 주소" />
                  </div>
                  
                  {/* 겸업 연결 통합 */}
                  <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>겸업 연결 (이 업체가 고객사이기도 한 경우)</label>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', height: '34px' }}>
                      {formData.linkedCustomerId ? (
                        <>
                          <span style={{ flex: 1, display: 'flex', alignItems: 'center', height: '34px', background: '#faf5ff', color: '#7e22ce', border: '1px solid #e9d5ff', padding: '0 10px', borderRadius: '4px', fontWeight: 700, fontSize: '12px' }}>
                            🟣 연결됨: {formData.linkedCustomerName || formData.linkedCustomerId}
                          </span>
                          <button type="button" onClick={() => { handleChange('linkedCustomerId', ''); handleChange('linkedCustomerName', ''); }}
                            style={{ height: '34px', padding: '0 12px', background: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                            연결 해제
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={openCustomerSearch}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '34px', background: '#f5f3ff', border: '1px solid #ddd6fe', color: '#7c3aed', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700 }}>
                          🔍 고객사 목록에서 연결하기
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: 통장 정보 (원화/외화 가로배치, 2열 그리드로 공간확보) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                
                {/* 원화통장 정보 */}
                <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                    <span style={{ color: '#0284c7' }}>🇰🇷</span> 원화통장 정보 (KRW Bank Account)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <Input label="원화 은행명" value={krwBankName} onChange={setKrwBankName} placeholder="예: 국민은행" />
                    <Input label="원화 계좌번호" value={krwBankAccount} onChange={setKrwBankAccount} placeholder="예: 123-45-67890" />
                    <div style={{ gridColumn: 'span 2' }}>
                      <Input label="원화 예금주" value={krwBankHolder} onChange={setKrwBankHolder} placeholder="예: (주)와이에스" />
                    </div>
                  </div>
                </div>

                {/* 외화통장 정보 */}
                <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 10px' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                    <span style={{ color: '#0369a1' }}>🇺🇸</span> 외화통장 정보 (Foreign Currency Account)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <Input label="외화 은행명" value={usdBankName} onChange={setUsdBankName} placeholder="예: 신한은행" />
                    <Input label="외화 계좌번호" value={usdBankAccount} onChange={setUsdBankAccount} placeholder="예: 987-654-321" />
                    <Input label="외화 예금주" value={usdBankHolder} onChange={setUsdBankHolder} placeholder="예: YS CO., LTD" />
                    <Input label="SWIFT Code" value={usdSwift} onChange={setUsdSwift} placeholder="SWIFT CODE" />
                  </div>
                </div>
              </div>

              {/* SECTION 3: 다중 담당자 입체 관리 */}
              <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 10px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>
                  <span style={{ color: '#3b82f6' }}>👥</span> 공급업체 담당자 명부 관리 (Multiple Contacts)
                </div>

                {/* 인라인 등록 폼 */}
                <div style={{ display: 'flex', gap: '6px', background: '#f8fafc', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', marginBottom: '8px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>담당자명 *</label>
                    <input type="text" value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="예: 홍길동" style={{ boxSizing: 'border-box', width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>직책/부서</label>
                    <input type="text" value={newContactPosition} onChange={e => setNewContactPosition(e.target.value)} placeholder="예: 구매 과장" style={{ boxSizing: 'border-box', width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
                  </div>
                  <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>연락처 (Mobile)</label>
                    <input type="text" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="예: 010-XXXX-XXXX" style={{ boxSizing: 'border-box', width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
                  </div>
                  <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>이메일 주소</label>
                    <input type="email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} placeholder="예: manager@supplier.com" style={{ boxSizing: 'border-box', width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
                  </div>
                  <div style={{ flex: 2.2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>비고 (역할 등)</label>
                    <input type="text" value={newContactRemarks} onChange={e => setNewContactRemarks(e.target.value)} placeholder="예: 발주 문의 창구" style={{ boxSizing: 'border-box', width: '100%', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newContactName.trim()) { alert('담당자 이름은 필수입니다.'); return; }
                      const newContact: SupplierContact = {
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
                        <th style={{ padding: '3px 6px', width: '50px', textAlign: 'center' }}>삭제</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!formData.contacts || formData.contacts.length === 0) ? (
                        <tr>
                          <td colSpan={5} style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>등록된 공급사 담당자가 없습니다. 상단에서 추가해 주세요.</td>
                        </tr>
                      ) : (
                        formData.contacts.map((c, idx) => (
                          <tr key={c.id || idx} style={{ borderBottom: '1px solid #f1f5f9', background: c.isPrimary ? '#faf5ff' : 'transparent' }}>
                            <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                              <input
                                type="radio"
                                name="supplier_primary_contact"
                                checked={c.isPrimary}
                                onChange={() => {
                                  setFormData(prev => ({
                                    ...prev,
                                    contacts: (prev.contacts || []).map((item, i) => ({
                                      ...item,
                                      isPrimary: i === idx
                                    }))
                                  }));
                                }}
                                style={{ cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '3px 6px', fontWeight: 700, color: c.isPrimary ? '#7e22ce' : 'var(--text-primary)' }}>
                              {c.name} {c.position && <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', fontWeight: 400 }}>({c.position})</span>}
                              {c.isPrimary && <span style={{ fontSize: '8px', background: '#f3e8ff', color: '#a855f7', border: '1px solid #d8b4fe', padding: '0px 3px', borderRadius: '2px', marginLeft: '4px' }}>대표</span>}
                            </td>
                            <td style={{ padding: '3px 6px' }}>
                              <span style={{ marginRight: '8px', fontWeight: 500 }}>📞 {c.phone || '-'}</span>
                              <span style={{ color: 'var(--text-secondary)' }}>✉️ {c.email || '-'}</span>
                            </td>
                            <td style={{ padding: '3px 6px', color: 'var(--text-secondary)' }}>{c.remarks || '-'}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData(prev => {
                                    const next = (prev.contacts || []).filter((_, i) => i !== idx);
                                    if (c.isPrimary && next.length > 0) {
                                      next[0].isPrimary = true;
                                    }
                                    return { ...prev, contacts: next };
                                  });
                                }}
                                style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444', borderRadius: '3px', padding: '1px 4px', cursor: 'pointer', fontSize: '9.5px' }}
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            /* TAB 2: 매입 및 대금지급 이력 연동 (수입/수출소싱/국내) */
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
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
                          📦 통합 매입 및 대금지급 이력 ({purchaseCount}건)
                        </span>
                        {/* Year Filter Dropdown */}
                        <select
                          value={selectedPurchaseYear}
                          onChange={(e) => setSelectedPurchaseYear(e.target.value)}
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
                          <option value="ALL">📅 전체 연도 보기 ({purchaseHistory.length}건)</option>
                          {availableYears.map((yr: string) => (
                            <option key={yr} value={yr}>{yr}년 ({purchaseHistory.filter((s: any) => s.year === yr).length}건)</option>
                          ))}
                        </select>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        * 수입주문관리, 수출소싱, 국내주문관리 실시간 매칭 기록
                      </span>
                    </div>

                    {/* Financial Summary Badges */}
                    {filteredList.length > 0 && (
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                        {totalAmtUSD > 0 && (
                          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontWeight: 800, color: '#1e40af' }}>USD 총 매입:</span>
                            <span style={{ fontWeight: 800, color: '#2563eb' }}>${totalAmtUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            <span style={{ color: '#94a3b8' }}>|</span>
                            <span style={{ fontWeight: 800, color: '#16a34a' }}>지급 완료: ${totalPaidUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            {totalAmtUSD - totalPaidUSD > 0 && (
                              <span style={{ fontWeight: 800, color: '#dc2626' }}>(미지급: ${(totalAmtUSD - totalPaidUSD).toLocaleString(undefined, { minimumFractionDigits: 2 })})</span>
                            )}
                          </div>
                        )}
                        {totalAmtKRW > 0 && (
                          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '8px 12px', borderRadius: '6px', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontWeight: 800, color: '#166534' }}>KRW 매입 총액 (세금계산서/합계):</span>
                            <span style={{ fontWeight: 800, color: '#16a34a' }}>₩{Math.round(totalAmtKRW).toLocaleString()}</span>
                            <span style={{ color: '#94a3b8' }}>|</span>
                            <span style={{ fontWeight: 800, color: '#2563eb' }}>지급 완료: ₩{Math.round(totalPaidKRW).toLocaleString()}</span>
                            {totalAmtKRW - totalPaidKRW > 0 ? (
                              <span style={{ fontWeight: 800, color: '#dc2626' }}>(미지급 잔액: ₩{Math.round(totalAmtKRW - totalPaidKRW).toLocaleString()})</span>
                            ) : (
                              <span style={{ fontWeight: 800, color: '#16a34a' }}>(전액 지급완료)</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Table */}
                    {isLoadingPurchase ? (
                      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        ⏳ 매입 및 대금지급 이력을 불러오는 중입니다...
                      </div>
                    ) : filteredList.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        📭 해당 조건의 등록된 매입/지급 이력이 없습니다.
                      </div>
                    ) : (
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                          <thead style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                            <tr>
                              <th style={{ padding: '8px 10px', fontWeight: 750, color: '#475569' }}>년월일 (Date)</th>
                              <th style={{ padding: '8px 10px', fontWeight: 750, color: '#475569' }}>구분</th>
                              <th style={{ padding: '8px 10px', fontWeight: 750, color: '#475569' }}>CI / 문서 번호</th>
                              <th style={{ padding: '8px 10px', fontWeight: 750, color: '#475569', textAlign: 'right' }}>공급가액 / 부가세</th>
                              <th style={{ padding: '8px 10px', fontWeight: 750, color: '#475569', textAlign: 'right' }}>최종 매입/계약 (합계)</th>
                              <th style={{ padding: '8px 10px', fontWeight: 750, color: '#475569', textAlign: 'right' }}>지급/결제 금액</th>
                              <th style={{ padding: '8px 10px', fontWeight: 750, color: '#475569', textAlign: 'center' }}>지급 상태</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredList.map((s: any) => {
                              const supplyFormatted = s.currency === 'KRW'
                                ? `₩${Math.round(s.supplyAmount || s.totalAmount).toLocaleString()}`
                                : `$${(s.supplyAmount || s.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                              
                              const vatFormatted = s.currency === 'KRW'
                                ? `₩${Math.round(s.vatAmount || 0).toLocaleString()}`
                                : `$${(s.vatAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

                              const totalFormatted = s.currency === 'KRW'
                                ? `₩${Math.round(s.totalAmount).toLocaleString()}`
                                : `$${s.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                              
                              const paidFormatted = s.currency === 'KRW'
                                ? `₩${Math.round(s.paidAmount).toLocaleString()}`
                                : `$${s.paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                              const isPaidFull = s.paidAmount >= s.totalAmount && s.totalAmount > 0;
                              const isPartial = s.paidAmount > 0 && !isPaidFull;

                              return (
                                <tr key={s.id} style={{ borderBottom: '1px solid #e2e8f0', height: '40px' }}>
                                  <td style={{ padding: '8px 10px', color: '#334155', fontWeight: 600 }}>{s.date}</td>
                                  <td style={{ padding: '8px 10px' }}>
                                    <span style={{
                                      padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                                      background: s.type === '수입' ? '#eff6ff' : s.type === '수출소싱' ? '#f0fdf4' : '#fefce8',
                                      color: s.type === '수입' ? '#1d4ed8' : s.type === '수출소싱' ? '#15803d' : '#a16207',
                                      border: `1px solid ${s.type === '수입' ? '#bfdbfe' : s.type === '수출소싱' ? '#bbf7d0' : '#fef08a'}`
                                    }}>
                                      {s.type === '수입' ? '🚢 수입' : s.type === '수출소싱' ? '🛫 소싱' : '🏬 국내'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '8px 10px', fontWeight: 700, color: '#1e293b' }}>{s.ciNumber}</td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '11.5px', color: '#475569' }}>
                                    <div>공급가: {supplyFormatted}</div>
                                    {s.vatAmount > 0 && <div style={{ fontSize: '11px', color: '#64748b' }}>VAT: {vatFormatted}</div>}
                                  </td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{totalFormatted}</td>
                                  <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: isPaidFull ? '#16a34a' : '#2563eb' }}>{paidFormatted}</td>
                                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                    <span style={{
                                      padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700,
                                      background: isPaidFull ? '#dcfce7' : isPartial ? '#fef9c3' : '#fee2e2',
                                      color: isPaidFull ? '#166534' : isPartial ? '#854d0e' : '#991b1b'
                                    }}>
                                      {isPaidFull ? '● 지급완료' : isPartial ? '◐ 부분지급' : '● 미지급'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                            <tr>
                              <td colSpan={4} style={{ padding: '10px', color: '#1e293b' }}>
                                📊 합계 (TOTAL - 전체 총 {filteredList.length}건)
                              </td>
                              <td style={{ padding: '10px', textAlign: 'right', color: '#0f172a' }}>
                                {totalAmtUSD > 0 && <div>${totalAmtUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>}
                                {totalAmtKRW > 0 && <div>₩{Math.round(totalAmtKRW).toLocaleString()}</div>}
                              </td>
                              <td style={{ padding: '10px', textAlign: 'right', color: '#16a34a' }}>
                                {totalAmtUSD > 0 && <div>${totalPaidUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>}
                                {totalAmtKRW > 0 && <div>₩{Math.round(totalPaidKRW).toLocaleString()}</div>}
                              </td>
                              <td style={{ padding: '10px', textAlign: 'center' }}>
                                {(totalAmtUSD - totalPaidUSD > 0 || totalAmtKRW - totalPaidKRW > 0) ? (
                                  <span style={{ color: '#dc2626', fontSize: '11px' }}>미지급 잔액 존재</span>
                                ) : (
                                  <span style={{ color: '#16a34a', fontSize: '11px' }}>전액 지급 완료</span>
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
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #cbd5e1', background: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderRadius: '0 0 4px 4px', height: '58px', boxSizing: 'border-box' }}>
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
            {isSaving ? '저장 중...' : '✔ 공급사 정보 저장'}
          </button>
        </div>

      </div>
    </div>
    {isCustomerSearchOpen && (
      <CustomerSearchModal
        customers={allCustomers}
        onClose={() => setIsCustomerSearchOpen(false)}
        onSelect={(c) => {
          handleChange('linkedCustomerId', c.id);
          handleChange('linkedCustomerName', c.name || c.nameKo || c.customerCode);
          setIsCustomerSearchOpen(false);
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
