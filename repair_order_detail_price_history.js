const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const odPath = path.join(rootDir, 'app', 'src', 'pages', 'OrderDetail.tsx');

if (fs.existsSync(odPath)) {
  let content = fs.readFileSync(odPath, 'utf8').replace(/\r\n/g, '\n');

  // 1. getSupplierPurchaseInfo 에서 matchedProd.purchasePrices 를 조회하여 날짜 및 공급사가 맞는 단가를 적용
  const oldGetSupplierPurchaseInfo = `  const getSupplierPurchaseInfo = (it: any) => {
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

  const newGetSupplierPurchaseInfo = `  const getSupplierPurchaseInfo = (it: any) => {
    const match = (it.name || '').match(/^\\[(.*?)\\]\\s*(.*)$/);
    const itemCode = match ? match[1] : '-';
    const matchedProd = products.find(p => p.productCode === itemCode || p.id === itemCode);

    let defaultPrice = matchedProd ? (matchedProd.purchasePrice || 0) : (it.unitPrice || 0);
    let defaultCurrency = matchedProd ? (matchedProd.currency || 'USD') : 'USD';

    // 단가 테이블(purchasePrices)에서 공급사가 일치하고 날짜가 부합하는 최근 단가 매핑
    if (matchedProd && matchedProd.purchasePrices && matchedProd.purchasePrices.length > 0) {
      const activeSup = it.supplier?.trim();
      // 지정 공급사와 일치하는 단가들 필터링
      let matchedHists = matchedProd.purchasePrices.filter(p => p.supplierName?.trim() === activeSup || p.supplierCode === activeSup);
      
      // 일치하는 공급사가 없으면 기본 공급사의 단가 필터링
      if (matchedHists.length === 0 && matchedProd.suppliers && matchedProd.suppliers.length > 0) {
        const def = matchedProd.suppliers.find(s => s.isDefault) || matchedProd.suppliers[0];
        matchedHists = matchedProd.purchasePrices.filter(p => p.supplierCode === def.supplierCode || p.supplierName === def.supplierName);
      }

      // 날짜순(최신순) 정렬하여 적용 시작일이 현재보다 과거이거나 가장 임박한 첫 번째 단가 채택
      if (matchedHists.length > 0) {
        matchedHists.sort((a, b) => b.validFrom.localeCompare(a.validFrom));
        defaultPrice = matchedHists[0].price;
        defaultCurrency = matchedHists[0].currency;
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

  // 2. handleItemChange, handleSourcingItemChange, handleSelectSourcingProduct, handleSelectProduct 에서
  // 단가(price)를 가져올 때, matchedProd.purchasePrices 에서 공급사와 결합하여 최근 단가로 세팅하도록 보완
  
  // 이를 돕는 공통 헬퍼 함수
  const lookupHelperCode = `  const getPriceForSupplier = (prod: Product, supplierNameOrCode: string) => {
    let price = prod.purchasePrice || 0;
    let currency: 'USD' | 'KRW' = (prod.currency === 'KRW' ? 'KRW' : 'USD');
    
    if (prod.purchasePrices && prod.purchasePrices.length > 0) {
      const match = prod.purchasePrices
        .filter(p => p.supplierName === supplierNameOrCode || p.supplierCode === supplierNameOrCode)
        .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
      
      if (match.length > 0) {
        price = match[0].price;
        currency = (match[0].currency === 'KRW' ? 'KRW' : 'USD');
      } else {
        // 일치하는 단가 레코드가 없으면 전체 단가 테이블 중 가장 최신 것 사용
        const allSorted = [...prod.purchasePrices].sort((a, b) => b.validFrom.localeCompare(a.validFrom));
        if (allSorted.length > 0) {
          price = allSorted[0].price;
          currency = (allSorted[0].currency === 'KRW' ? 'KRW' : 'USD');
        }
      }
    }
    return { price, currency };
  };`;

  // content의 적당한 곳에 헬퍼 함수 삽입 (getSupplierPurchaseInfo 위에 삽입)
  content = content.replace('  const getSupplierPurchaseInfo = (it: any) => {', lookupHelperCode + '\n\n  const getSupplierPurchaseInfo = (it: any) => {');

  // getSupplierPurchaseInfo 변경 적용
  if (content.includes(oldGetSupplierPurchaseInfo)) {
    content = content.replace(oldGetSupplierPurchaseInfo, newGetSupplierPurchaseInfo);
  }

  // 3. handleItemChange 에서 supplier 변경 시 및 품목 최초 선택 시 단가 조회 로직을 getPriceForSupplier로 변경
  const oldItemNamePart = `          let buyPrice = prod.purchasePrice || 0;
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
          const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));`;

  const newItemNamePart = `          let supName = prod.supplierName || '';
          if (prod.suppliers && prod.suppliers.length > 0) {
            const defLink = prod.suppliers.find(s => s.isDefault);
            if (defLink) {
              supName = defLink.supplierName;
            }
          }
          
          const priceObj = getPriceForSupplier(prod, supName);
          let buyPrice = priceObj.price;
          let itemCurrency = priceObj.currency;

          const qty = it.qty || 0;
          const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));`;

  content = content.replace(oldItemNamePart, newItemNamePart);

  const oldSupplierChangePart = `      if (field === 'supplier') {
        const parsedCode = getRawProductCode(it.name);
        const prod = products.find(p => p.productCode === parsedCode || p.id === parsedCode);
        if (prod && prod.suppliers && prod.suppliers.length > 0) {
          const link = prod.suppliers.find(s => s.supplierName === value || s.supplierCode === value);
          if (link) {
            it.unitPrice = link.purchasePrice;
            it.currency = (link.currency === 'KRW' ? 'KRW' : 'USD');
            it.purchaseUnitPrice = link.purchasePrice;
            it.purchaseUnitCurrency = (link.currency === 'KRW' ? 'KRW' : 'USD');
            if (it.qty) {
              it.amount = it.currency === 'KRW' ? Math.round(it.qty * link.purchasePrice) : parseFloat((it.qty * link.purchasePrice).toFixed(2));
            }
          }
        }
      }`;

  const newSupplierChangePart = `      if (field === 'supplier') {
        const parsedCode = getRawProductCode(it.name);
        const prod = products.find(p => p.productCode === parsedCode || p.id === parsedCode);
        if (prod) {
          const priceObj = getPriceForSupplier(prod, value);
          it.unitPrice = priceObj.price;
          it.currency = priceObj.currency;
          it.purchaseUnitPrice = priceObj.price;
          it.purchaseUnitCurrency = priceObj.currency;
          if (it.qty) {
            it.amount = priceObj.currency === 'KRW' ? Math.round(it.qty * priceObj.price) : parseFloat((it.qty * priceObj.price).toFixed(2));
          }
        }
      }`;

  content = content.replace(oldSupplierChangePart, newSupplierChangePart);

  // 4. handleSourcingItemChange 에서 supplier 변경 시 및 품목 최초 선택 시 단가 조회 로직을 getPriceForSupplier로 변경
  // content.replace가 여러 번 적용되도록 처리
  content = content.replace(oldItemNamePart, newItemNamePart); // sourcing block
  content = content.replace(oldSupplierChangePart, newSupplierChangePart); // sourcing block

  // 5. handleSelectSourcingProduct 및 handleSelectProduct 내 단가 바인딩 부분 수정
  const oldSelectSourcingProduct = `      let buyPrice = prod.purchasePrice || 0;
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
      const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));`;

  const newSelectSourcingProduct = `      let supName = prod.supplierName || '';
      if (prod.suppliers && prod.suppliers.length > 0) {
        const def = prod.suppliers.find(s => s.isDefault);
        if (def) {
          supName = def.supplierName;
        }
      }

      const priceObj = getPriceForSupplier(prod, supName);
      let buyPrice = priceObj.price;
      let itemCurrency = priceObj.currency;

      const qty = updated[idx].qty || 0;
      const amt = itemCurrency === 'KRW' ? Math.round(qty * buyPrice) : parseFloat((qty * buyPrice).toFixed(2));`;

  content = content.replace(oldSelectSourcingProduct, newSelectSourcingProduct); // sourcing select
  content = content.replace(oldSelectSourcingProduct, newSelectSourcingProduct); // normal select

  fs.writeFileSync(odPath, content, 'utf8');
  console.log('✅ OrderDetail.tsx multi supplier price history binding complete.');
} else {
  console.log('❌ OrderDetail.tsx not found');
}
