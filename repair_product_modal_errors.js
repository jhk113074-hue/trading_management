const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const pmPath = path.join(rootDir, 'app', 'src', 'components', 'ProductModal.tsx');

if (fs.existsSync(pmPath)) {
  let content = fs.readFileSync(pmPath, 'utf8').replace(/\r\n/g, '\n');

  // 1. 안 쓰는 상태들 선언 제거
  const oldUnusedStates = `  // States for multi-suppliers
  const [selSupplierVal, setSelSupplierVal] = useState('');
  const [selPrice, setSelPrice] = useState<number>(0);
  const [selCurrency, setSelCurrency] = useState('USD');
  const [selMoq, setSelMoq] = useState<number>(0);
  const [selLeadTime, setSelLeadTime] = useState<number>(0);
  const [selRemarks, setSelRemarks] = useState('');`;

  const newUnusedStates = `  // States for multi-suppliers
  const [selSupplierVal, setSelSupplierVal] = useState('');`;

  if (content.includes(oldUnusedStates)) {
    content = content.replace(oldUnusedStates, newUnusedStates);
  }

  // 2. 이관 시 supplierCode, supplierName 만 resolvedSuppliers 에 넣고, 단가는 purchasePrices 로 이관
  const oldMigrateCode = `      let resolvedSuppliers = initialProduct.suppliers || [];
      if (resolvedSuppliers.length === 0 && initialProduct.supplierCode && initialProduct.supplierName) {
        resolvedSuppliers = [{
          supplierCode: initialProduct.supplierCode,
          supplierName: initialProduct.supplierName,
          purchasePrice: initialProduct.purchasePrice || 0,
          currency: initialProduct.currency || 'USD',
          minOrderQty: initialProduct.minOrderQty || 0,
          leadTimeDays: initialProduct.leadTimeDays || 0,
          isDefault: true,
          remarks: '기본 공급사 및 단가 자동 이관'
        }];
      }

      setFormData({
        ...initialProduct,
        productCode: nextCode,
        packingMethods: updatedMethods,
        suppliers: resolvedSuppliers
      });`;

  const newMigrateCode = `      let resolvedSuppliers = initialProduct.suppliers || [];
      let resolvedPrices = initialProduct.purchasePrices || [];

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
      });`;

  if (content.includes(oldMigrateCode)) {
    content = content.replace(oldMigrateCode, newMigrateCode);
  }

  // 3. handleSave 시 Double Writing 보정 로직 수정 (purchasePrices 에서 대표단가 추적)
  const oldDoubleWrite = `      // 기본 공급 유통사 정보를 구형 단일 필드군에 대입 (하위 호환성 유지)
      let backupFields = {};
      if (formData.suppliers && formData.suppliers.length > 0) {
        const def = formData.suppliers.find(s => s.isDefault) || formData.suppliers[0];
        backupFields = {
          supplierCode: def.supplierCode,
          supplierName: def.supplierName,
          purchasePrice: def.purchasePrice,
          currency: def.currency,
          minOrderQty: def.minOrderQty,
          leadTimeDays: def.leadTimeDays
        };
      }

      const isPallet = formData.packageType?.toLowerCase().includes('pallet');
      const finalData: Partial<Product> = {`;

  const newDoubleWrite = `      // 기본 공급 유통사 정보를 구형 단일 필드군에 대입 (하위 호환성 유지)
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
      const finalData: Partial<Product> = {`;

  if (content.includes(oldDoubleWrite)) {
    content = content.replace(oldDoubleWrite, newDoubleWrite);
  }

  fs.writeFileSync(pmPath, content, 'utf8');
  console.log('✅ ProductModal.tsx errors resolved.');
} else {
  console.log('❌ ProductModal.tsx not found');
}
