import React, { useState, useEffect, useRef } from 'react';
import { doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, COMPANY_ID, storage } from '../firebase';
import type { Product } from '../types/product';
import { previewFile } from './FilePreviewModal';
import { DateInput } from './ui/DateInput';

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

  // States for multi-suppliers
  const [selSupplierVal, setSelSupplierVal] = useState('');

  // Category states
  const [largeCategories, setLargeCategories] = useState<string[]>([]);
  const [mediumCategories, setMediumCategories] = useState<string[]>([]);
  const [smallCategories, setSmallCategories] = useState<string[]>([]);

  const [isAddingLarge, setIsAddingLarge] = useState(false);
  const [isAddingMedium, setIsAddingMedium] = useState(false);
  const [isAddingSmall, setIsAddingSmall] = useState(false);

  // C구역(선택입력) 접기/펼치기 — IIFE 안에 두면 Hook Rules 위반이므로 최상단에 선언
  const [openOptional, setOpenOptional] = useState(false);

  const [newLargeVal, setNewLargeVal] = useState('');
  const [newMediumVal, setNewMediumVal] = useState('');
  const [newSmallVal, setNewSmallVal] = useState('');

  // Fetch categories from DB or Bootstrap
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', COMPANY_ID, 'productCategories'));
        const cats = snap.docs.map(doc => doc.data() as { name: string; type: 'large' | 'medium' | 'small' });
        
        const large = cats.filter(c => c.type === 'large').map(c => c.name);
        const medium = cats.filter(c => c.type === 'medium').map(c => c.name);
        const small = cats.filter(c => c.type === 'small').map(c => c.name);

        if (cats.length === 0 && products && products.length > 0) {
          const initLarge = [...new Set(products.map(p => p.categoryLarge).filter(Boolean))] as string[];
          const initMedium = [...new Set(products.map(p => p.categoryMedium).filter(Boolean))] as string[];
          const initSmall = [...new Set(products.map(p => p.categorySmall).filter(Boolean))] as string[];

          const batchPromises = [
            ...initLarge.map(name => setDoc(doc(db, 'companies', COMPANY_ID, 'productCategories', `large_${name}`), { name, type: 'large', createdAt: serverTimestamp() })),
            ...initMedium.map(name => setDoc(doc(db, 'companies', COMPANY_ID, 'productCategories', `medium_${name}`), { name, type: 'medium', createdAt: serverTimestamp() })),
            ...initSmall.map(name => setDoc(doc(db, 'companies', COMPANY_ID, 'productCategories', `small_${name}`), { name, type: 'small', createdAt: serverTimestamp() }))
          ];
          await Promise.all(batchPromises);

          setLargeCategories(initLarge.sort());
          setMediumCategories(initMedium.sort());
          setSmallCategories(initSmall.sort());
        } else {
          setLargeCategories([...new Set(large)].sort());
          setMediumCategories([...new Set(medium)].sort());
          setSmallCategories([...new Set(small)].sort());
        }
      } catch (e) {
        console.error("Failed to load categories:", e);
      }
    };
    fetchCategories();
  }, [products]);

  const registerNewCategory = async (name: string, type: 'large' | 'medium' | 'small') => {
    if (!name.trim()) return;
    const trimmed = name.trim();
    try {
      const docId = `${type}_${trimmed}`;
      await setDoc(doc(db, 'companies', COMPANY_ID, 'productCategories', docId), {
        name: trimmed,
        type,
        createdAt: serverTimestamp()
      });
      if (type === 'large') {
        setLargeCategories(prev => [...new Set([...prev, trimmed])].sort());
        handleChange('categoryLarge', trimmed);
        setIsAddingLarge(false);
        setNewLargeVal('');
      } else if (type === 'medium') {
        setMediumCategories(prev => [...new Set([...prev, trimmed])].sort());
        handleChange('categoryMedium', trimmed);
        setIsAddingMedium(false);
        setNewMediumVal('');
      } else if (type === 'small') {
        setSmallCategories(prev => [...new Set([...prev, trimmed])].sort());
        handleChange('categorySmall', trimmed);
        setIsAddingSmall(false);
        setNewSmallVal('');
      }
    } catch (e) {
      console.error(e);
      alert('카테고리 등록에 실패했습니다.');
    }
  };

  const [formData, setFormData] = useState<Partial<Product>>({
    productCode: undefined, nameKo: '', nameEn: '', hsCode: '', categoryLarge: '', categoryMedium: '', categorySmall: '', description: '', spec: '', imageUrl: '',
    supplierName: '', supplierCode: '', supplierContact: '', supplierPhone: '', supplierEmail: '', supplierAddress: '', minOrderQty: 0,
    manufacturerName: '', manufacturerCode: '', manufacturerContact: '', manufacturerPhone: '', manufacturerEmail: '', manufacturerAddress: '',
    purchasePrice: 0, currency: 'USD', priceValidFrom: '', priceValidTo: '', discountRate: 0, freightIncluded: 'N', purchasePrices: [],
    unit: 'KG', packageType: 'Pallet', qtyPerPallet: 0,
    unitWidth: 0, unitLength: 0, unitHeight: 0, unitWeight: 0, unitGrossWeight: 0,
    palletWidth: 0, palletLength: 0, palletHeight: 0, palletWeight: 0, palletGrossWeight: 0,
    stackable: 'Y', rotation: 'Y', color: '', material: '', origin: '',
    stockQty: 0, leadTimeDays: 0, storageLocation: '', storageTemp: '', storageHumidity: '',
    manufacturer: '', manufactureDate: '', expiryDate: '', certifications: '', msdsManaged: 'N',
    packingMethods: [],
    customerHsCodes: {},
    suppliers: []
  });

  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerHsCode, setNewCustomerHsCode] = useState('');

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

      let resolvedSuppliers = initialProduct.suppliers || [];
      let resolvedPrices = (initialProduct.purchasePrices || []).map((p: any) => {
        if (!p.supplierCode && initialProduct.supplierCode) {
          return {
            ...p,
            supplierCode: initialProduct.supplierCode,
            supplierName: initialProduct.supplierName || ''
          };
        }
        return p;
      });

      if (resolvedSuppliers.length === 0 && initialProduct.supplierCode && initialProduct.supplierName) {
        resolvedSuppliers = [{
          supplierCode: initialProduct.supplierCode,
          supplierName: initialProduct.supplierName,
          isDefault: true
        }];

        // 단가 이력도 없는 경우 기존 단가 이관
        if (resolvedPrices.length === 0) {
          resolvedPrices = [{
            validFrom: initialProduct.priceValidFrom || new Date().toISOString().split('T')[0],
            supplierCode: initialProduct.supplierCode,
            supplierName: initialProduct.supplierName,
            currency: initialProduct.currency || 'USD',
            price: initialProduct.purchasePrice || 0,
            remarks: '기본 단가 자동 이관'
          }];
        }
      }

      setFormData({
        ...initialProduct,
        productCode: nextCode,
        packingMethods: updatedMethods,
        suppliers: resolvedSuppliers,
        purchasePrices: resolvedPrices
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
    if (!editingMethod.name?.trim()) { alert('포장 형태는 필수입니다.'); return; }
    
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
      const isPallet = defaultMethod.packageType.toLowerCase().includes('pallet');
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

  // const handleSetDefaultPacking = (id: string) => {
  //   const list = (formData.packingMethods || []).map(m => ({
  //     ...m,
  //     isDefault: m.id === id
  //   }));
  //   
  //   const defaultMethod = list.find(m => m.isDefault);
  //   if (defaultMethod) {
  //     const isPallet = defaultMethod.packageType.toLowerCase().includes('pallet');
  //     setFormData(prev => ({
  //       ...prev,
  //       packingMethods: list,
  //       packageType: defaultMethod.packageType,
  //       qtyPerPallet: defaultMethod.qtyPerPallet || 0,
  //       unitWidth: defaultMethod.unitWidth || 0,
  //       unitLength: defaultMethod.unitLength || 0,
  //       unitHeight: defaultMethod.unitHeight || 0,
  //       unitWeight: defaultMethod.unitWeight || 0,
  //       unitGrossWeight: defaultMethod.unitGrossWeight || 0,
  //       palletWidth: defaultMethod.palletWidth || 0,
  //       palletLength: defaultMethod.palletLength || 0,
  //       palletHeight: defaultMethod.palletHeight || 0,
  //       palletWeight: defaultMethod.palletWeight || 0,
  //       palletGrossWeight: defaultMethod.palletGrossWeight || 0,
  //       specWidth: isPallet ? (defaultMethod.palletWidth || defaultMethod.unitWidth || 0) : (defaultMethod.unitWidth || 0),
  //       specLength: isPallet ? (defaultMethod.palletLength || defaultMethod.unitLength || 0) : (defaultMethod.unitLength || 0),
  //       specHeight: isPallet ? (defaultMethod.palletHeight || defaultMethod.unitHeight || 0) : (defaultMethod.unitHeight || 0),
  //       weight: isPallet ? (defaultMethod.palletWeight || defaultMethod.unitWeight || 0) : (defaultMethod.unitWeight || 0),
  //       grossWeight: isPallet ? (defaultMethod.palletGrossWeight || defaultMethod.unitGrossWeight || 0) : (defaultMethod.unitGrossWeight || defaultMethod.unitWeight || 0),
  //       stackable: defaultMethod.stackable || 'Y',
  //       rotation: defaultMethod.rotation || 'Y',
  //     }));
  //   } else {
  //     setFormData(prev => ({ ...prev, packingMethods: list }));
  //   }
  // };

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
    setIsDirty(true);
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



  const handleSave = async () => {
    if (!formData.productCode?.trim()) { alert('상품코드는 필수 입력사항입니다.'); return; }
    if (!formData.nameKo?.trim()) { alert('상품명(한글)은 필수 입력사항입니다.'); return; }

    setIsSaving(true);
    try {
      const docId = (initialProduct && !isCopy) ? initialProduct.id : formData.productCode;
      
      // 기본 공급 유통사 정보를 구형 단일 필드군에 대입 (하위 호환성 유지)
      let backupFields: any = {};
      if (formData.suppliers && formData.suppliers.length > 0) {
        const def = formData.suppliers.find(s => s.isDefault) || formData.suppliers[0];
        backupFields = {
          supplierCode: def.supplierCode,
          supplierName: def.supplierName
        };

        // 해당 기본 유통사의 가장 최신 단가 레코드 찾기
        if (formData.purchasePrices && formData.purchasePrices.length > 0) {
          const matchedPrices = formData.purchasePrices
            .filter(p => p.supplierCode === def.supplierCode)
            .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
          
          if (matchedPrices.length > 0) {
            backupFields.purchasePrice = matchedPrices[0].price;
            backupFields.currency = matchedPrices[0].currency;
            backupFields.priceValidFrom = matchedPrices[0].validFrom;
          }
        }
      }

      const isPallet = formData.packageType?.toLowerCase().includes('pallet');
      const finalData: Partial<Product> = {
        ...formData,
        ...backupFields,
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

  const [isDirty, setIsDirty] = useState(false);

  const handleClose = () => {
    if (isDirty) {
      const confirmClose = window.confirm("⚠️ 작성 중인 내용이 저장되지 않았습니다. 정말로 창을 닫으시겠습니까?");
      if (!confirmClose) return;
    }
    onClose();
  };

  const [position, setPosition] = useState({ x: 180, y: 70 });
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
    <div style={{
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: '96%',
      maxWidth: '1080px',
      zIndex: 1000,
      pointerEvents: 'auto',
      userSelect: isDragging ? 'none' : 'auto'
    }}>
      <div style={{ background: '#fff', borderRadius: '4px', width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(15,23,42,0.3)', border: '1px solid #cbd5e1' }}>
        
        {/* Header */}
        <div 
          onMouseDown={handleMouseDown}
          style={{ padding: '16px 24px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', borderRadius: '4px 4px 0 0', cursor: 'move', userSelect: 'none' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b' }}>
              {initialProduct ? (isCopy ? 'Copy & Add Product Master' : 'Edit Product Master') : 'Add New Product Master'}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              {initialProduct ? (isCopy ? `기존 상품 정보를 복사하여 신규 상품을 등록합니다.` : `상품 마스터 상세 규격 수정 (${formData.nameKo})`) : '글로벌 상품 정보 및 무역원가 스펙 연동'}
            </div>
          </div>
          <button onClick={handleClose} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px', borderRadius: '4px', marginBottom: '22px', height: '42px', boxSizing: 'border-box' }}>
            {[
                { id: 1, label: '📋 1. 상품 스펙 및 패킹/기술자료' },
                { id: 2, label: '💰 2. 공급 유통사 및 단가 이력' },
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, padding: '0 9px', fontSize: '12.5px', fontWeight: 700, borderRadius: '4px', cursor: 'pointer', border: 'none',
                  background: activeTab === tab.id ? '#3b82f6' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : '#475569',
                  transition: 'background 0.2s, color 0.2s',
                  height: '100%',
                  boxSizing: 'border-box'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            
            {activeTab === 1 && (
              <>
                {/* 필수 정보 — 배경/카드 없이 바로 그리드 */}
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: '8px' }}>
                  <Input label="상품코드 ★" value={formData.productCode} onChange={(v: any) => handleChange('productCode', v)} disabled={!!initialProduct} placeholder="예: P0001" />
                  <Input label="상품명_한글 ★" value={formData.nameKo} onChange={(v: any) => handleChange('nameKo', v)} />
                  <Input label="상품명_영문" value={formData.nameEn} onChange={(v: any) => handleChange('nameEn', v)} />
                </div>

                {/* 구분선 */}
                <div style={{ height: '1px', background: '#f1f5f9' }} />

                {/* 분류 3단계 + HS CODE + 원산지 — 한 줄 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px 80px', gap: '8px' }}>
                  {/* 대분류 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>대분류</label>
                    {isAddingLarge ? (
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <input type="text" placeholder="새 대분류명" value={newLargeVal} onChange={e => setNewLargeVal(e.target.value)}
                          style={{ flex: 1, padding: '5px 8px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '5px', outline: 'none' }} />
                        <button type="button" onClick={() => registerNewCategory(newLargeVal, 'large')}
                          style={{ padding: '3px 7px', fontSize: '11px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>확인</button>
                        <button type="button" onClick={() => { setIsAddingLarge(false); setNewLargeVal(''); }}
                          style={{ padding: '3px 6px', fontSize: '11px', background: '#f1f5f9', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <select value={formData.categoryLarge || ''} onChange={e => handleChange('categoryLarge', e.target.value)}
                          style={{ flex: 1, padding: '5px 8px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '5px', background: '#fff', color: '#0f172a', outline: 'none' }}>
                          <option value="">-- 선택 --</option>
                          {largeCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <button type="button" onClick={() => setIsAddingLarge(true)}
                          style={{ padding: '0 7px', fontSize: '13px', background: '#f8fafc', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}>＋</button>
                      </div>
                    )}
                  </div>
                  {/* 중분류 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>중분류</label>
                    {isAddingMedium ? (
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <input type="text" placeholder="새 중분류명" value={newMediumVal} onChange={e => setNewMediumVal(e.target.value)}
                          style={{ flex: 1, padding: '5px 8px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '5px', outline: 'none' }} />
                        <button type="button" onClick={() => registerNewCategory(newMediumVal, 'medium')}
                          style={{ padding: '3px 7px', fontSize: '11px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>확인</button>
                        <button type="button" onClick={() => { setIsAddingMedium(false); setNewMediumVal(''); }}
                          style={{ padding: '3px 6px', fontSize: '11px', background: '#f1f5f9', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <select value={formData.categoryMedium || ''} onChange={e => handleChange('categoryMedium', e.target.value)}
                          style={{ flex: 1, padding: '5px 8px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '5px', background: '#fff', color: '#0f172a', outline: 'none' }}>
                          <option value="">-- 선택 --</option>
                          {mediumCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <button type="button" onClick={() => setIsAddingMedium(true)}
                          style={{ padding: '0 7px', fontSize: '13px', background: '#f8fafc', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}>＋</button>
                      </div>
                    )}
                  </div>
                  {/* 소분류 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>소분류</label>
                    {isAddingSmall ? (
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <input type="text" placeholder="새 소분류명" value={newSmallVal} onChange={e => setNewSmallVal(e.target.value)}
                          style={{ flex: 1, padding: '5px 8px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '5px', outline: 'none' }} />
                        <button type="button" onClick={() => registerNewCategory(newSmallVal, 'small')}
                          style={{ padding: '3px 7px', fontSize: '11px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>확인</button>
                        <button type="button" onClick={() => { setIsAddingSmall(false); setNewSmallVal(''); }}
                          style={{ padding: '3px 6px', fontSize: '11px', background: '#f1f5f9', color: 'var(--text-secondary)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <select value={formData.categorySmall || ''} onChange={e => handleChange('categorySmall', e.target.value)}
                          style={{ flex: 1, padding: '5px 8px', fontSize: '12px', border: '1px solid var(--border-color)', borderRadius: '5px', background: '#fff', color: '#0f172a', outline: 'none' }}>
                          <option value="">-- 선택 --</option>
                          {smallCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <button type="button" onClick={() => setIsAddingSmall(true)}
                          style={{ padding: '0 7px', fontSize: '13px', background: '#f8fafc', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}>＋</button>
                      </div>
                    )}
                  </div>
                  {/* HS CODE */}
                  <Input label="HS CODE" value={formData.hsCode} onChange={(v: any) => handleChange('hsCode', v)} />
                  {/* 원산지 */}
                  <Input label="원산지" value={formData.origin} onChange={(v: any) => handleChange('origin', v)} />
                </div>

                {/* 스펙 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>규격 / 스펙 (Spec)</label>
                  <input type="text" value={formData.spec || ''} onChange={(e: any) => handleChange('spec', e.target.value)}
                    placeholder="예: TPA Resin, Low Profile Additive 등"
                    style={{ padding: '5px 9px', border: '1px solid var(--border-color)', borderRadius: '5px', fontSize: '12.5px', color: '#334155', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                    onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; }}
                  />
                </div>

                {/* 구분선 */}
                <div style={{ height: '1px', background: '#f1f5f9' }} />

                {/* 색상 / 재질 / 상세설명 — 한 줄 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '8px' }}>
                  <Input label="색상" value={formData.color} onChange={(v: any) => handleChange('color', v)} />
                  <Input label="재질" value={formData.material} onChange={(v: any) => handleChange('material', v)} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <label style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>상세 설명</label>
                    <input type="text" value={formData.description || ''} onChange={(e: any) => handleChange('description', e.target.value)}
                      placeholder="상품 상세 설명"
                      style={{ padding: '5px 9px', border: '1px solid var(--border-color)', borderRadius: '5px', fontSize: '12px', color: '#334155', outline: 'none', boxSizing: 'border-box' }}
                      onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
                      onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; }}
                    />
                  </div>
                </div>

                {/* 이미지 — 컴팩트 한 줄 */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {formData.imageUrl
                      ? <img src={formData.imageUrl} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '16px', color: 'var(--text-muted)' }}>🖼️</span>}
                  </div>
                  <input type="file" id="product-image-upload" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(e.target.files)} />
                  <label htmlFor="product-image-upload"
                    style={{ padding: '4px 10px', background: '#f8fafc', color: 'var(--text-secondary)', borderRadius: '5px', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}>
                    {isImageUploading ? '업로드 중...' : '이미지 추가'}
                  </label>
                  <input type="text" value={formData.imageUrl || ''} onChange={(e) => handleChange('imageUrl', e.target.value)}
                    placeholder="이미지 URL 직접 입력"
                    style={{ flex: 1, padding: '5px 9px', border: '1px solid var(--border-color)', borderRadius: '5px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                    onFocus={e => { e.target.style.borderColor = '#2563eb'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--border-color)'; }}
                  />
                  {formData.imageUrl && (
                    <button type="button" onClick={() => handleChange('imageUrl', '')}
                      title="삭제"
                      style={{ padding: '4px 6px', background: '#fef2f2', color: '#ef4444', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🗑️</button>
                  )}
                </div>

                {/* 구분선 */}
                <div style={{ height: '1px', background: '#f1f5f9' }} />

                {/* 바이어별 HS CODE — 기본 접힘 */}
                <div>
                  <button type="button" onClick={() => setOpenOptional(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', padding: '0', marginBottom: openOptional ? '8px' : '0' }}>
                    <span style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>🔑 바이어별 HS CODE</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', transition: 'transform 0.15s', transform: openOptional ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>▼</span>
                    {Object.keys(formData.customerHsCodes || {}).length > 0 && (
                      <span style={{ fontSize: '10px', background: '#eff6ff', color: '#2563eb', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
                        {Object.keys(formData.customerHsCodes || {}).length}건
                      </span>
                    )}
                  </button>
                  {openOptional && (
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '7px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {Object.keys(formData.customerHsCodes || {}).length > 0 && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                              <th style={{ padding: '5px 8px', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '9.5px', textTransform: 'uppercase', textAlign: 'left' }}>고객사명</th>
                              <th style={{ padding: '5px 8px', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '9.5px', textTransform: 'uppercase', textAlign: 'left' }}>전용 HS CODE</th>
                              <th style={{ width: '30px' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(formData.customerHsCodes || {}).map(([cust, code]) => (
                              <tr key={cust} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '5px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>{cust}</td>
                                <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: '#0f766e', fontWeight: 700 }}>{code as string}</td>
                                <td style={{ textAlign: 'center' }}>
                                  <button type="button" onClick={() => {
                                    const m = { ...(formData.customerHsCodes || {}) };
                                    delete m[cust];
                                    handleChange('customerHsCodes', m);
                                  }} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px' }}>✕</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px', alignItems: 'end' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>고객사명</label>
                          <input type="text" placeholder="예: KUWAIT CUSTOMER" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)}
                            style={{ padding: '5px 8px', border: '1px solid var(--border-color)', borderRadius: '5px', fontSize: '12px', outline: 'none' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <label style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>전용 HS CODE</label>
                          <input type="text" placeholder="예: 3901.20.9000" value={newCustomerHsCode} onChange={e => setNewCustomerHsCode(e.target.value)}
                            style={{ padding: '5px 8px', border: '1px solid var(--border-color)', borderRadius: '5px', fontSize: '12px', outline: 'none' }} />
                        </div>
                        <button type="button" onClick={() => {
                          if (!newCustomerName.trim() || !newCustomerHsCode.trim()) { alert('고객사명과 HS CODE를 입력해 주세요.'); return; }
                          handleChange('customerHsCodes', { ...(formData.customerHsCodes || {}), [newCustomerName.trim()]: newCustomerHsCode.trim() });
                          setNewCustomerName(''); setNewCustomerHsCode('');
                        }} style={{ padding: '5px 12px', background: '#2563eb', border: 'none', borderRadius: '5px', fontSize: '12px', fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                          + 추가
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 2 && (
              <>

                {/* ─── 제조사 섹션 ─── */}
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '15px' }}>🏭</span>
                    <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b', margin: 0 }}>제조사 (Manufacturer)</h4>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#475569', background: sameAsSupplier ? '#e2e8f0' : '#fff', padding: '3px 10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
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
                        style={{ width: '14px', height: '14px', accentColor: '#3b82f6', cursor: 'pointer' }}
                      />
                      공급업체와 동일
                    </label>
                    <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto' }}>생산 공장 · 원산지 제조처</span>
                  </div>

                  {sameAsSupplier ? (
                    /* 동일 체크 시: 간단 배지로 표시 */
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                      <span style={{ fontSize: '16px' }}>✅</span>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{formData.manufacturerName || '(공급사 선택 후 자동 반영)'}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>공급사와 동일한 업체로 설정됨 · 코드: {formData.manufacturerCode || '-'}</div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* 제조사 선택 */}
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>제조사 선택 (DB 연동)</label>
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
                          style={{ width: '100%', padding: '0 11px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', boxSizing: 'border-box', height: '34px', outline: 'none' }}
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
                        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '12px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                          <div>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, marginBottom: '2px' }}>업체코드</div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1' }}>{formData.manufacturerCode}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, marginBottom: '2px' }}>담당자</div>
                            <div style={{ fontSize: '12px', color: '#1e293b' }}>{formData.manufacturerContact || '-'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, marginBottom: '2px' }}>이메일</div>
                            <div style={{ fontSize: '12px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formData.manufacturerEmail || '-'}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, marginBottom: '2px' }}>주소</div>
                            <div style={{ fontSize: '12px', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formData.manufacturerAddress || '-'}</div>
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', background: '#f8fafc', borderRadius: '4px' }}>
                          제조사를 선택하면 상세 정보가 표시됩니다
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* ─── 공급 유통망 지정 섹션 ─── */}
                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '16px', marginTop: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '15px' }}>🔗</span>
                    <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b', margin: 0 }}>거래 유통사 지정</h4>
                    <span style={{ fontSize: '11px', color: '#64748b', marginLeft: 'auto' }}>거래 가능한 파트너 유통업체 지정</span>
                  </div>

                  {/* 신규 유통사 정보 등록 폼 */}
                  <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '12px', marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>유통사 선택</label>
                      <input
                        type="text"
                        list="multi_suppliers_datalist"
                        value={selSupplierVal}
                        placeholder="유통사 검색 및 입력"
                        onChange={e => setSelSupplierVal(e.target.value)}
                        style={{ padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', boxSizing: 'border-box', height: '34px', outline: 'none' }}
                      />
                      <datalist id="multi_suppliers_datalist">
                        {suppliers.map(s => (
                          <option key={s.id} value={`[${s.supplierCode}] ${s.name}`} />
                        ))}
                      </datalist>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const code = getRawSupplierCode(selSupplierVal);
                        const found = suppliers.find(s => s.supplierCode === code || s.name === selSupplierVal || `[${s.supplierCode}] ${s.name}` === selSupplierVal);
                        if (!found && !selSupplierVal.trim()) {
                          alert('유통(공급)사를 먼저 선택해주세요.');
                          return;
                        }
                        const sCode = found ? found.supplierCode : code;
                        const sName = found ? found.name : selSupplierVal;

                        const newLink = {
                          supplierCode: sCode,
                          supplierName: sName,
                          isDefault: (formData.suppliers || []).length === 0 // 첫 공급사는 자동으로 기본값 설정
                        };

                        // 중복 유통사 검사
                        const exists = (formData.suppliers || []).some(s => s.supplierCode === sCode);
                        if (exists) {
                          alert('이미 리스트에 등록된 유통사입니다.');
                          return;
                        }

                        setFormData(prev => ({
                          ...prev,
                          suppliers: [...(prev.suppliers || []), newLink]
                        }));

                        // 입력 폼 클리어
                        setSelSupplierVal('');
                      }}
                      style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '0 16px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', height: '34px', marginTop: '18px', transition: 'background 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
                    >
                      ➕ 유통사 추가
                    </button>
                  </div>

                  {/* 등록된 유통사 목록 테이블 */}
                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', background: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', color: '#475569', fontWeight: 750 }}>
                          <th style={{ padding: '8px', width: '60px' }}>기본</th>
                          <th style={{ padding: '8px' }}>유통사명 (코드)</th>
                          <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>삭제</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!formData.suppliers || formData.suppliers.length === 0) ? (
                          <tr>
                            <td colSpan={3} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>등록된 거래 유통사가 없습니다. 상단에서 유통사를 검색해 추가해 주세요.</td>
                          </tr>
                        ) : (
                          formData.suppliers.map((sup, idx) => (
                            <tr key={sup.supplierCode} style={{ borderBottom: '1px solid #cbd5e1' }}>
                              <td style={{ padding: '8px' }}>
                                <input
                                  type="radio"
                                  name="default_supplier"
                                  checked={sup.isDefault}
                                  onChange={() => {
                                    setFormData(prev => ({
                                      ...prev,
                                      suppliers: (prev.suppliers || []).map((s, i) => ({
                                        ...s,
                                        isDefault: i === idx
                                      }))
                                    }));
                                  }}
                                  style={{ cursor: 'pointer', accentColor: '#3b82f6' }}
                                />
                              </td>
                              <td style={{ padding: '8px', fontWeight: 600 }}>
                                <span>{sup.supplierName}</span> <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: 400 }}>({sup.supplierCode})</span>
                                {(() => {
                                  const found = suppliers.find(s => s.supplierCode === sup.supplierCode);
                                  if (!found) return null;
                                  const contact = found.managerName || '-';
                                  const phone = found.managerPhone || found.phone || '-';
                                  const email = found.purchaseEmail || found.email || '-';
                                  const addr = found.address || '-';
                                  return (
                                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500, marginLeft: '12px', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', display: 'inline-flex', gap: '8px', flexWrap: 'wrap', border: '1px solid var(--border-color)' }}>
                                      <span>👤 담당자: {contact}</span>
                                      <span>📱 Mobile: {phone}</span>
                                      <span>✉️ 이메일: {email}</span>
                                      <span>📍 주소: {addr}</span>
                                    </span>
                                  );
                                })()}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData(prev => {
                                      const next = (prev.suppliers || []).filter((_, i) => i !== idx);
                                      if (sup.isDefault && next.length > 0) {
                                        next[0].isDefault = true;
                                      }
                                      return { ...prev, suppliers: next };
                                    });
                                  }}
                                  style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '11px' }}
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
            )}

            {activeTab === 2 && (
              <>
                {/* ── 현재 구매가(원가) 고정 영역 ── */}
                {(() => {
                  // 가장 최신 단가 찾기
                  const latestPrice = (formData.purchasePrices || [])
                    .filter((p: any) => p.price > 0)
                    .sort((a: any, b: any) => (b.validFrom || '').localeCompare(a.validFrom || ''))[0];
                  return (
                    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '6px' }}>현재 구매가 (원가) — 최신 단가</div>
                        {latestPrice ? (
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                            <span style={{ fontSize: '20px', fontWeight: 850, color: '#3b82f6' }}>
                              {(latestPrice.currency || 'KRW')} {Number(latestPrice.price || 0).toLocaleString('ko-KR')}
                            </span>
                            <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>/ {formData.unit || 'KG'}</span>
                            <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px' }}>적용일: {latestPrice.validFrom || '-'}</span>
                            {latestPrice.supplierName && (
                              <span style={{ fontSize: '11px', color: '#475569' }}>· {latestPrice.supplierName}</span>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: '13px', color: '#94a3b8' }}>등록된 단가 없음 — 아래에서 단가를 추가하세요</div>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: '#475569', background: '#f1f5f9', padding: '6px 12px', borderRadius: '20px', fontWeight: 700, whiteSpace: 'nowrap', border: '1px solid #cbd5e1' }}>
                        총 {(formData.purchasePrices || []).length}건 이력
                      </div>
                    </div>
                  );
                })()}

                <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '16px', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                      <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b', margin: 0 }}>📋 유통사별 납품 단가 관리</h4>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>거래처별 계약 단가 이력 히스토리</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const defaultSupplier = (formData.suppliers && formData.suppliers.length > 0) 
                          ? formData.suppliers.find(s => s.isDefault) || formData.suppliers[0]
                          : null;
                        
                        const newHist = {
                          validFrom: new Date().toISOString().split('T')[0],
                          supplierCode: defaultSupplier ? defaultSupplier.supplierCode : '',
                          supplierName: defaultSupplier ? defaultSupplier.supplierName : '',
                          currency: 'USD',
                          price: 0,
                          remarks: ''
                        };
                        setFormData(prev => ({
                          ...prev,
                          purchasePrices: [newHist, ...(prev.purchasePrices || [])]
                        }));
                      }}
                      style={{ padding: '0 12px', fontSize: '12.5px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, transition: 'background 0.2s', height: '34px' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
                    >
                      ➕ 단가 추가
                    </button>
                  </div>

                  <div style={{ border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', background: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', color: '#475569', fontWeight: 750 }}>
                          <th style={{ padding: '8px', width: '130px' }}>적용 시작일</th>
                          <th style={{ padding: '8px' }}>공급 유통사</th>
                          <th style={{ padding: '8px', width: '90px' }}>통화</th>
                          <th style={{ padding: '8px', width: '130px', textAlign: 'right' }}>납품 단가</th>
                          <th style={{ padding: '8px' }}>비고</th>
                          <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}>삭제</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!formData.purchasePrices || formData.purchasePrices.length === 0) ? (
                          <tr>
                            <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>등록된 납품 단가 정보가 없습니다. 단가를 추가해 주세요.</td>
                          </tr>
                        ) : (
                          formData.purchasePrices.map((hist, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #cbd5e1' }}>
                              <td style={{ padding: '6px 8px' }}>
                                <DateInput
                                  value={hist.validFrom}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setFormData(prev => {
                                      const next = [...(prev.purchasePrices || [])];
                                      next[idx] = { ...next[idx], validFrom: val };
                                      return { ...prev, purchasePrices: next };
                                    });
                                  }}
                                  style={{ padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '100%', boxSizing: 'border-box', height: '34px', outline: 'none' }}
                                />
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <select
                                  value={hist.supplierCode}
                                  onChange={e => {
                                    const code = e.target.value;
                                    const found = formData.suppliers?.find(s => s.supplierCode === code);
                                    setFormData(prev => {
                                      const next = [...(prev.purchasePrices || [])];
                                      next[idx] = { 
                                        ...next[idx], 
                                        supplierCode: code,
                                        supplierName: found ? found.supplierName : '' 
                                      };
                                      return { ...prev, purchasePrices: next };
                                    });
                                  }}
                                  style={{ padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '100%', boxSizing: 'border-box', height: '34px', outline: 'none' }}
                                >
                                  <option value="">-- 공급사 선택 --</option>
                                  {formData.suppliers?.map(s => (
                                    <option key={s.supplierCode} value={s.supplierCode}>{s.supplierName} ({s.supplierCode})</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <select
                                  value={hist.currency}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setFormData(prev => {
                                      const next = [...(prev.purchasePrices || [])];
                                      next[idx] = { ...next[idx], currency: val };
                                      return { ...prev, purchasePrices: next };
                                    });
                                  }}
                                  style={{ padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '100%', boxSizing: 'border-box', height: '34px', outline: 'none' }}
                                >
                                  <option value="USD">USD</option>
                                  <option value="KRW">KRW</option>
                                  <option value="EUR">EUR</option>
                                </select>
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={hist.price}
                                  onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setFormData(prev => {
                                      const next = [...(prev.purchasePrices || [])];
                                      next[idx] = { ...next[idx], price: val };
                                      return { ...prev, purchasePrices: next };
                                    });
                                  }}
                                  style={{ padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '100%', textAlign: 'right', boxSizing: 'border-box', height: '34px', outline: 'none' }}
                                />
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  type="text"
                                  value={hist.remarks}
                                  placeholder="계약조건 메모 등"
                                  onChange={e => {
                                    const val = e.target.value;
                                    setFormData(prev => {
                                      const next = [...(prev.purchasePrices || [])];
                                      next[idx] = { ...next[idx], remarks: val };
                                      return { ...prev, purchasePrices: next };
                                    });
                                  }}
                                  style={{ padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', width: '100%', boxSizing: 'border-box', height: '34px', outline: 'none' }}
                                />
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData(prev => ({
                                      ...prev,
                                      purchasePrices: (prev.purchasePrices || []).filter((_, i) => i !== idx)
                                    }));
                                  }}
                                  style={{ background: '#fef2f2', border: '1px solid #cbd5e1', color: '#ef4444', borderRadius: '4px', padding: '0 10px', cursor: 'pointer', fontSize: '12.5px', height: '34px', boxSizing: 'border-box' }}
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
            )}
            {activeTab === 1 && (
              <>
                {/* Packing Methods list */}
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#2563eb', margin: 0 }}>📦 제품 패킹(포장) 방법 목록</h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>기본 단위:</span>
                        <select 
                          value={formData.unit ?? ''} 
                          onChange={e => handleChange('unit', e.target.value)} 
                          style={{ padding: '4px 8px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
                        >
                          {['KG', 'BOX', 'M2', 'M', 'EA', 'SET'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => setEditingMethod({
                        name: '단품', packageType: '단품', unit: formData.unit || 'KG', isDefault: (formData.packingMethods || []).length === 0,
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
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                          <th style={{ padding: '8px' }}>포장 형태</th>
                          <th style={{ padding: '8px' }}>단위</th>
                          <th style={{ padding: '8px' }}>포장 규격 (WxLxH, 적재수량/중량, 순중량, 총중량)</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>다단 적재</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>회전 허용</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>작업</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(formData.packingMethods || []).length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                              등록된 패킹 방법이 없습니다. 우측 상단의 버튼을 눌러 첫 번째 패킹 방법을 추가해 주세요.
                            </td>
                          </tr>
                        ) : (
                          (formData.packingMethods || []).map((m: any) => {
                            const isPallet = m.packageType.toLowerCase().includes('pallet');
                             const specStr = isPallet
                               ? `Pallet: ${m.palletWidth || 0}x${m.palletLength || 0}x${m.palletHeight || 0} mm / ${m.qtyPerPallet || 0} EA / 순중량: ${m.palletWeight || 0} kg, 총중량: ${m.palletGrossWeight || 0} kg`
                               : `Single: ${m.unitWidth || 0}x${m.unitLength || 0}x${m.unitHeight || 0} mm / ${m.qtyPerPallet || 0} EA / 순중량: ${m.unitWeight || 0} kg, 총중량: ${m.unitGrossWeight || 0} kg`;

                            return (
                              <tr key={m.id} style={{ borderBottom: '1px solid var(--border-color)', background: m.isDefault ? '#eff6ff' : 'transparent' }}>
                                <td style={{ padding: '8px', fontWeight: m.isDefault ? 700 : 500 }}>
                                  {m.name}
                                </td>
                                <td style={{ padding: '8px' }}>{m.unit}</td>
                                <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{specStr}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>{m.stackable || 'Y'}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>{m.rotation || 'Y'}</td>
                                <td style={{ padding: '8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  <button type="button" onClick={() => setEditingMethod({ ...m })} style={{ padding: '3px 8px', fontSize: '11px', background: '#f3f4f6', border: '1px solid var(--border-color)', borderRadius: '4px', marginRight: '8px', cursor: 'pointer' }}>수정</button>
                                  <button type="button" onClick={() => handleDeletePackingMethod(m.id)} title="삭제" style={{ padding: '3px 6px', fontSize: '13px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>🗑️</button>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
                      <span style={{ fontSize: '16px' }}>⚙️</span>
                      <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        {editingMethod.id ? '패킹 방법 수정' : '새 패킹 방법 등록'}
                      </h4>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '10px', alignItems: 'end' }}>
                      {/* Row 1 */}
                      <div style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>포장 형태 ★</label>
                        <select 
                          value={editingMethod.packageType} 
                          onChange={(e) => {
                            const val = e.target.value;
                            const defaults: Record<string, { w: number, l: number, h: number }> = {
                              'Paper Bag': { w: 400, l: 600, h: 120 },
                              'Paper Box(1.2M)': { w: 290, l: 1250, h: 290 },
                              'Paper Box(1.7M)': { w: 290, l: 1250, h: 290 },
                              'Paper Box(50A)': { w: 525, l: 410, h: 380 },
                              'Paper Box(100A)': { w: 550, l: 390, h: 490 },
                              'Carton': { w: 1300, l: 1100, h: 720 },
                              'Plastic Drum': { w: 590, l: 590, h: 910 },
                              'Steel Drum': { w: 585, l: 585, h: 870 },
                              'Wooden Pallet': { w: 1150, l: 1150, h: 100 },
                              'Plastic Pallet': { w: 1150, l: 1150, h: 100 },
                              'Wooden Box': { w: 1000, l: 1150, h: 800 },
                              'Steel Pail': { w: 290, l: 290, h: 370 },
                              'Plastic Pail': { w: 290, l: 290, h: 370 },
                              'Jerrycan': { w: 200, l: 230, h: 370 },
                              'Roll(3")': { w: 1050, l: 458, h: 458 },
                              'Roll(4")': { w: 1050, l: 463, h: 463 },
                              'Roll(6")': { w: 1050, l: 476.5, h: 476.5 },
                              'Woven Bag': { w: 600, l: 400, h: 150 }
                            };
                            
                            const isPallet = val.includes('Pallet');
                            const size = defaults[val] || { w: 0, l: 0, h: 0 };
                            
                            setEditingMethod((p: any) => ({ 
                              ...p, 
                              name: val,
                              packageType: val,
                              unitWidth: isPallet ? 0 : size.w,
                              unitLength: isPallet ? 0 : size.l,
                              unitHeight: isPallet ? 0 : size.h,
                              palletWidth: isPallet ? size.w : 0,
                              palletLength: isPallet ? size.l : 0,
                              palletHeight: isPallet ? size.h : 0
                            }));
                          }} 
                          style={{ padding: '7px 9px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13px', background: '#fff', outline: 'none' }}
                        >
                          {[
                            '단품', 'Paper Bag', 'Paper Box', 'Paper Box(1.2M)', 'Paper Box(1.7M)', 'Paper Box(50A)', 'Paper Box(100A)',
                            'Carton', 'Plastic Drum', 'Steel Drum', 'Wooden Pallet', 'Plastic Pallet', 'Wooden Box',
                            'Steel Pail', 'Plastic Pail', 'Jerrycan', 'Roll(3")', 'Roll(4")', 'Roll(6")', 'Woven Bag',
                            'Pail', 'Drum', 'Pallet', 'Pallet(Pail)', 'Pallet(Drum)', 'BOX', 'IBC TANK'
                          ].map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>단위</label>
                        <select 
                          value={editingMethod.unit} 
                          onChange={(e) => setEditingMethod((p: any) => ({ ...p, unit: e.target.value }))} 
                          style={{ padding: '7px 9px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13px', background: '#fff', outline: 'none' }}
                        >
                          {['KG', 'BOX', 'M2', 'M', 'EA', 'SET'].map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ gridColumn: 'span 1.5', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>다단 적재</label>
                        <select 
                          value={editingMethod.stackable} 
                          onChange={(e) => setEditingMethod((p: any) => ({ ...p, stackable: e.target.value }))} 
                          style={{ padding: '7px 9px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13px', background: '#fff', outline: 'none' }}
                        >
                          {['Y', 'N'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>
                      <div style={{ gridColumn: 'span 1.5', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>회전 허용</label>
                        <select 
                          value={editingMethod.rotation} 
                          onChange={(e) => setEditingMethod((p: any) => ({ ...p, rotation: e.target.value }))} 
                          style={{ padding: '7px 9px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13px', background: '#fff', outline: 'none' }}
                        >
                          {['Y', 'N'].map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      </div>

                      {/* Row 2 */}
                      {editingMethod.packageType !== '단품' ? (
                        <div style={{ gridColumn: 'span 2' }}>
                          <Input label="적재수량/중량 ★" value={editingMethod.qtyPerPallet} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, qtyPerPallet: v }))} type="number" labelColor="#d97706" />
                        </div>
                      ) : (
                        <div style={{ gridColumn: 'span 2', padding: '10px 0', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>단품 (적재정보 없음)</div>
                      )}

                      {!editingMethod.packageType.includes('Pallet') ? (
                        <>
                          <div style={{ gridColumn: 'span 2' }}><Input label="가로 (mm)" value={editingMethod.unitWidth} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitWidth: v }))} type="number" /></div>
                          <div style={{ gridColumn: 'span 2' }}><Input label="세로 (mm)" value={editingMethod.unitLength} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitLength: v }))} type="number" /></div>
                          <div style={{ gridColumn: 'span 2' }}><Input label="높이 (mm)" value={editingMethod.unitHeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitHeight: v }))} type="number" /></div>
                          <div style={{ gridColumn: 'span 2' }}><Input label="순중량 (kg)" value={editingMethod.unitWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitWeight: v }))} type="number" step="0.01" /></div>
                          <div style={{ gridColumn: 'span 2' }}><Input label="총중량 (kg)" value={editingMethod.unitGrossWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, unitGrossWeight: v }))} type="number" step="0.01" /></div>
                        </>
                      ) : (
                        <>
                          <div style={{ gridColumn: 'span 2' }}><Input label="파렛트 가로" value={editingMethod.palletWidth} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletWidth: v }))} type="number" /></div>
                          <div style={{ gridColumn: 'span 2' }}><Input label="파렛트 세로" value={editingMethod.palletLength} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletLength: v }))} type="number" /></div>
                          <div style={{ gridColumn: 'span 2' }}><Input label="파렛트 높이" value={editingMethod.palletHeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletHeight: v }))} type="number" /></div>
                          <div style={{ gridColumn: 'span 2' }}><Input label="파렛트 순중량" value={editingMethod.palletWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletWeight: v }))} type="number" step="0.01" /></div>
                          <div style={{ gridColumn: 'span 2' }}><Input label="파렛트 총중량" value={editingMethod.palletGrossWeight} onChange={(v: any) => setEditingMethod((p: any) => ({ ...p, palletGrossWeight: v }))} type="number" step="0.01" /></div>
                        </>
                      )}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '14px' }}>
                      <button type="button" onClick={() => setEditingMethod(null)} style={{ padding: '6px 12px', fontSize: '12px', background: '#fff', border: '1px solid var(--border-default)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>취소</button>
                      <button type="button" onClick={handleSavePackingMethod} style={{ padding: '6px 14px', fontSize: '12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 2px 4px rgba(37,99,235,0.2)' }}>저장 및 적용</button>
                    </div>
                  </div>
                )}
              </>
            )}



            {activeTab === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📂 <strong>기술 자료 관리:</strong> 상품에 속한 TDS, MSDS 및 기타 기술 사양 문서를 업로드하고 통합 관리합니다. (각 카테고리별 최대 10MB)
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  {(['TDS', 'MSDS', '기타'] as const).map(cat => {
                    const docsOfCat = (formData.technicalDocuments || []).filter(d => d.category === cat);
                    
                    return (
                      <div key={cat} style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', minHeight: '220px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '12px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
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
                            style={{ display: 'block', background: '#f8fafc', border: '1px dashed var(--border-default)', borderRadius: '6px', padding: '10px', textAlign: 'center', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', transition: 'border-color 0.2s' }}
                            onMouseOver={e => e.currentTarget.style.borderColor = '#3b82f6'}
                            onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
                          >
                            {isUploading ? '📤 업로드 중...' : '＋ 파일 추가하기'}
                          </label>
                        </div>

                        {/* File List */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '180px' }}>
                          {docsOfCat.length === 0 ? (
                            <div style={{ margin: 'auto', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
                              등록된 문서가 없습니다.
                            </div>
                          ) : (
                            docsOfCat.map(docItem => {
                              // Find actual index in formData.technicalDocuments
                              const origIdx = (formData.technicalDocuments || []).findIndex(d => d.path === docItem.path);
                              return (
                                <div key={docItem.path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9', fontSize: '12px' }}>
                                  <span 
                                    onClick={() => previewFile(docItem.url, docItem.name)} 
                                    style={{ color: '#2563eb', textDecoration: 'underline', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px', cursor: 'pointer' }}
                                    title="클릭하여 미리보기"
                                  >
                                    {docItem.name}
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({(docItem.size / 1024).toFixed(1)}KB)</span>
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
        <div style={{ padding: '12px 24px', borderTop: '1px solid #cbd5e1', background: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderRadius: '0 0 4px 4px', height: '58px', boxSizing: 'border-box' }}>
          <button 
            onClick={handleClose} 
            style={{ padding: '0 18px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: '13px', cursor: 'pointer', transition: 'background 0.2s', height: '34px', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          >취소</button>
          <button 
            onClick={handleSave} 
            disabled={isSaving} 
            style={{ padding: '0 18px', borderRadius: '4px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer', transition: 'background 0.2s', height: '34px', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            {isSaving ? '저장 중...' : '✔ 저장'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Input = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '', step, labelColor }: any) => {
  const isRequired = label?.includes('★');
  const computedLabelColor = labelColor || '#475569';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
      <label style={{ fontSize: '11px', fontWeight: 750, color: computedLabelColor, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
        {label?.replace(' ★', '')}
        {isRequired && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
        {disabled && <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none', marginLeft: '4px' }}>(자동)</span>}
      </label>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        step={step}
        style={{
          width: '100%', boxSizing: 'border-box', minWidth: 0,
          padding: '0 10px',
          border: '1px solid #cbd5e1',
          borderRadius: '4px',
          fontSize: '13px',
          fontWeight: 600,
          color: disabled ? '#94a3b8' : '#1e293b',
          background: disabled ? '#f8fafc' : '#fff',
          outline: 'none',
          height: '34px',
          transition: 'border-color 0.15s, box-shadow 0.15s'
        }}
        onFocus={e => { if (!disabled) { e.target.style.borderColor = '#3b82f6'; } }}
        onBlur={e => { e.target.style.borderColor = '#cbd5e1'; }}
      />
    </div>
  );
};



const getRawSupplierCode = (val: string | undefined): string => {
  if (!val) return '';
  const trimmed = val.trim();
  if (trimmed.startsWith('[') && trimmed.includes(']')) {
    return trimmed.substring(1, trimmed.indexOf(']')).trim();
  }
  return trimmed;
};
