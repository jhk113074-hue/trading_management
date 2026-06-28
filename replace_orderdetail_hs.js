const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'app', 'src', 'pages', 'OrderDetail.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

// Target the exact items maps structure and add hsCode fields
const oldItemsMap = `        items: orderItems.map(it => ({
          itemId: it.itemId || '',
          name: it.name || '',
          supplier: it.supplier || '',
          supplierContact: it.supplierContact || '',
          grade: it.grade || '',
          qty: parseFloat(it.qty as any) || 0,
          unit: (it.unit || 'kg') as any,
          unitPrice: parseFloat(it.unitPrice as any) || 0,
          purchaseUnitPrice: it.purchaseUnitPrice != null ? (parseFloat(it.purchaseUnitPrice as any) || 0) : null,
          purchaseUnitCurrency: it.purchaseUnitCurrency || null,
          originalPurchasePrice: it.originalPurchasePrice != null ? (parseFloat(it.originalPurchasePrice as any) || 0) : null,
          originalPurchaseCurrency: it.originalPurchaseCurrency || null,
          amount: it.amount || 0,
          currency: (it.currency || 'USD') as any
        })),`;

const newItemsMap = `        items: orderItems.map(it => ({
          itemId: it.itemId || '',
          name: it.name || '',
          supplier: it.supplier || '',
          supplierContact: it.supplierContact || '',
          grade: it.grade || '',
          qty: parseFloat(it.qty as any) || 0,
          unit: (it.unit || 'kg') as any,
          unitPrice: parseFloat(it.unitPrice as any) || 0,
          purchaseUnitPrice: it.purchaseUnitPrice != null ? (parseFloat(it.purchaseUnitPrice as any) || 0) : null,
          purchaseUnitCurrency: it.purchaseUnitCurrency || null,
          originalPurchasePrice: it.originalPurchasePrice != null ? (parseFloat(it.originalPurchasePrice as any) || 0) : null,
          originalPurchaseCurrency: it.originalPurchaseCurrency || null,
          amount: it.amount || 0,
          currency: (it.currency || 'USD') as any,
          hsCode: (it as any).hsCode || ''
        })),`;

// Clean up both inputs to ignore Windows CRLF vs Linux LF
const cleanText = (t) => t.replace(/\r\n/g, '\n').trim();

const contentClean = content.replace(/\r\n/g, '\n');
const oldClean = cleanText(oldItemsMap);
const newClean = cleanText(newItemsMap);

if (contentClean.includes(oldClean)) {
  const updatedContent = contentClean.replace(oldClean, newClean);
  fs.writeFileSync(targetPath, updatedContent, 'utf8');
  console.log('✅ OrderDetail.tsx items map hsCode insertion success!');
} else {
  console.log('❌ Could not match items map template in OrderDetail.tsx.');
}
