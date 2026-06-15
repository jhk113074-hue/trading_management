import React, { useState, useEffect } from 'react';
import { doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, COMPANY_ID, storage } from '../firebase';
import type { Product, ProductPriceHistory } from '../types/product';

interface Props {
  initialProduct?: Product;
  onClose: () => void;
  products?: Product[];
  isCopy?: boolean;
}

export const ProductModal: React.FC<Props> = ({ initialProduct, onClose, products, isCopy }) => {
  const [activeTab, setActiveTab] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [editingMethod, setEditingMethod] = useState<any | null>(null);
  const [supplierInput, setSupplierInput] = useState('');
  const [manufacturerInput, setManufacturerInput] = useState('');
  const [sameAsSupplier, setSameAsSupplier] = useState(false);

  const [formData, setFormData] = useState<Partial<Product>>({
    productCode: undefined, nameKo: '', nameEn: '', categoryLarge: '', categoryMedium: '', categorySmall: '', description: '', spec: '', imageUrl: '',
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
      const existing = initialProduct.packingMethods || [];
      const hasDefault = existing.some((m: any) => m.name === 'Default');
      let updatedMethods = [...existing];
      
      if (!hasDefault) {
        const defaultMethod = {
          id: 'default_' + Math.random().toString(36).substr(2, 9),
          name: 'Default',
          packageType: '단품',
          unit: initialProduct.unit || 'KG',
          isDefault: !existing.some((m: any) => m.isDefault),
          unitWidth: 0, unitLength: 0, unitHeight: 0, unitWeight: 0, unitGrossWeight: 0,
          qtyPerPallet: 1,
          palletWidth: 0, palletLength: 0, palletHeight: 0, palletWeight: 0, palletGrossWeight: 0,
          stackable: 'Y', rotation: 'Y'
        };
        updatedMethods = [defaultMethod, ...existing];
      }
      
      let nextCode = initialProduct.productCode;
      if (isCopy && products) {
        let maxNum = 0;
        products.forEach(p => {
          const code = p.productCode || p.id;
          if (code && typeof code === 'string' && /^P\d+$/i.test(code)) {
            const num = parseInt(code.substring(1), 10);
            if (num > maxNum) maxNum = num;
          }
        });
        nextCode = `P${String(maxNum + 1).padStart(4, '0')}`;
      }

      setFormData({
        ...initialProduct,
        productCode: nextCode,
        packingMethods: updatedMethods
      });
    } else {
      const defaultMethod = {
        id: 'default_' + Math.random().toString(36).substr(2, 9),
        name: 'Default',
        packageType: '단품',
        unit: 'KG',
        isDefault: true,
        unitWidth: 0, unitLength: 0, unitHeight: 0, unitWeight: 0, unitGrossWeight: 0,
        qtyPerPallet: 1,
        palletWidth: 0, palletLength: 0, palletHeight: 0, palletWeight: 0, palletGrossWeight: 0,
        stackable: 'Y', rotation: 'Y'
      };
      setFormData(prev => ({
        ...prev,
        priceValidFrom: new Date().toISOString().split('T')[0],
        packingMethods: [defaultMethod]
      }));
    }
  }, [initialProduct, isCopy, products]);

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
      unit: (editingMethod.unit || 'KG').toUpperCase(),
      id: methodId,
      isDefault: list.length === 0 ? true : !!editingMethod.isDefault,
      unitWidth: parseFloat(editingMethod.unitWidth) || 0,
      unitLength: parseFloat(editingMethod.unitLength) || 0,
      unitHeight: parseFloat(editingMethod.unitHeight) || 0,
      unitWeight: parseFloat(editingMethod.unitWeight) || 0,
      unitGrossWeight: parseFloat(editingMethod.unitGrossWeight) || 0,
      qtyPerPallet: parseInt(editingMethod.qtyPerPallet) || 0,
      palletWidth: parseFloat(editingMethod.palletWidth) || 0,
      palletLength: parseFloat(editingMethod.palletLength) || 0,
      palletHeight: parseFloat(editingMethod.palletHeight) || 0,
      palletWeight: parseFloat(editingMethod.palletWeight) || 0,
      palletGrossWeight: parseFloat(editingMethod.palletGrossWeight) || 0,
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
      const isPallet = defaultMethod.packageType === 'Pallet' || defaultMethod.packageType === 'Pallet(Pail)' || defaultMethod.packageType === 'Pallet(Drum)';
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
        stackable: defaultMethod.stackable || 'Y',
        rotation: defaultMethod.rotation || 'Y',
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
      const isPallet = defaultMethod.packageType === 'Pallet' || defaultMethod.packageType === 'Pallet(Pail)' || defaultMethod.packageType === 'Pallet(Drum)';
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
        stackable: defaultMethod.stackable || 'Y',
        rotation: defaultMethod.rotation || 'Y',
      }));
    } else {
      setFormData(prev => ({ ...prev, packingMethods: list }));
    }
  };

  const handleDeletePackingMethod = (id: string) => {
    const method = (formData.packingMethods || []).find(m => m.id === id);
    if (method?.name === 'Default') {
      alert('기본 "Default" 패킹 방법은 삭제할 수 없습니다.');
      return;
    }
    let list = (formData.packingMethods || []).filter(m => m.id !== id);
    if (list.length > 0 && !list.some(m => m.isDefault)) {
      list[0].isDefault = true;
    }
    setFormData(prev => ({ ...prev, packingMethods: list }));
  };

  const handleChange = (field: keyof Product, value: any) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'unit' && prev.packingMethods) {
        next.packingMethods = prev.packingMethods.map((m: any) => 
          m.name === 'Default' ? { ...m, unit: (value || 'KG').toUpperCase() } : m
        );
      }
      return next;
    });
  };

  const [isImageUploading, setIsImageUploading] = useState(false);

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsImageUploading(true);
    const file = files[0];
    const prodId = initialProduct?.id || formData.productCode || `temp_${Date.now()}`;
    const uniqueFileName = `img_${Date.now()}_${file.name}`;
    const storageRef = ref(storage, `products/${prodId}/${uniqueFileName}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    try {
      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', null, 
          (error: any) => {
            console.error("Image upload failed:", error);
            reject(error);
          }, 
          () => resolve()
        );
      });
      const url = await getDownloadURL(uploadTask.snapshot.ref);
      handleChange('imageUrl', url);
    } catch (e: any) {
      alert("이미지 업로드 중 오류가 발생했습니다: " + e.message);
    } finally {
      setIsImageUploading(false);
    }
  };

  const [isUploading, setIsUploading] = useState(false);

  const handleDocUpload = async (files: FileList | null, category: 'TDS' | 'MSDS' | '기타') => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    const prodId = initialProduct?.id || formData.productCode || `temp_${Date.now()}`;
    const newDocs = [...(formData.technicalDocuments || [])];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const uniqueFileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `products/${prodId}/${uniqueFileName}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      await new Promise<void>((resolve) => {
        uploadTask.on('state_changed', null, 
          (error: any) => {
            console.error("Upload failed for", file.name, error);
            resolve();
          }, 
          async () => {
            try {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              newDocs.push({
                name: file.name,
                url,
                size: file.size,
                path: uploadTask.snapshot.ref.fullPath,
                category
              });
            } catch(e) {
              console.error("Download URL error", e);
            }
            resolve();
          }
        );
      });
    }
    setFormData(prev => ({ ...prev, technicalDocuments: newDocs }));
    setIsUploading(false);
  };

  const handleDocDelete = async (index: number) => {
    const docItem = formData.technicalDocuments?.[index];
    if (!docItem) return;
    if (!window.confirm(`'${docItem.name}' 파일을 삭제하시겠습니까?`)) return;
    try {
      if (docItem.path) {
        const storageRef = ref(storage, docItem.path);
        await deleteObject(storageRef).catch(console.warn);
      }
      const newDocs = [...(formData.technicalDocuments || [])];
      newDocs.splice(index, 1);
      setFormData(prev => ({ ...prev, technicalDocuments: newDocs }));
    } catch (e) {
      console.error("Delete doc error:", e);
    }
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
      const docId = (initialProduct && !isCopy) ? initialProduct.id : formData.productCode;
      
      const isPallet = formData.packageType === 'Pallet' || formData.packageType === 'Pallet(Pail)' || formData.packageType === 'Pallet(Drum)';
      const finalData: Partial<Product> = {
        ...formData,
        unit: (formData.unit || 'KG').toUpperCase(),
        packingMethods: (formData.packingMethods || []).map(m => ({
          ...m,
          unit: (m.unit || 'KG').toUpperCase()
        })),
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

      if (!initialProduct || isCopy) {
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
      <div style={{ background: '#fff', borderRadius: '14px', width: '96%', maxWidth: '1080px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e8ecf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', borderRadius: '14px 14px 0 0' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>
              {initialProduct ? (isCopy ? 'Copy & Add Product Master' : 'Edit Product Master') : 'Add New Product Master'}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
              {initialProduct ? (isCopy ? `기존 상품 정보를 복사하여 신규 상품을 등록합니다.` : `상품 마스터 상세 규격 수정 (${formData.nameKo})`) : '글로벌 상품 정보 및 무역원가 스펙 연동'}
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
              { id: 4, label: '📦 4. 패킹 정보' },
              { id: 6, label: '🔬 5. 기술 자료' },
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>상품 상세 설명</label>
                    <textarea 
                      rows={2} 
                      value={formData.description} 
                      onChange={(e: any) => handleChange('description', e.target.value)} 
                      style={{ 
                        padding: '9px 12px', 
                        border: '1px solid #cbd5e1', 
                        borderRadius: '6px', 
                        fontSize: '13px', 
                        outline: 'none',
                        color: '#0f172a',
                        transition: 'border-color 0.15s, box-shadow 0.15s'
                      }} 
                      onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.06)'; }}
                      onBlur={e => { e.target.style.borderColor = '#cbd5e1'; e.target.style.boxShadow = 'none'; }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>규격 / 스펙 (Spec)</label>
                    <textarea 
                      rows={2} 
                      value={formData.spec || ''} 
                      onChange={(e: any) => handleChange('spec', e.target.value)} 
                      placeholder="예: TPA Resin, Low Profile Additive 등" 
                      style={{ 
                        padding: '9px 12px', 
                        border: '1px solid #cbd5e1', 
                        borderRadius: '6px', 
                        fontSize: '13px', 
                        outline: 'none',
                        color: '#0f172a',
                        transition: 'border-color 0.15s, box-shadow 0.15s'
                      }} 
                      onFocus={e => { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.06)'; }}
                      onBlur={e => { e.target.style.borderColor = '#cbd5e1'; e.target.style.boxShadow = 'none'; }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                  <Input label="색상" value={formData.color} onChange={(v: any) => handleChange('color', v)} />
                  <Input label="재질" value={formData.material} onChange={(v: any) => handleChange('material', v)} />
                  <Input label="원산지" value={formData.origin} onChange={(v: any) => handleChange('origin', v)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '14px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>상품 이미지</label>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    {/* Preview box */}
                    <div style={{ 
                      width: '78px', 
                      height: '78px', 
                      borderRadius: '8px', 
                      border: '1px solid #cbd5e1', 
                      background: '#f8fafc', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      overflow: 'hidden',
                      flexShrink: 0
                    }}>
                      {formData.imageUrl ? (
                        <img src={formData.imageUrl} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span style={{ fontSize: '20px', color: '#94a3b8' }}>🖼️</span>
                      )}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                          type="file" 
                          id="product-image-upload" 
                          accept="image/*" 
                          style={{ display: 'none' }} 
                          onChange={(e) => handleImageUpload(e.target.files)} 
                        />
                        <label 
                          htmlFor="product-image-upload" 
                          style={{ 
                            padding: '8px 16px', 
                            background: '#eff6ff', 
                            color: '#2563eb', 
                            borderRadius: '6px', 
                            fontSize: '13px', 
                            fontWeight: 600, 
                            cursor: 'pointer', 
                            border: '1px solid #bfdbfe',
                            display: 'inline-block' 
                          }}
                        >
                          {isImageUploading ? '📤 업로드 중...' : '＋ 이미지 파일 추가'}
                        </label>
                        {formData.imageUrl && (
                          <button 
                            type="button" 
                            onClick={() => handleChange('imageUrl', '')} 
                            style={{ 
                              padding: '8px 16px', 
                              background: '#fff', 
                              color: '#ef4444', 
                              borderRadius: '6px', 
                              fontSize: '13px', 
                              fontWeight: 600, 
                              cursor: 'pointer', 
                              border: '1px solid #fca5a5' 
                            }}
                          >
                            삭제
                          </button>
                        )}
                      </div>
                      <input 
                        type="text" 
                        value={formData.imageUrl || ''} 
                        onChange={(e) => handleChange('imageUrl', e.target.value)} 
                        placeholder="또는 이미지 주소(URL)를 입력해주세요" 
                        style={{ 
                          width: '100%', 
                          padding: '9px 12px', 
                          border: '1px solid #cbd5e1', 
                          borderRadius: '6px', 
                          fontSize: '13px', 
                          outline: 'none',
                          background: '#fff',
                          boxSizing: 'border-box'
                        }} 
                        onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
                        onBlur={e => { e.target.style.borderColor = '#cbd5e1'; }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 2 && (
              <>
                {/* ─── 공급사 섹션 ─── */}
                <div style={{ background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '15px' }}>🏪</span>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#1d4ed8', margin: 0 }}>공급사 (Supplier)</h4>
                    <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: 'auto' }}>구매처 · 납품처</span>
                  </div>

                  {/* 업체 선택 + 신규등록 버튼 */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '12px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px' }}>
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
                              ...(sameAsSupplier ? {
                                manufacturerName: found.name || '',
                                manufacturerCode: found.supplierCode || '',
                                manufacturerContact: found.managerName || '',
                                manufacturerPhone: found.managerPhone || found.phone || '',
                                manufacturerEmail: found.purchaseEmail || '',
                                manufacturerAddress: found.address || '',
                              } : {})
                            }));
                            if (sameAsSupplier) setManufacturerInput(val);
                          } else {
                            setFormData(prev => ({
                              ...prev,
                              supplierName: '',
                              supplierCode: val,
                              supplierContact: '',
                              supplierPhone: '',
                              supplierEmail: '',
                              supplierAddress: '',
                              ...(sameAsSupplier ? {
                                manufacturerName: '',
                                manufacturerCode: val,
                                manufacturerContact: '',
                                manufacturerPhone: '',
                                manufacturerEmail: '',
                                manufacturerAddress: '',
                              } : {})
                            }));
                            if (sameAsSupplier) setManufacturerInput(val);
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
                    <button
                      type="button"
                      onClick={() => window.open('/suppliers?action=new', '_blank')}
                      style={{ padding: '9px 14px', fontSize: '12px', fontWeight: 700, background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', height: '38px' }}
                    >
                      + 신규 공급사 등록
                    </button>
                  </div>

                  {/* 선택된 공급사 정보 요약 (선택 시에만 표시) */}
                  {formData.supplierName && (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, marginBottom: '2px' }}>업체코드</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#1d4ed8' }}>{formData.supplierCode}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, marginBottom: '2px' }}>담당자</div>
                        <div style={{ fontSize: '12px', color: '#1e293b' }}>{formData.supplierContact || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, marginBottom: '2px' }}>이메일</div>
                        <div style={{ fontSize: '12px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formData.supplierEmail || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, marginBottom: '2px' }}>주소</div>
                        <div style={{ fontSize: '12px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formData.supplierAddress || '-'}</div>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>최소주문수량 (MOQ)</label>
                        <input
                          type="number"
                          value={formData.minOrderQty ?? 0}
                          onChange={e => handleChange('minOrderQty', parseFloat(e.target.value) || 0)}
                          style={{ display: 'block', width: '100%', padding: '6px 8px', border: '1px solid #bfdbfe', borderRadius: '5px', fontSize: '12px', marginTop: '3px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                  )}
                  {!formData.supplierName && (
                    <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                      위에서 공급업체를 선택하면 상세 정보가 표시됩니다
                    </div>
                  )}
                </div>

                {/* ─── 제조사 섹션 ─── */}
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '15px' }}>🏭</span>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#15803d', margin: 0 }}>제조사 (Manufacturer)</h4>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#15803d', background: sameAsSupplier ? '#dcfce7' : '#fff', padding: '3px 10px', borderRadius: '20px', border: '1px solid #86efac' }}>
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

                  {sameAsSupplier ? (
                    /* 동일 체크 시: 간단 배지로 표시 */
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: '8px' }}>
                      <span style={{ fontSize: '16px' }}>✅</span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#15803d' }}>{formData.manufacturerName || '(공급사 선택 후 자동 반영)'}</div>
                        <div style={{ fontSize: '11px', color: '#4ade80' }}>공급사와 동일한 업체로 설정됨 · 코드: {formData.manufacturerCode || '-'}</div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* 제조사 선택 */}
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '5px' }}>제조사 선택 (DB 연동)</label>
                        <input
                          type="text"
                          list="manufacturers_datalist"
                          value={manufacturerInput}
                          placeholder="제조사 검색 또는 직접 입력"
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
                              setFormData(prev => ({
                                ...prev,
                                manufacturerName: '',
                                manufacturerCode: val,
                                manufacturerContact: '',
                                manufacturerPhone: '',
                                manufacturerEmail: '',
                                manufacturerAddress: '',
                              }));
                            }
                          }}
                          style={{ width: '100%', padding: '9px 11px', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' }}
                        />
                        <datalist id="manufacturers_datalist">
                          {suppliers.map(s => (
                            <option key={s.id} value={`[${s.supplierCode}] ${s.name}`}>
                              {s.name} ({s.supplierCode})
                            </option>
                          ))}
                        </datalist>
                      </div>

                      {/* 선택된 제조사 정보 요약 */}
                      {formData.manufacturerName ? (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                          <div>
                            <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, marginBottom: '2px' }}>업체코드</div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#15803d' }}>{formData.manufacturerCode}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, marginBottom: '2px' }}>담당자</div>
                            <div style={{ fontSize: '12px', color: '#1e293b' }}>{formData.manufacturerContact || '-'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, marginBottom: '2px' }}>이메일</div>
                            <div style={{ fontSize: '12px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formData.manufacturerEmail || '-'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600, marginBottom: '2px' }}>주소</div>
                            <div style={{ fontSize: '12px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formData.manufacturerAddress || '-'}</div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', background: '#f8fafc', borderRadius: '6px' }}>
                          제조사를 선택하면 상세 정보가 표시됩니다
                        </div>
                      )}
                    </>
                  )}
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
                {/* Packing Methods list */}
                <div style={{ border: '1px solid #e8ecf0', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#2563eb', margin: 0 }}>📦 제품 패킹(포장) 방법 목록</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>기본 단위:</span>
                        <select 
                          value={formData.unit ?? ''} 
                          onChange={e => handleChange('unit', e.target.value)} 
                          style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
                        >
                          {['KG', 'BOX', 'M2', 'M', 'EA', 'SET'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setEditingMethod({
                        name: '', packageType: '단품', unit: formData.unit || 'KG', isDefault: (formData.packingMethods || []).length === 0,
                        unitWidth: 0, unitLength: 0, unitHeight: 0, unitWeight: 0, unitGrossWeight: 0,
                        qtyPerPallet: 0, palletWidth: 0, palletLength: 0, palletHeight: 0, palletWeight: 0, palletGrossWeight: 0,
                        stackable: 'Y', rotation: 'Y'
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
                          <th style={{ padding: '8px' }}>단위</th>
                          <th style={{ padding: '8px' }}>포장 규격 (WxLxH, 적재수량/중량, 순중량, 총중량)</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>다단 적재</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>회전 허용</th>
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
                          (formData.packingMethods || []).map((m: any) => {
                            const isPallet = m.packageType === 'Pallet' || m.packageType === 'Pallet(Pail)' || m.packageType === 'Pallet(Drum)';
                            const specStr = isPallet
                              ? `Pallet: ${m.palletWidth || 0}x${m.palletLength || 0}x${m.palletHeight || 0} mm / ${m.qtyPerPallet || 0} EA / 순중량: ${m.palletWeight || 0} kg, 총중량: ${m.palletGrossWeight || 0} kg`
                              : `Single: ${m.unitWidth || 0}x${m.unitLength || 0}x${m.unitHeight || 0} mm / 순중량: ${m.unitWeight || 0} kg, 총중량: ${m.unitGrossWeight || 0} kg`;

                            return (
                              <tr key={m.id} style={{ borderBottom: '1px solid #e8ecf0', background: m.isDefault ? '#eff6ff' : 'transparent' }}>
                                <td style={{ padding: '8px', fontWeight: m.isDefault ? 700 : 500 }}>
                                  {m.name} {m.isDefault && <span style={{ fontSize: '10px', background: '#2563eb', color: '#fff', padding: '2px 6px', borderRadius: '10px', marginLeft: '6px' }}>기본</span>}
                                </td>
                                <td style={{ padding: '8px' }}>{m.unit}</td>
                                <td style={{ padding: '8px', color: '#475569' }}>{specStr}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>{m.stackable || 'Y'}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>{m.rotation || 'Y'}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                  {!m.isDefault && (
                                    <button type="button" onClick={() => handleSetDefaultPacking(m.id)} style={{ padding: '3px 8px', fontSize: '11px', background: '#fff', border: '1px solid #e8ecf0', borderRadius: '4px', cursor: 'pointer' }}>기본 지정</button>
                                  )}
                                </td>
                                <td style={{ padding: '8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  <button type="button" onClick={() => setEditingMethod({ ...m })} style={{ padding: '3px 8px', fontSize: '11px', background: '#f3f4f6', border: '1px solid #e8ecf0', borderRadius: '4px', marginRight: '4px', cursor: 'pointer' }}>수정</button>
                                  <button type="button" onClick={() => handleDeletePackingMethod(m.id)} style={{ padding: '3px 8px', fontSize: '11px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>삭제</button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Add/Edit Packing Method Sub-form */}
                {editingMethod && (
                  <div style={{ border: '1px solid #2563eb', borderRadius: '12px', padding: '20px', background: '#f8fafc', boxShadow: '0 4px 12px rgba(37,99,235,0.06)', marginTop: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
                      <span style={{ fontSize: '16px' }}>⚙️</span>
                      <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                        {editingMethod.id ? '패킹 방법 수정' : '새 패킹 방법 등록'}
                      </h4>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                      <Input label="패킹 방법명 (예: Pail 단품, Pail+Pallet 등) ★" value={editingMethod.name} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, name: v }))} placeholder="패킹명을 입력해 주세요" />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>포장 형태 ★</label>
                        <select 
                          value={editingMethod.packageType} 
                          onChange={(e) => setEditingMethod((p: any) => ({ ...p, packageType: e.target.value }))} 
                          style={{ padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff', outline: 'none' }}
                        >
                          {['단품', 'Pail', 'Drum', 'Pallet', 'Pallet(Pail)', 'Pallet(Drum)', 'BOX', 'Carton', 'IBC TANK'].map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>단위</label>
                        <select 
                          value={editingMethod.unit} 
                          onChange={(e) => setEditingMethod((p: any) => ({ ...p, unit: e.target.value }))} 
                          style={{ padding: '9px 11px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff', outline: 'none' }}
                        >
                          {['KG', 'BOX', 'M2', 'M', 'EA', 'SET'].map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Dynamic layout inside sub-form */}
                    {(editingMethod.packageType === '단품' || editingMethod.packageType === 'BOX' || editingMethod.packageType === 'Carton' || editingMethod.packageType === 'Pail' || editingMethod.packageType === 'Drum' || editingMethod.packageType === 'IBC TANK') && (
                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '12px' }}>📦 단품/포장별 규격 Spec</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                          <Input label="가로 (mm)" value={editingMethod.unitWidth} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitWidth: v }))} type="number" />
                          <Input label="세로 (mm)" value={editingMethod.unitLength} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitLength: v }))} type="number" />
                          <Input label="높이 (mm)" value={editingMethod.unitHeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitHeight: v }))} type="number" />
                          <Input label="순중량 (kg)" value={editingMethod.unitWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitWeight: v }))} type="number" step="0.01" />
                          <Input label="총중량 (kg)" value={editingMethod.unitGrossWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitGrossWeight: v }))} type="number" step="0.01" />
                        </div>
                      </div>
                    )}

                    {(editingMethod.packageType === 'Pallet' || editingMethod.packageType === 'Pallet(Pail)' || editingMethod.packageType === 'Pallet(Drum)') && (
                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#0891b2', display: 'block', marginBottom: '12px' }}>🪵 파렛트 적재 규격 (Pallet Spec)</span>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                          <Input label="적재수량/중량 ★" value={editingMethod.qtyPerPallet} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, qtyPerPallet: v }))} type="number" labelColor="#d97706" />
                          <Input label="가로 (mm)" value={editingMethod.palletWidth} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletWidth: v }))} type="number" />
                          <Input label="세로 (mm)" value={editingMethod.palletLength} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletLength: v }))} type="number" />
                          <Input label="높이 (mm)" value={editingMethod.palletHeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletHeight: v }))} type="number" />
                          <Input label="순중량 (kg)" value={editingMethod.palletWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletWeight: v }))} type="number" step="0.01" />
                          <Input label="총중량 (kg)" value={editingMethod.palletGrossWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletGrossWeight: v }))} type="number" step="0.01" />
                        </div>
                      </div>
                    )}

                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '12px' }}>🔄 적재 및 취급 옵션</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                        <Select label="다단 적재" value={editingMethod.stackable} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, stackable: v }))} options={['Y', 'N']} />
                        <Select label="회전 허용" value={editingMethod.rotation} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, rotation: v }))} options={['Y', 'N']} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
                      <button type="button" onClick={() => setEditingMethod(null)} style={{ padding: '8px 16px', fontSize: '12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', color: '#475569', fontWeight: 600 }}>취소</button>
                      <button type="button" onClick={handleSavePackingMethod} style={{ padding: '8px 18px', fontSize: '12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 2px 4px rgba(37,99,235,0.2)' }}>저장 및 적용</button>
                    </div>
                  </div>
                )}
              </>
            )}



            {activeTab === 6 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ fontSize: '13px', color: '#475569', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📂 <strong>기술 자료 관리:</strong> 상품에 속한 TDS, MSDS 및 기타 기술 사양 문서를 업로드하고 통합 관리합니다. (각 카테고리별 최대 10MB)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {(['TDS', 'MSDS', '기타'] as const).map(cat => {
                    const docsOfCat = (formData.technicalDocuments || []).filter(d => d.category === cat);
                    
                    return (
                      <div key={cat} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', minHeight: '220px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '12px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                            {cat === 'TDS' ? '📄 TDS (Technical Data Sheet)' : cat === 'MSDS' ? '🛢️ MSDS (Material Safety Data Sheet)' : '📎 기타 기술자료'}
                          </span>
                          <span style={{ fontSize: '11px', background: cat === 'TDS' ? '#eff6ff' : cat === 'MSDS' ? '#fef2f2' : '#f0fdf4', color: cat === 'TDS' ? '#2563eb' : cat === 'MSDS' ? '#dc2626' : '#16a34a', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                            {docsOfCat.length}개
                          </span>
                        </div>

                        {/* File Upload Button */}
                        <div style={{ marginBottom: '14px' }}>
                          <input 
                            type="file" 
                            id={`file-upload-${cat}`} 
                            style={{ display: 'none' }} 
                            onChange={(e) => handleDocUpload(e.target.files, cat)}
                          />
                          <label 
                            htmlFor={`file-upload-${cat}`} 
                            style={{ display: 'block', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '6px', padding: '10px', textAlign: 'center', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#475569', transition: 'border-color 0.2s' }}
                            onMouseOver={e => e.currentTarget.style.borderColor = '#3b82f6'}
                            onMouseOut={e => e.currentTarget.style.borderColor = '#cbd5e1'}
                          >
                            {isUploading ? '📤 업로드 중...' : '＋ 파일 추가하기'}
                          </label>
                        </div>

                        {/* File List */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '180px' }}>
                          {docsOfCat.length === 0 ? (
                            <div style={{ margin: 'auto', fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
                              등록된 문서가 없습니다.
                            </div>
                          ) : (
                            docsOfCat.map(docItem => {
                              // Find actual index in formData.technicalDocuments
                              const origIdx = (formData.technicalDocuments || []).findIndex(d => d.path === docItem.path);
                              return (
                                <div key={docItem.path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9', fontSize: '12px' }}>
                                  <a 
                                    href={docItem.url} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}
                                    title={docItem.name}
                                  >
                                    {docItem.name}
                                  </a>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>({(docItem.size / 1024).toFixed(1)}KB)</span>
                                    <button 
                                      type="button" 
                                      onClick={() => handleDocDelete(origIdx)} 
                                      style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '12px', padding: '2px' }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
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

const Input = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '', step, labelColor = '#475569' }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
    <label style={{ fontSize: '11px', fontWeight: 600, color: labelColor }}>{label}</label>
    <input 
      type={type} 
      value={value ?? ''} 
      onChange={e => onChange(e.target.value)} 
      disabled={disabled} 
      placeholder={placeholder} 
      step={step} 
      style={{ 
        width: '100%',
        boxSizing: 'border-box',
        minWidth: 0,
        padding: '9px 12px', 
        border: '1px solid #cbd5e1', 
        borderRadius: '6px', 
        fontSize: '13px', 
        background: disabled ? '#f8fafc' : '#fff', 
        color: disabled ? '#64748b' : '#0f172a',
        outline: 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s'
      }} 
      onFocus={e => { if(!disabled) { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.06)'; } }}
      onBlur={e => { e.target.style.borderColor = '#cbd5e1'; e.target.style.boxShadow = 'none'; }}
    />
  </div>
);

const Select = ({ label, value, onChange, options }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>{label}</label>
    <select 
      value={value ?? ''} 
      onChange={e => onChange(e.target.value)} 
      style={{ 
        width: '100%',
        boxSizing: 'border-box',
        minWidth: 0,
        padding: '9px 12px', 
        border: '1px solid #cbd5e1', 
        borderRadius: '6px', 
        fontSize: '13px',
        background: '#fff',
        color: '#0f172a',
        outline: 'none',
        transition: 'border-color 0.15s'
      }}
      onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
      onBlur={e => { e.target.style.borderColor = '#cbd5e1'; }}
    >
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
