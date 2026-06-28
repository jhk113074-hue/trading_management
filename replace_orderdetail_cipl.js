const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, 'app', 'src', 'pages', 'OrderDetail.tsx');
let content = fs.readFileSync(targetPath, 'utf8');

const oldDocBlock = `          {/* 5. 서류관리 */}
          {activeStep === '서류관리' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {/* 수출신고번호, 수출면장 기준환율 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>수출신고번호</span>
                <input type="text" value={basicForm.exportDeclarationNo || ''} onChange={e => setBasicForm(p => ({ ...p, exportDeclarationNo: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 010-22-19-1234567" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>수출면장 기준환율</span>
                <input type="number" step="0.01" value={basicForm.customsExchangeRate || ''} onChange={e => setBasicForm(p => ({ ...p, customsExchangeRate: parseFloat(e.target.value) || 0 }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 1352.50" />
              </div>
              <div />

              {/* 7개의 유첨 파일 + 신규 사진 유첨 추가 */}
              <div style={{ gridColumn: 'span 3', borderTop: '1px solid #cbd5e1', paddingTop: '12px', marginTop: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  {renderFileField('CI 유첨 (수동)', 'ciFiles', 'ci-file-input')}
                  {renderFileField('PL 유첨 (수동)', 'plFiles', 'pl-file-input')}
                  {renderFileField('COO 유첨', 'cooFiles', 'coo-file-input')}
                  {renderFileField('B/L 유첨', 'blFiles', 'bl-file-input')}
                </div>
              </div>

              <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                {renderFileField('수출면장 업로드', 'exportDeclarationFiles', 'export-declaration-file-input')}
                {renderFileField('그밖의 서류 유첨', 'otherFiles', 'other-docs-input')}
              </div>

              {/* 컨테이너 작업 및 운송 사진 */}
              <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid #cbd5e1', paddingTop: '12px', marginTop: '10px' }}>
                {renderFileField('컨테이너 작업 사진 유첨', 'containerWorkFiles', 'container-work-file-input')}
                {renderFileField('운송 사진 유첨', 'transportationFiles', 'transportation-file-input')}
              </div>
            </div>
          )}`;

