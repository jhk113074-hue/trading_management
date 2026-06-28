const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const pmPath = path.join(rootDir, 'app', 'src', 'components', 'ProductModal.tsx');

if (fs.existsSync(pmPath)) {
  let content = fs.readFileSync(pmPath, 'utf8').replace(/\r\n/g, '\n');

  // 1. initialProduct 로드 시 자동 이관 로직 주입
  const oldSetFormData = `      setFormData({
        ...initialProduct,
        productCode: nextCode,
        packingMethods: updatedMethods
      });`;

  const newSetFormData = `      let resolvedSuppliers = initialProduct.suppliers || [];
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

  if (content.includes(oldSetFormData)) {
    content = content.replace(oldSetFormData, newSetFormData);
  }

  // 2. handleSave 시 Double Writing 보정 적용
  const oldHandleSaveStart = `  const handleSave = async () => {
    if (!formData.productCode?.trim()) { alert('상품코드는 필수 입력사항입니다.'); return; }
    if (!formData.nameKo?.trim()) { alert('상품명(한글)은 필수 입력사항입니다.'); return; }

    setIsSaving(true);
    try {
      const docId = (initialProduct && !isCopy) ? initialProduct.id : formData.productCode;
      
      const isPallet = formData.packageType?.toLowerCase().includes('pallet');
      const finalData: Partial<Product> = {
        ...formData,`;

  const newHandleSaveStart = `  const handleSave = async () => {
    if (!formData.productCode?.trim()) { alert('상품코드는 필수 입력사항입니다.'); return; }
    if (!formData.nameKo?.trim()) { alert('상품명(한글)은 필수 입력사항입니다.'); return; }

    setIsSaving(true);
    try {
      const docId = (initialProduct && !isCopy) ? initialProduct.id : formData.productCode;
      
      // 기본 공급 유통사 정보를 구형 단일 필드군에 대입 (하위 호환성 유지)
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
      const finalData: Partial<Product> = {
        ...formData,
        ...backupFields,`;

  if (content.includes(oldHandleSaveStart)) {
    content = content.replace(oldHandleSaveStart, newHandleSaveStart);
  }

  // 3. 탭 리스트 수정 (3번 가격 탭 삭제, 4번->3번, 5번->4번 명칭 정돈)
  const oldTabsList = `        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', border: '1px solid #e8ecf0', padding: '4px', borderRadius: '8px', marginBottom: '22px' }}>
            {[
              { id: 1, label: '📑 1. 기본 정보' },
              { id: 2, label: '🏭 2. 공급 & 공급처' },
              { id: 3, label: '💰 3. 구매 & 가격' },
              { id: 4, label: '📦 4. 패킹 정보' },
              { id: 6, label: '🔬 5. 기술 자료' },
            ].map(tab => (`;

  const newTabsList = `        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', border: '1px solid #e8ecf0', padding: '4px', borderRadius: '8px', marginBottom: '22px' }}>
            {[
              { id: 1, label: '📑 1. 기본 정보' },
              { id: 2, label: '🏭 2. 공급 & 가격' },
              { id: 4, label: '📦 3. 패킹 정보' },
              { id: 6, label: '🔬 4. 기술 자료' },
            ].map(tab => (`;

  if (content.includes(oldTabsList)) {
    content = content.replace(oldTabsList, newTabsList);
  }

  // 4. Tab 2에서 구형 공급사(Supplier) 입력란 삭제
  const oldTab2SupplierSection = `            {activeTab === 2 && (
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
                          const found = suppliers.find(s => s.supplierCode === code || s.name === val || \`[\${s.supplierCode}] \${s.name}\` === val);
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
                          <option key={s.id} value={\`[\${s.supplierCode}] \${s.name}\`}>
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
                </div>`;

  const newTab2SupplierSection = `            {activeTab === 2 && (
              <>`;

  if (content.includes(oldTab2SupplierSection)) {
    content = content.replace(oldTab2SupplierSection, newTab2SupplierSection);
  }

  // 5. Tab 3 (💰 3. 구매 & 가격) 섹션 삭제 (activeTab === 3 삭제)
  const oldTab3Section = `            {activeTab === 3 && (
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#475569', margin: 0 }}>📋 단가 이력 및 조건 목록</h4>
                    <button
                      type="button"
                      onClick={() => {
                        const newHist = {
                          id: 'hist_' + Math.random().toString(36).substr(2, 9),
                          validFrom: new Date().toISOString().split('T')[0],
                          validTo: '9999-12-31',
                          currency: formData.currency || 'USD',
                          price: formData.purchasePrice || 0,
                          minQty: 1,
                          discountRate: 0,
                          remarks: ''
                        };
                        setFormData(prev => ({
                          ...prev,
                          purchasePrices: [newHist, ...(prev.purchasePrices || [])]
                        }));
                      }}
                      style={{ padding: '4px 10px', fontSize: '11px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      + 단가 추가
                    </button>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', color: '#475569', fontWeight: 600 }}>
                        <th style={{ padding: '6px', textAlign: 'left' }}>시작일</th>
                        <th style={{ padding: '6px', textAlign: 'left' }}>통화</th>
                        <th style={{ padding: '6px', textAlign: 'left' }}>단가</th>
                        <th style={{ padding: '6px', textAlign: 'left' }}>MOQ</th>
                        <th style={{ padding: '6px', textAlign: 'left' }}>비고</th>
                        <th style={{ padding: '6px', textAlign: 'center' }}>작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!formData.purchasePrices || formData.purchasePrices.length === 0) ? (
                        <tr>
                          <td colSpan={6} style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>등록된 단가 이력이 없습니다.</td>
                        </tr>
                      ) : (
                        formData.purchasePrices.map((hist, idx) => (
                          <tr key={hist.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px' }}>
                              <input
                                type="date"
                                value={hist.validFrom}
                                onChange={e => handlePriceHistoryChange(idx, 'validFrom', e.target.value)}
                                style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 4px', fontSize: '11px' }}
                              />
                            </td>
                            <td style={{ padding: '6px' }}>
                              <select
                                value={hist.currency}
                                onChange={e => handlePriceHistoryChange(idx, 'currency', e.target.value)}
                                style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px', fontSize: '11px' }}
                              >
                                <option value="USD">USD</option>
                                <option value="KRW">KRW</option>
                                <option value="EUR">EUR</option>
                              </select>
                            </td>
                            <td style={{ padding: '6px' }}>
                              <input
                                type="number"
                                value={hist.price}
                                onChange={e => handlePriceHistoryChange(idx, 'price', parseFloat(e.target.value) || 0)}
                                style={{ width: '80px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 4px', fontSize: '11px' }}
                              />
                            </td>
                            <td style={{ padding: '6px' }}>
                              <input
                                type="number"
                                value={hist.minQty}
                                onChange={e => handlePriceHistoryChange(idx, 'minQty', parseInt(e.target.value) || 0)}
                                style={{ width: '60px', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 4px', fontSize: '11px' }}
                              />
                            </td>
                            <td style={{ padding: '6px' }}>
                              <input
                                type="text"
                                value={hist.remarks}
                                onChange={e => handlePriceHistoryChange(idx, 'remarks', e.target.value)}
                                placeholder="특이사항"
                                style={{ border: '1px solid #cbd5e1', borderRadius: '4px', padding: '2px 4px', fontSize: '11px', width: '100%', boxSizing: 'border-box' }}
                              />
                            </td>
                            <td style={{ padding: '6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                onClick={() => handleApplyPriceHistory(hist)}
                                style={{ padding: '2px 6px', background: '#dcfce7', border: '1px solid #bbf7d0', color: '#16a34a', borderRadius: '4px', fontSize: '11px', marginRight: '4px', cursor: 'pointer' }}
                              >
                                ★ 기준
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData(prev => ({
                                    ...prev,
                                    purchasePrices: (prev.purchasePrices || []).filter((_, i) => i !== idx)
                                  }));
                                }}
                                style={{ padding: '2px 6px', background: '#fee2e2', border: '1px solid #fecaca', color: '#ef4444', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}`;

  if (content.includes(oldTab3Section)) {
    content = content.replace(oldTab3Section, '');
  }

  fs.writeFileSync(pmPath, content, 'utf8');
  console.log('✅ ProductModal.tsx consolidated Supply & Price tab integration complete.');
} else {
  console.log('❌ ProductModal.tsx not found');
}
