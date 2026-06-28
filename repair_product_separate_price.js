const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const pmPath = path.join(rootDir, 'app', 'src', 'components', 'ProductModal.tsx');

if (fs.existsSync(pmPath)) {
  let content = fs.readFileSync(pmPath, 'utf8').replace(/\r\n/g, '\n');

  // 1. 탭 구성 원복 (3번 구매 & 가격 탭 부활)
  const oldTabsList = `            {[
              { id: 1, label: '📑 1. 기본 정보' },
              { id: 2, label: '🏭 2. 공급 & 가격' },
              { id: 4, label: '📦 3. 패킹 정보' },
              { id: 6, label: '🔬 4. 기술 자료' },
            ].map(tab => (`;

  const newTabsList = `            {[
                { id: 1, label: '📑 1. 기본 정보' },
                { id: 2, label: '🏭 2. 공급 유통망' },
                { id: 3, label: '💰 3. 가격(단가) 관리' },
                { id: 4, label: '📦 4. 패킹 정보' },
                { id: 6, label: '🔬 5. 기술 자료' },
            ].map(tab => (`;

  if (content.includes(oldTabsList)) {
    content = content.replace(oldTabsList, newTabsList);
  }

  // 2. 탭 2의 "공급 유통사 지정" UI에서 가격, 통화, MOQ, 납기, 비고 필드와 테이블 열 제거
  const oldMultiSupplierSection = `                {/* ─── 다중 유통사 및 단가 계약 관리 섹션 ─── */}
                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '16px', marginTop: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '15px' }}>🔗</span>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#7e22ce', margin: 0 }}>공급 유통사 지정 및 가격 정보 (다중 관리)</h4>
                    <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: 'auto' }}>제조사 제품별 유통 채널별 계약 단가</span>
                  </div>

                  {/* 신규 유통사 정보 등록 폼 */}
                  <div style={{ background: '#fff', border: '1px solid #f3e8ff', borderRadius: '8px', padding: '12px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>유통사 선택</label>
                        <input
                          type="text"
                          list="multi_suppliers_datalist"
                          value={selSupplierVal}
                          placeholder="유통사 검색 및 입력"
                          onChange={e => setSelSupplierVal(e.target.value)}
                          style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}
                        />
                        <datalist id="multi_suppliers_datalist">
                          {suppliers.map(s => (
                            <option key={s.id} value={\`[\${s.supplierCode}] \${s.name}\`} />
                          ))}
                        </datalist>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>납품 단가 (구매가)</label>
                        <input
                          type="number"
                          value={selPrice}
                          step="0.01"
                          onChange={e => setSelPrice(parseFloat(e.target.value) || 0)}
                          style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>거래 통화</label>
                        <select
                          value={selCurrency}
                          onChange={e => setSelCurrency(e.target.value)}
                          style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}
                        >
                          <option value="USD">USD</option>
                          <option value="KRW">KRW</option>
                          <option value="EUR">EUR</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>최소 주문수량 (MOQ)</label>
                        <input
                          type="number"
                          value={selMoq}
                          onChange={e => setSelMoq(parseInt(e.target.value) || 0)}
                          style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>납기 (L/T 일수)</label>
                        <input
                          type="number"
                          value={selLeadTime}
                          onChange={e => setSelLeadTime(parseInt(e.target.value) || 0)}
                          style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>특이사항 (메모)</label>
                        <input
                          type="text"
                          value={selRemarks}
                          placeholder="단가 계약 비고 등"
                          onChange={e => setSelRemarks(e.target.value)}
                          style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const code = getRawSupplierCode(selSupplierVal);
                        const found = suppliers.find(s => s.supplierCode === code || s.name === selSupplierVal || \`[\${s.supplierCode}] \${s.name}\` === selSupplierVal);
                        if (!found && !selSupplierVal.trim()) {
                          alert('유통(공급)사를 먼저 선택해주세요.');
                          return;
                        }
                        const sCode = found ? found.supplierCode : code;
                        const sName = found ? found.name : selSupplierVal;

                        const newLink = {
                          supplierCode: sCode,
                          supplierName: sName,
                          purchasePrice: selPrice,
                          currency: selCurrency,
                          minOrderQty: selMoq,
                          leadTimeDays: selLeadTime,
                          isDefault: (formData.suppliers || []).length === 0, // 첫 공급사는 자동으로 기본값 설정
                          remarks: selRemarks
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
                        setSelPrice(0);
                        setSelCurrency('USD');
                        setSelMoq(0);
                        setSelLeadTime(0);
                        setSelRemarks('');
                      }}
                      style={{ marginTop: '4px', background: '#7e22ce', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      ➕ 유통사 지정 추가
                    </button>
                  </div>

                  {/* 등록된 유통사 목록 테이블 */}
                  <div style={{ border: '1px solid #e9d5ff', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f5f3ff', borderBottom: '1px solid #e9d5ff', color: '#6b21a8', fontWeight: 700 }}>
                          <th style={{ padding: '8px' }}>기본</th>
                          <th style={{ padding: '8px' }}>유통사명 (코드)</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>납품 단가</th>
                          <th style={{ padding: '8px' }}>통화</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>MOQ</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>납기</th>
                          <th style={{ padding: '8px' }}>비고</th>
                          <th style={{ padding: '8px', textAlign: 'center' }}>삭제</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!formData.suppliers || formData.suppliers.length === 0) ? (
                          <tr>
                            <td colSpan={8} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>등록된 유통사가 없습니다. 상단에서 유통사를 추가해 주세요.</td>
                          </tr>
                        ) : (
                          formData.suppliers.map((sup, idx) => (
                            <tr key={sup.supplierCode} style={{ borderBottom: '1px solid #f3e8ff' }}>
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
                                  style={{ cursor: 'pointer' }}
                                />
                              </td>
                              <td style={{ padding: '8px', fontWeight: 600 }}>{sup.supplierName} <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: 400 }}>({sup.supplierCode})</span></td>
                              <td style={{ padding: '8px', textAlign: 'right', color: '#7e22ce', fontWeight: 700 }}>{sup.purchasePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td style={{ padding: '8px' }}>{sup.currency}</td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{sup.minOrderQty.toLocaleString()}</td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{sup.leadTimeDays}일</td>
                              <td style={{ padding: '8px', color: '#6b7280' }}>{sup.remarks || '-'}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData(prev => {
                                      const next = (prev.suppliers || []).filter((_, i) => i !== idx);
                                      // 만약 지운 항목이 기본 공급사였고 남은 항목이 있다면 첫 번째 항목을 기본값으로 승격
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
                </div>`;

  const newMultiSupplierSection = `                {/* ─── 공급 유통망 지정 섹션 ─── */}
                <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '16px', marginTop: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '15px' }}>🔗</span>
                    <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#7e22ce', margin: 0 }}>거래 유통사 지정</h4>
                    <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: 'auto' }}>거래 가능한 파트너 유통업체 지정</span>
                  </div>

                  {/* 신규 유통사 정보 등록 폼 */}
                  <div style={{ background: '#fff', border: '1px solid #f3e8ff', borderRadius: '8px', padding: '12px', marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>유통사 선택</label>
                      <input
                        type="text"
                        list="multi_suppliers_datalist"
                        value={selSupplierVal}
                        placeholder="유통사 검색 및 입력"
                        onChange={e => setSelSupplierVal(e.target.value)}
                        style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px' }}
                      />
                      <datalist id="multi_suppliers_datalist">
                        {suppliers.map(s => (
                          <option key={s.id} value={\`[\${s.supplierCode}] \${s.name}\`} />
                        ))}
                      </datalist>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const code = getRawSupplierCode(selSupplierVal);
                        const found = suppliers.find(s => s.supplierCode === code || s.name === selSupplierVal || \`[\${s.supplierCode}] \${s.name}\` === selSupplierVal);
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
                      style={{ background: '#7e22ce', color: '#fff', border: 'none', borderRadius: '6px', padding: '9px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', height: '36px', marginTop: '16px' }}
                    >
                      ➕ 유통사 추가
                    </button>
                  </div>

                  {/* 등록된 유통사 목록 테이블 */}
                  <div style={{ border: '1px solid #e9d5ff', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f5f3ff', borderBottom: '1px solid #e9d5ff', color: '#6b21a8', fontWeight: 700 }}>
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
                            <tr key={sup.supplierCode} style={{ borderBottom: '1px solid #f3e8ff' }}>
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
                                  style={{ cursor: 'pointer' }}
                                />
                              </td>
                              <td style={{ padding: '8px', fontWeight: 600 }}>{sup.supplierName} <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: 400 }}>({sup.supplierCode})</span></td>
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
                </div>`;

  if (content.includes(oldMultiSupplierSection)) {
    content = content.replace(oldMultiSupplierSection, newMultiSupplierSection);
  }

  // 3. 탭 3 (💰 가격(단가) 관리) 렌더링 블록 전면 개편
  // validFrom(날짜) / supplierCode & supplierName(공급사 선택) / currency(통화) / price(납품단가) / remarks(비고)
  const oldPriceTabSection = `            {activeTab === 3 && (
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
            )}`;

  const newPriceTabSection = `            {activeTab === 3 && (
              <>
                <div style={{ border: '1px solid #e9d5ff', borderRadius: '10px', padding: '16px', background: '#faf5ff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                      <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#7e22ce', margin: 0 }}>📋 유통사별 납품 단가 관리</h4>
                      <span style={{ fontSize: '11px', color: '#6b7280' }}>거래처별 계약 단가 이력 히스토리</span>
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
                      style={{ padding: '6px 12px', fontSize: '12px', background: '#7e22ce', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      ➕ 단가 추가
                    </button>
                  </div>

                  <div style={{ border: '1px solid #e9d5ff', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f5f3ff', borderBottom: '1px solid #e9d5ff', color: '#6b21a8', fontWeight: 700 }}>
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
                            <tr key={idx} style={{ borderBottom: '1px solid #f3e8ff' }}>
                              <td style={{ padding: '6px 8px' }}>
                                <input
                                  type="date"
                                  value={hist.validFrom}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setFormData(prev => {
                                      const next = [...(prev.purchasePrices || [])];
                                      next[idx] = { ...next[idx], validFrom: val };
                                      return { ...prev, purchasePrices: next };
                                    });
                                  }}
                                  style={{ padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}
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
                                  style={{ padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}
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
                                  style={{ padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}
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
                                  style={{ padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', width: '100%', textAlign: 'right', boxSizing: 'border-box' }}
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
                                  style={{ padding: '4px 6px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}
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
            )}`;

  if (content.includes(oldPriceTabSection)) {
    content = content.replace(oldPriceTabSection, newPriceTabSection);
  }

  fs.writeFileSync(pmPath, content, 'utf8');
  console.log('✅ ProductModal.tsx separate price history layout integration complete.');
} else {
  console.log('❌ ProductModal.tsx not found');
}
