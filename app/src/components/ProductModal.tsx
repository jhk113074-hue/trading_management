import React, { useState, useEffect } from 'react';
import { doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Product, ProductPriceHistory } from '../types/product';

interface Props {
  initialProduct?: Product;
  onClose: () => void;
  products?: Product[];
}

export const ProductModal: React.FC<Props> = ({ initialProduct, onClose }) => {
  const [activeTab, setActiveTab] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [editingMethod, setEditingMethod] = useState<any | null>(null);
  const [supplierInput, setSupplierInput] = useState('');
  const [manufacturerInput, setManufacturerInput] = useState('');
  const [sameAsSupplier, setSameAsSupplier] = useState(false);

  const [formData, setFormData] = useState<Partial<Product>>({
    productCode: undefined, nameKo: '', nameEn: '', categoryLarge: '', categoryMedium: '', categorySmall: '', description: '', imageUrl: '',
    supplierName: '', supplierCode: '', supplierContact: '', supplierPhone: '', supplierEmail: '', supplierAddress: '', minOrderQty: 0,
    manufacturerName: '', manufacturerCode: '', manufacturerContact: '', manufacturerPhone: '', manufacturerEmail: '', manufacturerAddress: '',
    purchasePrice: 0, currency: 'USD', priceValidFrom: '', priceValidTo: '', discountRate: 0, freightIncluded: 'N', purchasePrices: [],
    unit: 'KG', packageType: 'Pallet', qtyPerPallet: 0,
    unitWidth: 0, unitLength: 0, unitHeight: 0, unitWeight: 0, unitGrossWeight: 0,
    palletWidth: 0, palletLength: 0, palletHeight: 0, palletWeight: 0, palletGrossWeight: 0,
    stackable: 'Y', rotation: 'Y', color: '', material: '', origin: '',
    stockQty: 0, leadTimeDays: 0, storageLocation: '', storageTemp: '', storageHumidity: '',
    manufacturer: '', manufactureDate: '', expiryDate: '', certifications: '', msdsManaged: 'N',
    packingMethods: []
  });

  useEffect(() => {
    if (initialProduct) {
      setFormData({
        ...initialProduct,
        packingMethods: initialProduct.packingMethods || []
      });
    } else {
      setFormData(prev => ({
        ...prev,
        priceValidFrom: new Date().toISOString().split('T')[0],
        packingMethods: []
      }));
    }
  }, [initialProduct]);

  useEffect(() => {
    // Only run for new product creation (not editing)
    if (initialProduct) return;

    const generateCode = async () => {
      let maxNum = 0;
      try {
        const snap = await getDocs(collection(doc(db, 'companies', COMPANY_ID), 'products'));
        snap.docs.forEach(d => {
          const code = d.data().productCode || d.id;
          if (code && typeof code === 'string' && /^P\d+$/i.test(code)) {
            const num = parseInt(code.substring(1), 10);
            if (num > maxNum) maxNum = num;
          }
        });
        console.log('자동 상품코드 계산: 최대번호=', maxNum);
      } catch (err) {
        console.error('상품코드 자동발번 오류:', err);
      }

      const nextCode = `P${String(maxNum + 1).padStart(4, '0')}`;
      console.log('자동 상품코드 설정:', nextCode);
      setFormData(prev => ({ ...prev, productCode: nextCode }));
    };

    generateCode();
  }, [initialProduct]);

  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', COMPANY_ID, 'suppliers'));
        setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Error loading suppliers:', err);
      }
    };
    loadSuppliers();
  }, []);

  useEffect(() => {
    if (formData.supplierCode && suppliers.length > 0) {
      const found = suppliers.find(s => s.supplierCode === formData.supplierCode);
      if (found) {
        setSupplierInput(`[${found.supplierCode}] ${found.name}`);
      } else {
        setSupplierInput(formData.supplierCode);
      }
    } else {
      setSupplierInput('');
    }
  }, [formData.supplierCode, suppliers]);

  useEffect(() => {
    if (formData.manufacturerCode && suppliers.length > 0) {
      const found = suppliers.find(s => s.supplierCode === formData.manufacturerCode);
      if (found) {
        setManufacturerInput(`[${found.supplierCode}] ${found.name}`);
      } else if (formData.manufacturerName) {
        setManufacturerInput(`[${formData.manufacturerCode}] ${formData.manufacturerName}`);
      } else {
        setManufacturerInput(formData.manufacturerCode);
      }
    } else if (formData.manufacturerName) {
      // legacy: manufacturer field
      const found = suppliers.find(s => s.name === formData.manufacturerName || s.supplierCode === (formData as any).manufacturer);
      if (found) {
        setManufacturerInput(`[${found.supplierCode}] ${found.name}`);
        setFormData(prev => ({
          ...prev,
          manufacturerName: found.name,
          manufacturerCode: found.supplierCode,
          manufacturerContact: found.managerName || '',
          manufacturerPhone: found.managerPhone || found.phone || '',
          manufacturerEmail: found.purchaseEmail || '',
          manufacturerAddress: found.address || '',
        }));
      } else {
        setManufacturerInput(formData.manufacturerName);
      }
    } else {
      setManufacturerInput('');
    }
  }, [formData.manufacturerCode, formData.manufacturerName, suppliers]);

  const handleSavePackingMethod = () => {
    if (!editingMethod.name?.trim()) { alert('패킹 방법명은 필수입니다.'); return; }
    
    const list = [...(formData.packingMethods || [])];
    const isNew = !editingMethod.id;
    const methodId = editingMethod.id || `PM-${Date.now()}`;
    
    const targetMethod = {
      ...editingMethod,
      id: methodId,
      isDefault: list.length === 0 ? true : !!editingMethod.isDefault
    };

    if (targetMethod.isDefault) {
      list.forEach(m => m.isDefault = false);
    }

    if (isNew) {
      list.push(targetMethod);
    } else {
      const idx = list.findIndex(m => m.id === methodId);
      if (idx !== -1) {
        list[idx] = targetMethod;
      }
    }

    const defaultMethod = list.find(m => m.isDefault) || targetMethod;
    if (defaultMethod) {
      const isPallet = defaultMethod.packageType?.endsWith('+ Pallet') || defaultMethod.packageType === 'Pallet';
      setFormData(prev => ({
        ...prev,
        packingMethods: list,
        packageType: defaultMethod.packageType,
        qtyPerPallet: defaultMethod.qtyPerPallet || 0,
        unitWidth: defaultMethod.unitWidth || 0,
        unitLength: defaultMethod.unitLength || 0,
        unitHeight: defaultMethod.unitHeight || 0,
        unitWeight: defaultMethod.unitWeight || 0,
        unitGrossWeight: defaultMethod.unitGrossWeight || 0,
        palletWidth: defaultMethod.palletWidth || 0,
        palletLength: defaultMethod.palletLength || 0,
        palletHeight: defaultMethod.palletHeight || 0,
        palletWeight: defaultMethod.palletWeight || 0,
        palletGrossWeight: defaultMethod.palletGrossWeight || 0,
        specWidth: isPallet ? (defaultMethod.palletWidth || defaultMethod.unitWidth || 0) : (defaultMethod.unitWidth || 0),
        specLength: isPallet ? (defaultMethod.palletLength || defaultMethod.unitLength || 0) : (defaultMethod.unitLength || 0),
        specHeight: isPallet ? (defaultMethod.palletHeight || defaultMethod.unitHeight || 0) : (defaultMethod.unitHeight || 0),
        weight: isPallet ? (defaultMethod.palletWeight || defaultMethod.unitWeight || 0) : (defaultMethod.unitWeight || 0),
        grossWeight: isPallet ? (defaultMethod.palletGrossWeight || defaultMethod.unitGrossWeight || 0) : (defaultMethod.unitGrossWeight || defaultMethod.unitWeight || 0),
      }));
    } else {
      setFormData(prev => ({ ...prev, packingMethods: list }));
    }

    setEditingMethod(null);
  };

  const handleSetDefaultPacking = (id: string) => {
    const list = (formData.packingMethods || []).map(m => ({
      ...m,
      isDefault: m.id === id
    }));
    
    const defaultMethod = list.find(m => m.isDefault);
    if (defaultMethod) {
      const isPallet = defaultMethod.packageType?.endsWith('+ Pallet') || defaultMethod.packageType === 'Pallet';
      setFormData(prev => ({
        ...prev,
        packingMethods: list,
        packageType: defaultMethod.packageType,
        qtyPerPallet: defaultMethod.qtyPerPallet || 0,
        unitWidth: defaultMethod.unitWidth || 0,
        unitLength: defaultMethod.unitLength || 0,
        unitHeight: defaultMethod.unitHeight || 0,
        unitWeight: defaultMethod.unitWeight || 0,
        unitGrossWeight: defaultMethod.unitGrossWeight || 0,
        palletWidth: defaultMethod.palletWidth || 0,
        palletLength: defaultMethod.palletLength || 0,
        palletHeight: defaultMethod.palletHeight || 0,
        palletWeight: defaultMethod.palletWeight || 0,
        palletGrossWeight: defaultMethod.palletGrossWeight || 0,
        specWidth: isPallet ? (defaultMethod.palletWidth || defaultMethod.unitWidth || 0) : (defaultMethod.unitWidth || 0),
        specLength: isPallet ? (defaultMethod.palletLength || defaultMethod.unitLength || 0) : (defaultMethod.unitLength || 0),
        specHeight: isPallet ? (defaultMethod.palletHeight || defaultMethod.unitHeight || 0) : (defaultMethod.unitHeight || 0),
        weight: isPallet ? (defaultMethod.palletWeight || defaultMethod.unitWeight || 0) : (defaultMethod.unitWeight || 0),
        grossWeight: isPallet ? (defaultMethod.palletGrossWeight || defaultMethod.unitGrossWeight || 0) : (defaultMethod.unitGrossWeight || defaultMethod.unitWeight || 0),
      }));
    } else {
      setFormData(prev => ({ ...prev, packingMethods: list }));
    }
  };

  const handleDeletePackingMethod = (id: string) => {
    let list = (formData.packingMethods || []).filter(m => m.id !== id);
    if (list.length > 0 && !list.some(m => m.isDefault)) {
      list[0].isDefault = true;
    }
    setFormData(prev => ({ ...prev, packingMethods: list }));
  };

  const handleChange = (field: keyof Product, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePriceHistoryAdd = () => {
    setFormData(prev => ({
      ...prev,
      purchasePrices: [
        ...(prev.purchasePrices || []),
        { validFrom: '', validTo: '', currency: 'USD', price: 0, minQty: 0, discountRate: 0, remarks: '' }
      ]
    }));
  };

  const handlePriceHistoryChange = (index: number, field: keyof ProductPriceHistory, value: any) => {
    const newHistory = [...(formData.purchasePrices || [])];
    newHistory[index] = { ...newHistory[index], [field]: value };
    setFormData(prev => ({ ...prev, purchasePrices: newHistory }));
  };

  const handlePriceHistoryDelete = (index: number) => {
    const newHistory = [...(formData.purchasePrices || [])];
    newHistory.splice(index, 1);
    setFormData(prev => ({ ...prev, purchasePrices: newHistory }));
  };

  const handleApplyBasePrice = (index: number) => {
    const hist = formData.purchasePrices?.[index];
    if (!hist) return;
    setFormData(prev => ({
      ...prev,
      purchasePrice: hist.price,
      currency: hist.currency,
      priceValidFrom: hist.validFrom,
      priceValidTo: hist.validTo,
      discountRate: hist.discountRate
    }));
    alert('✅ 선택한 단가 정보가 현재 기준 단가로 적용되었습니다.');
  };

  const handleSave = async () => {
    if (!formData.productCode?.trim()) { alert('상품코드는 필수 입력사항입니다.'); return; }
    if (!formData.nameKo?.trim()) { alert('상품명(한글)은 필수 입력사항입니다.'); return; }

    setIsSaving(true);
    try {
      const docId = initialProduct?.id || formData.productCode;
      
      const isPallet = formData.packageType?.endsWith('+ Pallet') || formData.packageType === 'Pallet';
      const finalData: Partial<Product> = {
        ...formData,
        specWidth: isPallet ? (formData.palletWidth || formData.unitWidth || 0) : (formData.unitWidth || 0),
        specLength: isPallet ? (formData.palletLength || formData.unitLength || 0) : (formData.unitLength || 0),
        specHeight: isPallet ? (formData.palletHeight || formData.unitHeight || 0) : (formData.unitHeight || 0),
        weight: isPallet ? (formData.palletWeight || formData.unitWeight || 0) : (formData.unitWeight || 0),
        grossWeight: isPallet ? (formData.palletGrossWeight || formData.unitGrossWeight || 0) : (formData.unitGrossWeight || formData.unitWeight || 0),
        updatedAt: serverTimestamp(),
      };

      if (finalData.purchasePrices) {
        finalData.purchasePrices = finalData.purchasePrices
          .filter(p => p.price > 0)
          .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
      }

      if (!initialProduct) {
        finalData.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, 'companies', COMPANY_ID, 'products', docId), finalData);
      alert('✅ 성공적으로 저장되었습니다.');
      onClose();
    } catch (err: any) {
      alert('❌ 저장 실패: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '14px', width: '95%', maxWidth: '980px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e8ecf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', borderRadius: '14px 14px 0 0' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>
              {initialProduct ? 'Edit Product Master' : 'Add New Product Master'}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
              {initialProduct ? `상품 마스터 상세 규격 수정 (${formData.nameKo})` : '글로벌 상품 정보 및 무역원가 스펙 연동'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '22px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', border: '1px solid #e8ecf0', padding: '4px', borderRadius: '8px', marginBottom: '22px' }}>
            {[
              { id: 1, label: '📑 1. 기본 정보' },
              { id: 2, label: '🏭 2. 공급 & 공급처' },
              { id: 3, label: '💰 3. 구매 & 가격' },
              { id: 4, label: '📏 4. 규격 & 물성' },
              { id: 5, label: '📦 5. 재고 & 납기' },
              { id: 6, label: '🔬 6. 품질 & 규제' },
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, padding: '9px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer', border: 'none',
                  background: activeTab === tab.id ? '#2563eb' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : '#6b7280'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {activeTab === 1 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                  <Input label="상품코드 (필수) ★" value={formData.productCode} onChange={(v: any) => handleChange('productCode', v)} disabled={!!initialProduct} placeholder="예: PROD-CF-001" />
                  <Input label="상품명_한글 (필수) ★" value={formData.nameKo} onChange={(v: any) => handleChange('nameKo', v)} />
                  <Input label="상품명_영문" value={formData.nameEn} onChange={(v: any) => handleChange('nameEn', v)} />
                  <Input label="대분류" value={formData.categoryLarge} onChange={(v: any) => handleChange('categoryLarge', v)} />
                  <Input label="중분류" value={formData.categoryMedium} onChange={(v: any) => handleChange('categoryMedium', v)} />
                  <Input label="소분류" value={formData.categorySmall} onChange={(v: any) => handleChange('categorySmall', v)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>상품 상세 설명</label>
                  <textarea rows={3} value={formData.description} onChange={(e: any) => handleChange('description', e.target.value)} style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px' }} />
                </div>
                <Input label="상품 이미지 URL" value={formData.imageUrl} onChange={(v: any) => handleChange('imageUrl', v)} />
              </>
            )}

            {activeTab === 2 && (
              <>
                {/* ─── 공급사 섹션 ─── */}
                <div style={{ background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <span style={{ fontSize: '15px' }}>🏪</span>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#1d4ed8', margin: 0 }}>공급사 (Supplier)</h4>
                    <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: 'auto' }}>구매처 · 납품처</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>공급업체 선택 (DB 연동)</label>
                      <input
                        type="text"
                        list="suppliers_datalist"
                        value={supplierInput}
                        placeholder="공급업체 검색 또는 입력"
                        onChange={(e) => {
                          const val = e.target.value;
                          setSupplierInput(val);
                          const code = getRawSupplierCode(val);
                          const found = suppliers.find(s => s.supplierCode === code || s.name === val || `[${s.supplierCode}] ${s.name}` === val);
                          if (found) {
                            setFormData(prev => ({
                              ...prev,
                              supplierName: found.name || '',
                              supplierCode: found.supplierCode || '',
                              supplierContact: found.managerName || '',
                              supplierPhone: found.managerPhone || found.phone || '',
                              supplierEmail: found.purchaseEmail || '',
                              supplierAddress: found.address || '',
                            }));
                          } else {
                            setFormData(prev => ({ ...prev, supplierCode: val }));
                          }
                        }}
                        style={{ padding: '9px 11px', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                      />
                      <datalist id="suppliers_datalist">
                        {suppliers.map(s => (
                          <option key={s.id} value={`[${s.supplierCode}] ${s.name}`}>
                            {s.name} ({s.supplierCode})
                          </option>
                        ))}
                      </datalist>
                    </div>
                    <Input label="공급업체명" value={formData.supplierName} onChange={(v: any) => handleChange('supplierName', v)} />
                    <Input label="공급업체코드" value={formData.supplierCode} onChange={(v: any) => handleChange('supplierCode', v)} />
                    <Input label="공급처 주 담당자명" value={formData.supplierContact} onChange={(v: any) => handleChange('supplierContact', v)} />
                    <Input label="공급처 연락처" value={formData.supplierPhone} onChange={(v: any) => handleChange('supplierPhone', v)} />
                    <Input label="공급처 이메일" value={formData.supplierEmail} onChange={(v: any) => handleChange('supplierEmail', v)} type="email" />
                    <Input label="최소주문수량 (MOQ)" value={formData.minOrderQty} onChange={(v: any) => handleChange('minOrderQty', parseFloat(v) || 0)} type="number" />
                  </div>
                  <div style={{ marginTop: '14px' }}>
                    <Input label="공급업체 주소" value={formData.supplierAddress} onChange={(v: any) => handleChange('supplierAddress', v)} />
                  </div>
                </div>

                {/* ─── 제조사 섹션 ─── */}
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                    <span style={{ fontSize: '15px' }}>🏭</span>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#15803d', margin: 0 }}>제조사 (Manufacturer)</h4>
                    {/* ✅ 공급업체와 동일 체크박스 */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#15803d', background: '#dcfce7', padding: '3px 10px', borderRadius: '20px', border: '1px solid #86efac' }}>
                      <input
                        type="checkbox"
                        checked={sameAsSupplier}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSameAsSupplier(checked);
                          if (checked) {
                            setFormData(prev => ({
                              ...prev,
                              manufacturerName: prev.supplierName || '',
                              manufacturerCode: prev.supplierCode || '',
                              manufacturerContact: prev.supplierContact || '',
                              manufacturerPhone: prev.supplierPhone || '',
                              manufacturerEmail: prev.supplierEmail || '',
                              manufacturerAddress: prev.supplierAddress || '',
                            }));
                            setManufacturerInput(supplierInput);
                          }
                        }}
                        style={{ width: '14px', height: '14px', accentColor: '#16a34a', cursor: 'pointer' }}
                      />
                      공급업체와 동일
                    </label>
                    <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: 'auto' }}>생산 공장 · 원산지 제조처</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>제조사 선택 (DB 연동)</label>
                      <input
                        type="text"
                        list="manufacturers_datalist"
                        value={manufacturerInput}
                        placeholder="제조사 검색 또는 직접 입력"
                        disabled={sameAsSupplier}
                        onChange={(e) => {
                          const val = e.target.value;
                          setManufacturerInput(val);
                          const code = getRawSupplierCode(val);
                          const found = suppliers.find(s => s.supplierCode === code || s.name === val || `[${s.supplierCode}] ${s.name}` === val);
                          if (found) {
                            setFormData(prev => ({
                              ...prev,
                              manufacturerName: found.name || '',
                              manufacturerCode: found.supplierCode || '',
                              manufacturerContact: found.managerName || '',
                              manufacturerPhone: found.managerPhone || found.phone || '',
                              manufacturerEmail: found.purchaseEmail || '',
                              manufacturerAddress: found.address || '',
                            }));
                          } else {
                            setFormData(prev => ({ ...prev, manufacturerName: val, manufacturerCode: getRawSupplierCode(val) || val }));
                          }
                        }}
                        style={{ padding: '9px 11px', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '13px', background: sameAsSupplier ? '#f0fdf4' : '#fff', color: sameAsSupplier ? '#6b7280' : undefined, cursor: sameAsSupplier ? 'not-allowed' : undefined }}
                      />
                      <datalist id="manufacturers_datalist">
                        {suppliers.map(s => (
                          <option key={s.id} value={`[${s.supplierCode}] ${s.name}`}>
                            {s.name} ({s.supplierCode})
                          </option>
                        ))}
                      </datalist>
                    </div>
                    <Input label="제조사명" value={formData.manufacturerName} onChange={(v: any) => handleChange('manufacturerName', v)} disabled={sameAsSupplier} />
                    <Input label="제조사코드" value={formData.manufacturerCode} onChange={(v: any) => handleChange('manufacturerCode', v)} disabled={sameAsSupplier} />
                    <Input label="제조사 담당자명" value={formData.manufacturerContact} onChange={(v: any) => handleChange('manufacturerContact', v)} disabled={sameAsSupplier} />
                    <Input label="제조사 연락처" value={formData.manufacturerPhone} onChange={(v: any) => handleChange('manufacturerPhone', v)} disabled={sameAsSupplier} />
                    <Input label="제조사 이메일" value={formData.manufacturerEmail} onChange={(v: any) => handleChange('manufacturerEmail', v)} disabled={sameAsSupplier} type="email" />
                  </div>
                  <div style={{ marginTop: '14px' }}>
                    <Input label="제조사 주소" value={formData.manufacturerAddress} onChange={(v: any) => handleChange('manufacturerAddress', v)} disabled={sameAsSupplier} />
                  </div>
                </div>
              </>
            )}

            {activeTab === 3 && (
              <>
                <div style={{ background: '#f8fafc', border: '1px solid #e8ecf0', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#2563eb', marginBottom: '12px' }}>⭐ 현재 기준 단가</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                    <Input label="구매가 (원가)" value={formData.purchasePrice} onChange={(v: any) => handleChange('purchasePrice', parseFloat(v) || 0)} type="number" step="0.0001" />
                    <Select label="구매 통화" value={formData.currency} onChange={(v: any) => handleChange('currency', v)} options={['USD', 'KRW', 'EUR']} />
                    <Input label="유효시작일" value={formData.priceValidFrom} onChange={(v: any) => handleChange('priceValidFrom', v)} type="date" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginTop: '14px' }}>
                    <Select label="배송료 포함" value={formData.freightIncluded} onChange={(v: any) => handleChange('freightIncluded', v)} options={['N', 'Y']} />
                  </div>
                </div>

                <div style={{ border: '1px solid #e8ecf0', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 600 }}>📋 단가 이력 및 조건 목록</h4>
                    <button onClick={handlePriceHistoryAdd} style={{ padding: '5px 12px', fontSize: '11px', background: '#fff', border: '1px solid #e8ecf0', borderRadius: '4px', cursor: 'pointer' }}>＋ 단가 추가</button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e8ecf0', textAlign: 'left' }}>
                          <th style={{ padding: '8px' }}>시작일</th>
                          <th style={{ padding: '8px' }}>통화</th>
                          <th style={{ padding: '8px' }}>단가</th>
                          <th style={{ padding: '8px' }}>MOQ</th>
                          <th style={{ padding: '8px' }}>비고</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>작업</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(formData.purchasePrices || []).map((h, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #e8ecf0' }}>
                            <td><input type="date" value={h.validFrom} onChange={(e: any) => handlePriceHistoryChange(i, 'validFrom', e.target.value)} style={gridInputStyle} /></td>
                            <td><select value={h.currency} onChange={(e: any) => handlePriceHistoryChange(i, 'currency', e.target.value)} style={gridInputStyle}><option>USD</option><option>KRW</option><option>EUR</option></select></td>
                            <td><input type="number" step="0.0001" value={h.price} onChange={(e: any) => handlePriceHistoryChange(i, 'price', parseFloat(e.target.value) || 0)} style={gridInputStyle} /></td>
                            <td><input type="number" value={h.minQty} onChange={(e: any) => handlePriceHistoryChange(i, 'minQty', parseFloat(e.target.value) || 0)} style={gridInputStyle} /></td>
                            <td><input type="text" value={h.remarks} onChange={(e: any) => handlePriceHistoryChange(i, 'remarks', e.target.value)} style={gridInputStyle} /></td>
                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <button onClick={() => handleApplyBasePrice(i)} style={{ background: 'rgba(5,150,105,0.05)', color: '#059669', border: '1px solid #059669', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', marginRight: '4px', cursor: 'pointer' }}>⭐ 기준</button>
                              <button onClick={() => handlePriceHistoryDelete(i)} style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', padding: '3px 6px', fontSize: '11px', cursor: 'pointer' }}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {activeTab === 4 && (
              <>
                <div style={{ background: '#f8fafc', border: '1px solid #e8ecf0', borderRadius: '8px', padding: '16px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#2563eb', marginBottom: '12px' }}>📋 공통 사양</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    <Select label="단위" value={formData.unit} onChange={(v: any) => handleChange('unit', v)} options={['KG', 'BOX', 'M', 'M2', 'M3', 'EA', 'SET']} />
                    <Select label="다단 적재" value={formData.stackable} onChange={(v: any) => handleChange('stackable', v)} options={['Y', 'N']} />
                    <Select label="회전 허용" value={formData.rotation} onChange={(v: any) => handleChange('rotation', v)} options={['Y', 'N']} />
                    <Input label="색상" value={formData.color} onChange={(v: any) => handleChange('color', v)} />
                    <Input label="재질" value={formData.material} onChange={(v: any) => handleChange('material', v)} />
                    <div style={{ gridColumn: 'span 2' }}>
                      <Input label="원산지" value={formData.origin} onChange={(v: any) => handleChange('origin', v)} />
                    </div>
                  </div>
                </div>

                {/* Packing Methods list */}
                <div style={{ border: '1px solid #e8ecf0', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#2563eb', margin: 0 }}>📦 제품 패킹(포장) 방법 목록</h4>
                    <button 
                      type="button" 
                      onClick={() => setEditingMethod({
                        name: '', packageType: 'Single', unit: formData.unit || 'KG', isDefault: (formData.packingMethods || []).length === 0,
                        unitWidth: 0, unitLength: 0, unitHeight: 0, unitWeight: 0, unitGrossWeight: 0,
                        qtyPerPallet: 0, palletWidth: 0, palletLength: 0, palletHeight: 0, palletWeight: 0, palletGrossWeight: 0
                      })} 
                      style={{ padding: '6px 12px', fontSize: '11px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      ＋ 새 패킹 방법 추가
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                    <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e8ecf0', textAlign: 'left' }}>
                          <th style={{ padding: '8px' }}>패킹 방법명</th>
                          <th style={{ padding: '8px' }}>포장 형태</th>
                          <th style={{ padding: '8px' }}>단위</th>
                          <th style={{ padding: '8px' }}>개별 규격 (가x세x높, mm)</th>
                          <th style={{ padding: '8px' }}>파렛트 규격 (가x세x높, mm / 적재수량)</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>기본 설정</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>작업</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(formData.packingMethods || []).length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                              등록된 패킹 방법이 없습니다. 우측 상단의 버튼을 눌러 첫 번째 패킹 방법을 추가해 주세요.
                            </td>
                          </tr>
                        ) : (
                          (formData.packingMethods || []).map((m: any) => (
                            <tr key={m.id} style={{ borderBottom: '1px solid #e8ecf0', background: m.isDefault ? '#eff6ff' : 'transparent' }}>
                              <td style={{ padding: '8px', fontWeight: m.isDefault ? 700 : 500 }}>{m.name} {m.isDefault && <span style={{ fontSize: '10px', background: '#2563eb', color: '#fff', padding: '2px 6px', borderRadius: '10px', marginLeft: '6px' }}>기본</span>}</td>
                              <td style={{ padding: '8px' }}>{m.packageType}</td>
                              <td style={{ padding: '8px' }}>{m.unit}</td>
                              <td style={{ padding: '8px' }}>
                                {m.unitWidth} x {m.unitLength} x {m.unitHeight} mm ({m.unitWeight} kg)
                              </td>
                              <td style={{ padding: '8px' }}>
                                {m.packageType?.endsWith('+ Pallet') || m.packageType === 'Pallet' ? (
                                  `${m.palletWidth} x ${m.palletLength} x ${m.palletHeight} mm / ${m.qtyPerPallet} EA`
                                ) : '-'}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                {!m.isDefault && (
                                  <button type="button" onClick={() => handleSetDefaultPacking(m.id)} style={{ padding: '3px 8px', fontSize: '11px', background: '#fff', border: '1px solid #e8ecf0', borderRadius: '4px', cursor: 'pointer' }}>기본 지정</button>
                                )}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <button type="button" onClick={() => setEditingMethod(m)} style={{ padding: '3px 8px', fontSize: '11px', background: '#f3f4f6', border: '1px solid #e8ecf0', borderRadius: '4px', marginRight: '4px', cursor: 'pointer' }}>수정</button>
                                <button type="button" onClick={() => handleDeletePackingMethod(m.id)} style={{ padding: '3px 8px', fontSize: '11px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>삭제</button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Add/Edit Packing Method Sub-form */}
                {editingMethod && (
                  <div style={{ border: '2px solid #2563eb', borderRadius: '8px', padding: '16px', background: '#f8fafc' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#2563eb', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                      {editingMethod.id ? '⚙️ 패킹 방법 수정' : '⚙️ 새 패킹 방법 등록'}
                    </h4>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                      <Input label="패킹 방법명 (예: Pail 단품, Pail+Pallet 등) ★" value={editingMethod.name} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, name: v }))} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>포장 형태 ★</label>
                        <select 
                          value={editingMethod.packageType} 
                          onChange={(e) => setEditingMethod((p: any) => ({ ...p, packageType: e.target.value }))} 
                          style={{ padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                        >
                          {['Single', 'Pail', 'Drum', 'Pail + Pallet', 'Drum + Pallet', 'Pallet', 'Carton', 'Wooden Box', 'None'].map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>단위</label>
                        <select 
                          value={editingMethod.unit} 
                          onChange={(e) => setEditingMethod((p: any) => ({ ...p, unit: e.target.value }))} 
                          style={{ padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                        >
                          {['KG', 'BOX', 'M', 'M2', 'M3', 'EA', 'SET'].map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Dynamic layout inside sub-form */}
                    {(editingMethod.packageType === 'Single' || editingMethod.packageType === 'None' || editingMethod.packageType === 'Carton' || editingMethod.packageType === 'Wooden Box') && (
                      <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151', display: 'block', marginBottom: '8px' }}>📦 단품별 규격 (Single Spec)</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                          <Input label="가로 (mm)" value={editingMethod.unitWidth} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitWidth: parseFloat(v) || 0 }))} type="number" />
                          <Input label="세로 (mm)" value={editingMethod.unitLength} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitLength: parseFloat(v) || 0 }))} type="number" />
                          <Input label="높이 (mm)" value={editingMethod.unitHeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitHeight: parseFloat(v) || 0 }))} type="number" />
                          <Input label="순중량 (kg)" value={editingMethod.unitWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitWeight: parseFloat(v) || 0 }))} type="number" step="0.01" />
                          <Input label="총중량 (kg)" value={editingMethod.unitGrossWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitGrossWeight: parseFloat(v) || 0 }))} type="number" step="0.01" />
                        </div>
                      </div>
                    )}

                    {(editingMethod.packageType === 'Pail' || editingMethod.packageType === 'Pail + Pallet') && (
                      <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669', display: 'block', marginBottom: '8px' }}>🧪 화학물 페일(Pail) 규격</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                          <Input label="페일 가로 (mm)" value={editingMethod.unitWidth} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitWidth: parseFloat(v) || 0 }))} type="number" />
                          <Input label="페일 세로 (mm)" value={editingMethod.unitLength} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitLength: parseFloat(v) || 0 }))} type="number" />
                          <Input label="페일 높이 (mm)" value={editingMethod.unitHeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitHeight: parseFloat(v) || 0 }))} type="number" />
                          <Input label="페일 순중량 (kg)" value={editingMethod.unitWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitWeight: parseFloat(v) || 0 }))} type="number" step="0.01" />
                        </div>
                      </div>
                    )}

                    {(editingMethod.packageType === 'Drum' || editingMethod.packageType === 'Drum + Pallet') && (
                      <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed', display: 'block', marginBottom: '8px' }}>🛢️ 화학물 드럼(Drum) 규격</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                          <Input label="드럼 가로 (mm)" value={editingMethod.unitWidth} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitWidth: parseFloat(v) || 0 }))} type="number" />
                          <Input label="드럼 세로 (mm)" value={editingMethod.unitLength} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitLength: parseFloat(v) || 0 }))} type="number" />
                          <Input label="드럼 높이 (mm)" value={editingMethod.unitHeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitHeight: parseFloat(v) || 0 }))} type="number" />
                          <Input label="드럼 순중량 (kg)" value={editingMethod.unitWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitWeight: parseFloat(v) || 0 }))} type="number" step="0.01" />
                        </div>
                      </div>
                    )}

                    {(editingMethod.packageType?.endsWith('+ Pallet') || editingMethod.packageType === 'Pallet') && (
                      <div style={{ background: '#fff', border: '1px solid #e8ecf0', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#0891b2', display: 'block', marginBottom: '8px' }}>🪵 파렛트별 적재 및 규격 (Pallet Spec)</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
                          <Input label="적재 수량 (EA) ★" value={editingMethod.qtyPerPallet} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, qtyPerPallet: parseInt(v) || 0 }))} type="number" labelColor="#d97706" />
                          <Input label="파렛트 가로 (mm)" value={editingMethod.palletWidth} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletWidth: parseFloat(v) || 0 }))} type="number" />
                          <Input label="파렛트 세로 (mm)" value={editingMethod.palletLength} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletLength: parseFloat(v) || 0 }))} type="number" />
                          <Input label="파렛트 높이 (mm)" value={editingMethod.palletHeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletHeight: parseFloat(v) || 0 }))} type="number" />
                          <Input label="파렛트 순중량 (kg)" value={editingMethod.palletWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletWeight: parseFloat(v) || 0 }))} type="number" step="0.01" />
                          <Input label="파렛트 총중량 (kg)" value={editingMethod.palletGrossWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletGrossWeight: parseFloat(v) || 0 }))} type="number" step="0.01" />
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button type="button" onClick={() => setEditingMethod(null)} style={{ padding: '6px 14px', fontSize: '11px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer', color: '#475569' }}>취소</button>
                      <button type="button" onClick={handleSavePackingMethod} style={{ padding: '6px 14px', fontSize: '11px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>저장 및 적용</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === 5 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                <Input label="현재 재고 수량" value={formData.stockQty} onChange={(v: any) => handleChange('stockQty', parseFloat(v) || 0)} type="number" />
                <Input label="리드타임 (일수)" value={formData.leadTimeDays} onChange={(v: any) => handleChange('leadTimeDays', parseInt(v) || 0)} type="number" />
                <Input label="보관 위치" value={formData.storageLocation} onChange={(v: any) => handleChange('storageLocation', v)} />
                <Input label="보관 온도" value={formData.storageTemp} onChange={(v: any) => handleChange('storageTemp', v)} />
                <Input label="보관 습도" value={formData.storageHumidity} onChange={(v: any) => handleChange('storageHumidity', v)} />
              </div>
            )}

            {activeTab === 6 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                <Input label="제조사명" value={formData.manufacturer} onChange={(v: any) => handleChange('manufacturer', v)} />
                <Input label="제조일자" value={formData.manufactureDate} onChange={(v: any) => handleChange('manufactureDate', v)} type="date" />
                <Input label="품질유효 종료일" value={formData.expiryDate} onChange={(v: any) => handleChange('expiryDate', v)} type="date" />
                <Select label="MSDS 관리" value={formData.msdsManaged} onChange={(v: any) => handleChange('msdsManaged', v)} options={['N', 'Y']} />
                <div style={{ gridColumn: 'span 2' }}>
                  <Input label="인증 정보" value={formData.certifications} onChange={(v: any) => handleChange('certifications', v)} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e8ecf0', background: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderRadius: '0 0 14px 14px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '7px', border: '1px solid #e8ecf0', background: '#fff', fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>취소</button>
          <button onClick={handleSave} disabled={isSaving} style={{ padding: '9px 18px', borderRadius: '7px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            {isSaving ? '저장 중...' : '✔ 저장'}
          </button>
        </div>

      </div>
    </div>
  );
};

const Input = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '', step, labelColor = '#6b7280' }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <label style={{ fontSize: '11px', fontWeight: 600, color: labelColor }}>{label}</label>
    <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} step={step} style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px', background: disabled ? '#f9fafb' : '#fff' }} />
  </div>
);

const Select = ({ label, value, onChange, options }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>{label}</label>
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px' }}>
      {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);

const gridInputStyle = { width: '100%', padding: '4px 6px', fontSize: '12px', border: '1px solid #e8ecf0', borderRadius: '4px' };

const getRawSupplierCode = (val: string | undefined): string => {
  if (!val) return '';
  const trimmed = val.trim();
  if (trimmed.startsWith('[') && trimmed.includes(']')) {
    return trimmed.substring(1, trimmed.indexOf(']')).trim();
  }
  return trimmed;
};
