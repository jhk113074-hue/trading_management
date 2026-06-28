const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const pmPath = path.join(rootDir, 'app', 'src', 'components', 'ProductModal.tsx');

if (fs.existsSync(pmPath)) {
  let content = fs.readFileSync(pmPath, 'utf8').replace(/\r\n/g, '\n');

  // 1. suppliers.find 및 suppliers.map 부분에 대한 Optional Chaining (?.) 전방위 적용
  // 제조사 datalist 보호
  content = content.replace(
    `                          {suppliers.map(s => (
                            <option key={s.id} value={\`[\${s.supplierCode}] \${s.name}\`}>
                              {s.name} ({s.supplierCode})
                            </option>
                          ))}`,
    `                          {(suppliers || []).map(s => {
                            if (!s) return null;
                            return (
                              <option key={s.id || Math.random().toString()} value={\`[\${s.supplierCode || ''}] \${s.name || ''}\`}>
                                {s.name || ''} ({s.supplierCode || ''})
                              </option>
                            );
                          })}`
  );

  // 유통사 datalist 보호
  content = content.replace(
    `                      <datalist id="multi_suppliers_datalist">
                        {suppliers.map(s => (
                          <option key={s.id} value={\`[\${s.supplierCode}] \${s.name}\`} />
                        ))}
                      </datalist>`,
    `                      <datalist id="multi_suppliers_datalist">
                        {(suppliers || []).map(s => {
                          if (!s) return null;
                          return (
                            <option key={s.id || Math.random().toString()} value={\`[\${s.supplierCode || ''}] \${s.name || ''}\`} />
                          );
                        })}
                      </datalist>`
  );

  // suppliers.find 검색식 Optional Chaining 으로 안전 보강
  content = content.replace(
    `const found = suppliers.find(s => s.supplierCode === code || s.name === val || \`[\${s.supplierCode}] \${s.name}\` === val);`,
    `const found = (suppliers || []).find(s => s && (s.supplierCode === code || s.name === val || \`[\${s.supplierCode || ''}] \${s.name || ''}\` === val));`
  );

  content = content.replace(
    `const found = suppliers.find(s => s.supplierCode === code || s.name === selSupplierVal || \`[\${s.supplierCode}] \${s.name}\` === selSupplierVal);`,
    `const found = (suppliers || []).find(s => s && (s.supplierCode === code || s.name === selSupplierVal || \`[\${s.supplierCode || ''}] \${s.name || ''}\` === selSupplierVal));`
  );

  // 유통사 테이블 행 내 suppliers.find 부분 보호 강화
  content = content.replace(
    `                                  const found = suppliers.find(s => s.supplierCode === sup.supplierCode);
                                  if (!found) return null;
                                  const contact = found.managerName || '-';
                                  const phone = found.managerPhone || found.phone || '-';
                                  const email = found.purchaseEmail || found.email || '-';
                                  const addr = found.address || '-';`,
    `                                  const found = (suppliers || []).find(s => s && s.supplierCode === sup.supplierCode);
                                  if (!found) return null;
                                  const contact = found.managerName || found.manager || '-';
                                  const phone = found.managerPhone || found.phone || found.mobile || '-';
                                  const email = found.purchaseEmail || found.email || '-';
                                  const addr = found.address || '-';`
  );

  fs.writeFileSync(pmPath, content, 'utf8');
  console.log('✅ ProductModal.tsx suppliers layout crashes protected.');
} else {
  console.log('❌ ProductModal.tsx not found');
}
