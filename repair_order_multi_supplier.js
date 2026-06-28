const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const odPath = path.join(rootDir, 'app', 'src', 'pages', 'OrderDetail.tsx');

if (fs.existsSync(odPath)) {
  let content = fs.readFileSync(odPath, 'utf8').replace(/\r\n/g, '\n');

  // 1. getSupplierPurchaseInfo 고도화
  const oldGetSupplierPurchaseInfo = `  const getSupplierPurchaseInfo = (it: any) => {
    const match = (it.name || '').match(/^\\[(.*?)\\]\\s*(.*)$/);
    const itemCode = match ? match[1] : '-';
    const matchedProd = products.find(p => p.productCode === itemCode || p.id === itemCode);
    const originalPurchasePrice = it.originalPurchasePrice != null 
      ? it.originalPurchasePrice 
      : (it.purchaseUnitPrice != null 
         ? it.purchaseUnitPrice 
         : (matchedProd ? (matchedProd.purchasePrice || 0) : (it.unitPrice || 0)));
    const purchasePrice = it.purchaseUnitPrice != null ? it.purchaseUnitPrice : originalPurchasePrice;
    
    let purchaseCurrency = it.purchaseUnitCurrency;
    if (!purchaseCurrency) {
      if (it.originalPurchaseCurrency) {
        purchaseCurrency = it.originalPurchaseCurrency;
      } else if (purchasePrice > 1000) {
        purchaseCurrency = 'KRW';
      } else if (matchedProd) {
        purchaseCurrency = (matchedProd.currency === 'KRW' ? 'KRW' : 'USD') as any;
      } else {
        purchaseCurrency = 'USD';
      }
    }
    return { purchasePrice, purchaseCurrency, itemCode, itemName: match ? match[2] : it.name, originalPurchasePrice };
  };`;

  const newGetSupplierPurchaseInfo = `  const getSupplierPurchaseInfo = (it: any) => {
    const match = (it.name || '').match(/^\\[(.*?)\\]\\s*(.*)$/);
    const itemCode = match ? match[1] : '-';
    const matchedProd = products.find(p => p.productCode === itemCode || p.id === itemCode);

    let defaultPrice = matchedProd ? (matchedProd.purchasePrice || 0) : (it.unitPrice || 0);
    let defaultCurrency = matchedProd ? matchedProd.currency : 'USD';

    // 다중 유통사 단가 매핑
    if (matchedProd && matchedProd.suppliers && matchedProd.suppliers.length > 0) {
      const activeSup = it.supplier?.trim();
      const link = matchedProd.suppliers.find(s => s.supplierName?.trim() === activeSup || s.supplierCode === activeSup);
      if (link) {
        defaultPrice = link.purchasePrice;
        defaultCurrency = link.currency;
      } else {
        const defLink = matchedProd.suppliers.find(s => s.isDefault);
        if (defLink) {
          defaultPrice = defLink.purchasePrice;
          defaultCurrency = defLink.currency;
        }
      }
    }

    const originalPurchasePrice = it.originalPurchasePrice != null 
      ? it.originalPurchasePrice 
      : (it.purchaseUnitPrice != null 
         ? it.purchaseUnitPrice 
         : defaultPrice);
    const purchasePrice = it.purchaseUnitPrice != null ? it.purchaseUnitPrice : originalPurchasePrice;
    
    let purchaseCurrency = it.purchaseUnitCurrency;
    if (!purchaseCurrency) {
      if (it.originalPurchaseCurrency) {
        purchaseCurrency = it.originalPurchaseCurrency;
      } else if (purchasePrice > 1000) {
        purchaseCurrency = 'KRW';
      } else if (matchedProd) {
        purchaseCurrency = (defaultCurrency === 'KRW' ? 'KRW' : 'USD') as any;
      } else {
        purchaseCurrency = 'USD';
      }
    }
    return { purchasePrice, purchaseCurrency, itemCode, itemName: match ? match[2] : it.name, originalPurchasePrice };
  };`;

  // 2. handleItemChange 에서 품목선택 시 기본 유통사 & 단가 적용, 공급사 변경 시 단가 리셋 로직 주입
  const oldHandleItemChange = `  const handleItemChange = (index: number, field: keyof OrderItem, value: any) => {
    setOrderItems(prev => {
      const updated = [...prev];
      let it = { ...updated[index], [field]: value };
      
      if (field === 'name') {
        const parsedCode = getRawProductCode(value);
        const prod = products.find(p => p.productCode === parsedCode || p.id === parsedCode);
        if (prod) {
          const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
          const displayName = prod.nameEn || prod.nameKo || '';
          
          let buyPrice = prod.purchasePrice || 0;
          let itemCurrency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
          const qty = it.qty || 0;
          const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

          it = {
            ...it,
            name: \`[\${prod.productCode}] \${displayName}\`,
            supplier: prod.supplierName || '',
            supplierContact: contactInfo || '',
            grade: prod.spec || '',
            unit: (prod.unit || 'kg') as any,
            unitPrice: buyPrice,
            currency: itemCurrency,
            amount: amt
          };
        }
      }

      if (field === 'qty' || field === 'unitPrice' || field === 'currency') {`;

  const newHandleItemChange = `  const handleItemChange = (index: number, field: keyof OrderItem, value: any) => {
    setOrderItems(prev => {
      const updated = [...prev];
      let it = { ...updated[index], [field]: value };
      
      if (field === 'name') {
        const parsedCode = getRawProductCode(value);
        const prod = products.find(p => p.productCode === parsedCode || p.id === parsedCode);
        if (prod) {
          const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
          const displayName = prod.nameEn || prod.nameKo || '';
          
          let buyPrice = prod.purchasePrice || 0;
          let itemCurrency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
          let supName = prod.supplierName || '';

          if (prod.suppliers && prod.suppliers.length > 0) {
            const defLink = prod.suppliers.find(s => s.isDefault);
            if (defLink) {
              buyPrice = defLink.purchasePrice;
              itemCurrency = (defLink.currency === 'KRW' ? 'KRW' : 'USD');
              supName = defLink.supplierName;
            }
          }

          const qty = it.qty || 0;
          const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

          it = {
            ...it,
            name: \`[\${prod.productCode}] \${displayName}\`,
            supplier: supName,
            supplierContact: contactInfo || '',
            grade: prod.spec || '',
            unit: (prod.unit || 'kg') as any,
            unitPrice: buyPrice,
            currency: itemCurrency,
            amount: amt,
            purchaseUnitPrice: buyPrice,
            purchaseUnitCurrency: itemCurrency
          };
        }
      }

      if (field === 'supplier') {
        const parsedCode = getRawProductCode(it.name);
        const prod = products.find(p => p.productCode === parsedCode || p.id === parsedCode);
        if (prod && prod.suppliers && prod.suppliers.length > 0) {
          const link = prod.suppliers.find(s => s.supplierName === value || s.supplierCode === value);
          if (link) {
            it.unitPrice = link.purchasePrice;
            it.currency = (link.currency === 'KRW' ? 'KRW' : 'USD');
            it.purchaseUnitPrice = link.purchasePrice;
            it.purchaseUnitCurrency = link.currency;
            if (it.qty) {
              it.amount = it.currency === 'KRW' ? Math.round(it.qty * link.purchasePrice) : parseFloat((it.qty * link.purchasePrice).toFixed(2));
            }
          }
        }
      }

      if (field === 'qty' || field === 'unitPrice' || field === 'currency') {`;

  // 3. handleSourcingItemChange 수정
  const oldHandleSourcingItemChange = `  const handleSourcingItemChange = (index: number, field: keyof OrderItem, value: any) => {
    setSourcingItems(prev => {
      const updated = [...prev];
      let it = { ...updated[index], [field]: value };
      
      if (field === 'name') {
        const parsedCode = getRawProductCode(value);
        const prod = products.find(p => p.productCode === parsedCode || p.id === parsedCode);
        if (prod) {
          const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
          const displayName = prod.nameEn || prod.nameKo || '';
          
          let buyPrice = prod.purchasePrice || 0;
          let itemCurrency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
          const qty = it.qty || 0;
          const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

          it = {
            ...it,
            name: \`[\${prod.productCode}] \${displayName}\`,
            supplier: prod.supplierName || '',
            supplierContact: contactInfo || '',
            grade: prod.spec || '',
            unit: (prod.unit || 'kg') as any,
            unitPrice: buyPrice,
            currency: itemCurrency,
            amount: amt
          };
        }
      }

      if (field === 'qty' || field === 'unitPrice' || field === 'currency') {`;

  const newHandleSourcingItemChange = `  const handleSourcingItemChange = (index: number, field: keyof OrderItem, value: any) => {
    setSourcingItems(prev => {
      const updated = [...prev];
      let it = { ...updated[index], [field]: value };
      
      if (field === 'name') {
        const parsedCode = getRawProductCode(value);
        const prod = products.find(p => p.productCode === parsedCode || p.id === parsedCode);
        if (prod) {
          const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
          const displayName = prod.nameEn || prod.nameKo || '';
          
          let buyPrice = prod.purchasePrice || 0;
          let itemCurrency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
          let supName = prod.supplierName || '';

          if (prod.suppliers && prod.suppliers.length > 0) {
            const defLink = prod.suppliers.find(s => s.isDefault);
            if (defLink) {
              buyPrice = defLink.purchasePrice;
              itemCurrency = (defLink.currency === 'KRW' ? 'KRW' : 'USD');
              supName = defLink.supplierName;
            }
          }

          const qty = it.qty || 0;
          const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

          it = {
            ...it,
            name: \`[\${prod.productCode}] \${displayName}\`,
            supplier: supName,
            supplierContact: contactInfo || '',
            grade: prod.spec || '',
            unit: (prod.unit || 'kg') as any,
            unitPrice: buyPrice,
            currency: itemCurrency,
            amount: amt,
            purchaseUnitPrice: buyPrice,
            purchaseUnitCurrency: itemCurrency
          };
        }
      }

      if (field === 'supplier') {
        const parsedCode = getRawProductCode(it.name);
        const prod = products.find(p => p.productCode === parsedCode || p.id === parsedCode);
        if (prod && prod.suppliers && prod.suppliers.length > 0) {
          const link = prod.suppliers.find(s => s.supplierName === value || s.supplierCode === value);
          if (link) {
            it.unitPrice = link.purchasePrice;
            it.currency = (link.currency === 'KRW' ? 'KRW' : 'USD');
            it.purchaseUnitPrice = link.purchasePrice;
            it.purchaseUnitCurrency = link.currency;
            if (it.qty) {
              it.amount = it.currency === 'KRW' ? Math.round(it.qty * link.purchasePrice) : parseFloat((it.qty * link.purchasePrice).toFixed(2));
            }
          }
        }
      }

      if (field === 'qty' || field === 'unitPrice' || field === 'currency') {`;

  // 4. handleSelectSourcingProduct 및 handleSelectProduct 수정
  const oldHandleSelectSourcingProduct = `  const handleSelectSourcingProduct = (idx: number, prod: Product) => {
    setSourcingItems(prev => {
      const updated = [...prev];
      const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
      
      let buyPrice = prod.purchasePrice || 0;
      let itemCurrency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
      const qty = updated[idx].qty || 0;
      const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

      const displayName = prod.nameEn || prod.nameKo || '';

      updated[idx] = {
        ...updated[idx],
        name: \`[\${prod.productCode}] \${displayName}\`,
        supplier: prod.supplierName || '',
        supplierContact: contactInfo || '',
        grade: prod.spec || '',
        unit: (prod.unit || 'kg') as any,
        unitPrice: buyPrice,
        currency: itemCurrency,
        amount: amt
      };
      return updated;
    });
  };`;

  const newHandleSelectSourcingProduct = `  const handleSelectSourcingProduct = (idx: number, prod: Product) => {
    setSourcingItems(prev => {
      const updated = [...prev];
      const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
      
      let buyPrice = prod.purchasePrice || 0;
      let itemCurrency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
      let supName = prod.supplierName || '';

      if (prod.suppliers && prod.suppliers.length > 0) {
        const def = prod.suppliers.find(s => s.isDefault);
        if (def) {
          buyPrice = def.purchasePrice;
          itemCurrency = (def.currency === 'KRW' ? 'KRW' : 'USD');
          supName = def.supplierName;
        }
      }

      const qty = updated[idx].qty || 0;
      const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

      const displayName = prod.nameEn || prod.nameKo || '';

      updated[idx] = {
        ...updated[idx],
        name: \`[\${prod.productCode}] \${displayName}\`,
        supplier: supName,
        supplierContact: contactInfo || '',
        grade: prod.spec || '',
        unit: (prod.unit || 'kg') as any,
        unitPrice: buyPrice,
        currency: itemCurrency,
        amount: amt,
        purchaseUnitPrice: buyPrice,
        purchaseUnitCurrency: itemCurrency
      };
      return updated;
    });
  };`;

  const oldHandleSelectProduct = `  const handleSelectProduct = (idx: number, prod: Product) => {
    setOrderItems(prev => {
      const updated = [...prev];
      const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
      
      let buyPrice = prod.purchasePrice || 0;
      let itemCurrency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
      const qty = updated[idx].qty || 0;
      const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

      const displayName = prod.nameEn || prod.nameKo || '';

      updated[idx] = {
        ...updated[idx],
        name: \`[\${prod.productCode}] \${displayName}\`,
        supplier: prod.supplierName || '',
        supplierContact: contactInfo || '',
        grade: prod.spec || '',
        unit: (prod.unit || 'kg') as any,
        unitPrice: buyPrice,
        currency: itemCurrency,
        amount: amt
      };
      return updated;
    });
  };`;

  const newHandleSelectProduct = `  const handleSelectProduct = (idx: number, prod: Product) => {
    setOrderItems(prev => {
      const updated = [...prev];
      const contactInfo = [prod.supplierEmail, prod.supplierPhone].filter(Boolean).join(' / ');
      
      let buyPrice = prod.purchasePrice || 0;
      let itemCurrency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
      let supName = prod.supplierName || '';

      if (prod.suppliers && prod.suppliers.length > 0) {
        const def = prod.suppliers.find(s => s.isDefault);
        if (def) {
          buyPrice = def.purchasePrice;
          itemCurrency = (def.currency === 'KRW' ? 'KRW' : 'USD');
          supName = def.supplierName;
        }
      }

      const qty = updated[idx].qty || 0;
      const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));

      const displayName = prod.nameEn || prod.nameKo || '';

      updated[idx] = {
        ...updated[idx],
        name: \`[\${prod.productCode}] \${displayName}\`,
        supplier: supName,
        supplierContact: contactInfo || '',
        grade: prod.spec || '',
        unit: (prod.unit || 'kg') as any,
        unitPrice: buyPrice,
        currency: itemCurrency,
        amount: amt,
        purchaseUnitPrice: buyPrice,
        purchaseUnitCurrency: itemCurrency
      };
      return updated;
    });
  };`;

  if (content.includes(oldGetSupplierPurchaseInfo)) {
    content = content.replace(oldGetSupplierPurchaseInfo, newGetSupplierPurchaseInfo);
  }
  if (content.includes(oldHandleItemChange)) {
    content = content.replace(oldHandleItemChange, newHandleItemChange);
  }
  if (content.includes(oldHandleSourcingItemChange)) {
    content = content.replace(oldHandleSourcingItemChange, newHandleSourcingItemChange);
  }
  if (content.includes(oldHandleSelectSourcingProduct)) {
    content = content.replace(oldHandleSelectSourcingProduct, newHandleSelectSourcingProduct);
  }
  if (content.includes(oldHandleSelectProduct)) {
    content = content.replace(oldHandleSelectProduct, newHandleSelectProduct);
  }

  fs.writeFileSync(odPath, content, 'utf8');
  console.log('✅ OrderDetail.tsx multi supplier pricing integration complete.');
} else {
  console.log('❌ OrderDetail.tsx not found');
}