const newDocBlock = `          {/* 5. 서류관리 */}
          {activeStep === '서류관리' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* 서류관리 하위 탭 */}
              <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', gap: '8px', marginBottom: '8px' }}>
                {[
                  { id: '서류업로드', label: '1) 서류 업로드 및 수출신고' },
                  { id: 'CI_PL작성', label: '2) CI / PL 작성 및 Excel 내보내기' }
                ].map(tab => {
                  const isActive = activeDocumentTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveDocumentTab(tab.id as any)}
                      style={{
                        padding: '8px 16px',
                        border: 'none',
                        background: 'none',
                        borderBottom: isActive ? '3px solid #2563eb' : '3px solid transparent',
                        color: isActive ? '#2563eb' : '#64748b',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        marginBottom: '-2px'
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {activeDocumentTab === '서류업로드' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {/* 수출신고번호, 수출면장 기준환율 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>수출신고번호</span>
                    <input type="text" value={basicForm.exportDeclarationNo || ''} onChange={e => setBasicForm(p => ({ ...p, exportDeclarationNo: e.target.value }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 010-22-19-1234567" />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#4b5563' }}>수출면장 기준환율</span>
                    <input type="number" step="0.01" value={basicForm.customsExchangeRate || ''} onChange={e => setBasicForm(p => ({ ...p, customsExchangeRate: parseFloat(e.target.value) || 0 }))} disabled={!isEditing} style={inputStyle(isEditing)} placeholder="예: 1352.50" />
                  </div>
                  <div />

                  {/* 7개의 유첨 파일 + 신규 사진 유첨 추가 */}
                  <div style={{ gridColumn: 'span 3', borderTop: '1px solid #cbd5e1', paddingTop: '12px', marginTop: '10px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                      {renderFileField('CI 유첨 (수동)', 'ciFiles', 'ci-file-input')}
                      {renderFileField('PL 유첨 (수동)', 'plFiles', 'pl-file-input')}
                      {renderFileField('COO 유첨', 'cooFiles', 'coo-file-input')}
                      {renderFileField('B/L 유첨', 'blFiles', 'bl-file-input')}
                    </div>
                  </div>

                  <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', borderTop: '1px dashed #cbd5e1', paddingTop: '10px', marginTop: '10px' }}>
                    {renderFileField('수출면장 업로드', 'exportDeclarationFiles', 'export-declaration-file-input')}
                    {renderFileField('그밖의 서류 유첨', 'otherFiles', 'other-docs-input')}
                  </div>

                  {/* 컨테이너 작업 및 운송 사진 */}
                  <div style={{ gridColumn: 'span 3', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid #cbd5e1', paddingTop: '12px', marginTop: '10px' }}>
                    {renderFileField('컨테이너 작업 사진 유첨', 'containerWorkFiles', 'container-work-file-input')}
                    {renderFileField('운송 사진 유첨', 'transportationFiles', 'transportation-file-input')}
                  </div>
                </div>
              )}

              {activeDocumentTab === 'CI_PL작성' && (() => {
                // Compute totals
                let plNet = 0;
                let plGross = 0;
                let plCbm = 0;
                let pkCount = 0;

                // Bind weights and cbm from packingList containers if available
                if (basicForm.packingList?.containers) {
                  basicForm.packingList.containers.forEach((c: any) => {
                    (c.items || []).forEach((it: any) => {
                      plNet += Number(it.netWeight) || 0;
                      plGross += Number(it.grossWeight) || 0;
                      plCbm += Number(it.cbm) || 0;
                      pkCount += Number(it.pkg) || 0;
                    });
                  });
                }

                const handleExportExcelLocal = () => {
                  const itemsPayload = orderItems.map(it => {
                    const matchedProd = products.find(p => p.productCode === it.itemId || p.id === it.itemId);
                    
                    // Match container item specs if packing list exists
                    let itemNetWeight = matchedProd?.palletWeight || 0;
                    let itemGrossWeight = matchedProd?.palletGrossWeight || 0;
                    let itemCbm = 0.5;
                    let itemPkgCount = it.qty;
                    let itemPkgType = matchedProd?.packageType || 'Pallet';

                    if (basicForm.packingList?.containers) {
                      basicForm.packingList.containers.forEach((c: any) => {
                        (c.items || []).forEach((plIt: any) => {
                          if (plIt.description?.includes(it.name) || plIt.pkgNo?.includes(it.itemId)) {
                            itemNetWeight = Number(plIt.netWeight) || 0;
                            itemGrossWeight = Number(plIt.grossWeight) || 0;
                            itemCbm = Number(plIt.cbm) || 0;
                            itemPkgCount = Number(plIt.pkg) || 0;
                            itemPkgType = plIt.packageType || 'Pallet';
                          }
                        });
                      });
                    }

                    return {
                      name: it.name || '',
                      qty: it.qty || 0,
                      unit: it.unit || 'kg',
                      unitPrice: it.unitPrice || 0,
                      amount: it.amount || 0,
                      hsCode: it.hsCode || matchedProd?.hsCode || '',
                      netWeight: itemNetWeight,
                      grossWeight: itemGrossWeight,
                      cbm: itemCbm,
                      packageType: itemPkgType,
                      packagesCount: itemPkgCount
                    };
                  });

                  // Format shipping mark to string format using basic string concats instead of escaped ticks
                  const compMark = commonShippingMark.company || 'YSACC';
                  const portCountryMark = (commonShippingMark.port || '') + ', ' + (commonShippingMark.country || '');
                  const originMark = commonShippingMark.origin || 'MADE IN KOREA';
                  const formattedMarkText = compMark + '\\n' + portCountryMark + '\\n' + originMark;

                  exportCiPlToExcel({
                    orderId: order.id,
                    piNumber: basicForm.piNumber,
                    customerName: basicForm.customer,
                    customerAddress: basicForm.customerAddress || '',
                    issuingCompany: basicForm.issuingCompany,
                    invoiceNo: basicForm.piNumber || order.id,
                    invoiceDate: basicForm.poDate || new Date().toISOString().split('T')[0],
                    lcNo: basicForm.lcNo,
                    lcDate: basicForm.lcIssuingDate,
                    lcIssuingBank: basicForm.lcIssuingBank,
                    notifyParty: basicForm.lcRemark || 'SAME AS APPLICANT', 
                    remarks: basicForm.remark,
                    portOfLoading: basicForm.portOfLoading,
                    portOfDischarge: basicForm.portOfDischarge,
                    vesselName: basicForm.vesselBooking,
                    etd: basicForm.etd,
                    paymentTerms: basicForm.paymentTerms,
                    deliveryTerms: basicForm.incoterms,
                    shippingMarks: formattedMarkText || 'N/M',
                    items: itemsPayload,
                    totalPackages: pkCount,
                    totalNetWeight: plNet,
                    totalGrossWeight: plGross,
                    totalCbm: plCbm
                  });
                };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#1e293b' }}>📄 오더 데이터를 연동한 CI & PL 가안 작성</h4>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>작성된 내용을 바탕으로 서명선과 포장단위가 삽입된 정식 Excel을 다운로드합니다.</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => handleSaveBasic(true)}
                          style={{ padding: '6px 14px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                        >
                          💾 변경 저장
                        </button>
                        <button
                          type="button"
                          onClick={handleExportExcelLocal}
                          style={{ padding: '6px 14px', background: '#10b981', border: 'none', borderRadius: '6px', fontSize: '12.5px', fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          📥 Excel 파일 내보내기
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      {/* CI/PL Header Info Form */}
                      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e3a8a', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '4px' }}>📋 선적 서류 기본 정보</div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Invoice / PL 번호</span>
                            <input type="text" value={basicForm.piNumber} onChange={e => setBasicForm(p => ({ ...p, piNumber: e.target.value }))} style={inputStyle(true)} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>작성일자 (Invoice Date)</span>
                            <input type="date" value={basicForm.poDate} onChange={e => setBasicForm(p => ({ ...p, poDate: e.target.value }))} style={inputStyle(true)} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>선적항 (Port of Loading)</span>
                            <input type="text" value={basicForm.portOfLoading} onChange={e => setBasicForm(p => ({ ...p, portOfLoading: e.target.value }))} style={inputStyle(true)} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>도착항 (Port of Discharge)</span>
                            <input type="text" value={basicForm.portOfDischarge} onChange={e => setBasicForm(p => ({ ...p, portOfDischarge: e.target.value }))} style={inputStyle(true)} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>선박명 (Vessel Name)</span>
                            <input type="text" value={basicForm.vesselBooking} onChange={e => setBasicForm(p => ({ ...p, vesselBooking: e.target.value }))} style={inputStyle(true)} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>출항예정일 (ETD)</span>
                            <input type="date" value={basicForm.etd} onChange={e => setBasicForm(p => ({ ...p, etd: e.target.value }))} style={inputStyle(true)} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>인코텀즈 (Delivery Terms)</span>
                            <input type="text" value={basicForm.incoterms} onChange={e => setBasicForm(p => ({ ...p, incoterms: e.target.value as any }))} style={inputStyle(true)} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>결제조건 (Payment Terms)</span>
                            <input type="text" value={basicForm.paymentTerms} onChange={e => setBasicForm(p => ({ ...p, paymentTerms: e.target.value }))} style={inputStyle(true)} />
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>L/C 번호 / 개설은행 (Bank Info)</span>
                          <input type="text" placeholder="L/C No 및 개설은행 정보" value={basicForm.lcNo} onChange={e => setBasicForm(p => ({ ...p, lcNo: e.target.value }))} style={inputStyle(true)} />
                        </div>
                      </div>

                      {/* Buyer & Shipper Address Box */}
                      <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f766e', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '4px' }}>🏢 거래 당사자 주소 정보</div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Shipper (송신인/제조사)</span>
                          <textarea 
                            value={basicForm.issuingCompany === 'YSACC' ? 'YSACC CO., LTD.\\nSuite 408, Dae-il Bldg, 12, Mapo-daero 4-gil,\\nMapo-gu, Seoul, 04175, Korea' : 'YS CO., LTD.\\nSuite 408, Dae-il Bldg, 12, Mapo-daero 4-gil,\\nMapo-gu, Seoul, 04175, Korea'} 
                            disabled 
                            rows={3} 
                            style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', background: '#f8fafc', color: '#64748b', fontFamily: 'monospace', resize: 'none' }} 
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Applicant (바이어 주소)</span>
                          <textarea 
                            value={basicForm.customerAddress || ''} 
                            onChange={e => setBasicForm(p => ({ ...p, customerAddress: e.target.value }))} 
                            rows={3} 
                            style={{ padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', color: '#1e293b', fontFamily: 'monospace', resize: 'none' }} 
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>Notify Party (통지처)</span>
                          <input 
                            type="text" 
                            placeholder="미입력 시 SAME AS APPLICANT로 지정됨" 
                            value={basicForm.lcRemark || ''} 
                            onChange={e => setBasicForm(p => ({ ...p, lcRemark: e.target.value }))} 
                            style={inputStyle(true)} 
                          />
                        </div>
                      </div>
                    </div>

                    {/* 품목 HS CODE 및 상세 조작 테이블 */}
                    <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>📦 선적 품목 및 HS CODE 확인</span>
                        <span style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px' }}>마스터에 등록된 HS Code가 기본 바인딩되며 개별 수정 가능합니다.</span>
                      </div>
                      
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '8px', color: '#475569', fontWeight: 700 }}>품명 (Description of Goods)</th>
                            <th style={{ padding: '8px', color: '#475569', fontWeight: 700, width: '150px' }}>HS CODE</th>
                            <th style={{ padding: '8px', color: '#475569', fontWeight: 700, width: '100px', textAlign: 'right' }}>수량 (Qty)</th>
                            <th style={{ padding: '8px', color: '#475569', fontWeight: 700, width: '120px', textAlign: 'right' }}>단가 (Unit Price)</th>
                            <th style={{ padding: '8px', color: '#475569', fontWeight: 700, width: '120px', textAlign: 'right' }}>금액 (Amount)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderItems.map((item, idx) => {
                            const matchedProd = products.find(p => p.productCode === item.itemId || p.id === item.itemId);
                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '8px', fontWeight: 600, color: '#0f172a' }}>{item.name}</td>
                                <td style={{ padding: '6px 8px' }}>
                                  <input 
                                    type="text" 
                                    value={item.hsCode || matchedProd?.hsCode || ''} 
                                    onChange={e => {
                                      const nextCode = e.target.value;
                                      setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, hsCode: nextCode } : it));
                                    }} 
                                    placeholder="HS Code 입력"
                                    style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', width: '100%', fontSize: '11.5px', fontWeight: 600, color: '#334155' }} 
                                  />
                                </td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700 }}>{item.qty} {item.unit}</td>
                                <td style={{ padding: '8px', textAlign: 'right', color: '#0f766e' }}>$ {Number(item.unitPrice).toFixed(2)}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#0369a1' }}>$ {Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}`;

const contentClean = content.replace(/\r\n/g, '\n');
const oldClean = oldDocBlock.replace(/\r\n/g, '\n').trim();
const newClean = newDocBlock.replace(/\r\n/g, '\n').trim();

if (contentClean.includes(oldClean)) {
  const updatedContent = contentClean.replace(oldClean, newClean);
  fs.writeFileSync(targetPath, updatedContent, 'utf8');
  console.log('✅ OrderDetail.tsx document sub-tab & CI/PL builder layout replacement success!');
} else {
  console.log('❌ Could not match oldDocBlock in OrderDetail.tsx.');
}
