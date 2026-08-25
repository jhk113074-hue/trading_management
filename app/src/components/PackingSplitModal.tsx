import React, { useState, useMemo } from 'react';

interface PackingSplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any;
  onConfirm: (splitRows: any[]) => void;
}

export const PackingSplitModal: React.FC<PackingSplitModalProps> = ({
  isOpen,
  onClose,
  item,
  onConfirm
}) => {
  if (!isOpen || !item) return null;

  const totalQty = parseFloat(item.qty) || 0;
  const totalNet = parseFloat(item.netWeight) || 0;
  const totalGross = parseFloat(item.grossWeight) || 0;
  const totalCbm = parseFloat(item.cbm) || 0;

  // Split mode: 'by_unit' (1PLT당 수량/중량 기준 + 나머지) or 'by_count' (균등 분할할 PLT 개수)
  const [splitMode, setSplitMode] = useState<'by_unit' | 'by_count'>('by_unit');
  
  // Default unit: if totalQty is 3400, default to 1000 or half
  const [unitSize, setUnitSize] = useState<string>(() => {
    if (totalQty >= 1000) return '1000';
    if (totalQty >= 100) return '50';
    return String(Math.max(1, Math.floor(totalQty / 2)));
  });

  const [splitCount, setSplitCount] = useState<string>('2');

  // Calculate split rows
  const previewRows = useMemo(() => {
    if (totalQty <= 0) return [];

    const cleanDims = (item.dimensions || '').toLowerCase().replace(/\s+/g, '');
    const dims = cleanDims.split('x').map((n: string) => parseFloat(n) || 0);
    const hasValidDims = dims[0] > 0 && dims[1] > 0 && dims[2] > 0;

    const rows: any[] = [];

    if (splitMode === 'by_unit') {
      const parsedUnit = parseFloat(unitSize) || 0;
      if (parsedUnit <= 0 || parsedUnit >= totalQty) {
        // Just 1 row or invalid
        return [{
          ...item,
          pkg: '1',
          qty: String(totalQty),
          netWeight: String(totalNet),
          grossWeight: String(totalGross),
          cbm: String(totalCbm.toFixed(3)),
          isRemainder: false
        }];
      }

      const numFull = Math.floor(totalQty / parsedUnit);
      const remainder = Math.round((totalQty - (numFull * parsedUnit)) * 1000) / 1000;

      const singleCbm = hasValidDims 
        ? ((dims[0] * dims[1] * dims[2]) / 1000000000) 
        : (totalCbm / (numFull + (remainder > 0 ? 1 : 0)));

      // Add full PLTs
      for (let i = 0; i < numFull; i++) {
        const ratio = parsedUnit / totalQty;
        rows.push({
          ...item,
          pkg: '1',
          qty: String(parsedUnit),
          netWeight: String(Math.round(totalNet * ratio * 10) / 10),
          grossWeight: String(Math.round(totalGross * ratio * 10) / 10),
          cbm: String(singleCbm.toFixed(3)),
          isRemainder: false,
          label: `정량 PLT #${i + 1}`
        });
      }

      // Add remainder PLT if any
      if (remainder > 0) {
        const ratio = remainder / totalQty;
        rows.push({
          ...item,
          pkg: '1',
          qty: String(remainder),
          netWeight: String(Math.round(totalNet * ratio * 10) / 10),
          grossWeight: String(Math.round(totalGross * ratio * 10) / 10),
          cbm: String(singleCbm.toFixed(3)),
          isRemainder: true,
          label: `잔여(나머지) PLT`
        });
      }
    } else {
      // By split count (equal split)
      const count = Math.max(2, parseInt(splitCount, 10) || 2);
      const baseQty = Math.floor(totalQty / count);
      const remainder = totalQty % count;

      const singleCbm = hasValidDims 
        ? ((dims[0] * dims[1] * dims[2]) / 1000000000) 
        : (totalCbm / count);

      for (let i = 0; i < count; i++) {
        const curQty = baseQty + (i === 0 ? remainder : 0);
        const ratio = curQty / totalQty;
        rows.push({
          ...item,
          pkg: '1',
          qty: String(curQty),
          netWeight: String(Math.round(totalNet * ratio * 10) / 10),
          grossWeight: String(Math.round(totalGross * ratio * 10) / 10),
          cbm: String(singleCbm.toFixed(3)),
          isRemainder: false,
          label: `PLT #${i + 1}`
        });
      }
    }

    return rows;
  }, [item, totalQty, totalNet, totalGross, totalCbm, splitMode, unitSize, splitCount]);

  const handleApply = () => {
    if (previewRows.length === 0) return;
    onConfirm(previewRows);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(3px)'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        width: '100%',
        maxWidth: '680px',
        borderRadius: '4px',
        border: '1px solid #cbd5e1',
        boxShadow: '0 20px 40px rgba(15, 23, 42, 0.2)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh'
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          backgroundColor: '#fafafa',
          borderBottom: '1px solid #cbd5e1',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>✂️</span> 팔레트(PLT) 패키지 정밀 분할
            </h3>
            <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
              1PLT당 적재 중량/수량 및 나머지를 자동 계산하여 다수의 팔레트로 분할합니다.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '18px',
              color: '#64748b',
              cursor: 'pointer',
              padding: '4px 8px',
              fontWeight: 700
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* Target Item Info Box */}
          <div style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            <div>
              <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>
                분할 대상 품목
              </span>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#1e293b', marginTop: '2px' }}>
                {item.description || '품목'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '16px', textAlign: 'right' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b' }}>현재 총 수량</span>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#2563eb' }}>
                  {totalQty.toLocaleString()}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b' }}>NET WT</span>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                  {totalNet.toLocaleString()} Kg
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 750, color: '#64748b' }}>GROSS WT</span>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                  {totalGross.toLocaleString()} Kg
                </div>
              </div>
            </div>
          </div>

          {/* Mode Selector Tabs */}
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
              분할 방식 선택
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setSplitMode('by_unit')}
                style={{
                  flex: 1,
                  height: '38px',
                  borderRadius: '4px',
                  border: splitMode === 'by_unit' ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                  background: splitMode === 'by_unit' ? '#eff6ff' : '#ffffff',
                  color: splitMode === 'by_unit' ? '#1d4ed8' : '#475569',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>📦</span> 1 PLT당 기준 수량/중량 + 나머지 자동 계산
              </button>
              <button
                type="button"
                onClick={() => setSplitMode('by_count')}
                style={{
                  flex: 1,
                  height: '38px',
                  borderRadius: '4px',
                  border: splitMode === 'by_count' ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                  background: splitMode === 'by_count' ? '#eff6ff' : '#ffffff',
                  color: splitMode === 'by_count' ? '#1d4ed8' : '#475569',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <span>🔢</span> 분할할 Pallet(PKG) 개수로 균등 분할
              </button>
            </div>
          </div>

          {/* Input based on mode */}
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '16px'
          }}>
            {splitMode === 'by_unit' ? (
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                  1 PLT당 적재 수량/중량 입력 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number"
                    min="1"
                    max={totalQty}
                    value={unitSize}
                    onChange={e => setUnitSize(e.target.value)}
                    placeholder="예: 1000 (1PLT당 1,000개/KG씩 분할)"
                    style={{
                      flex: 1,
                      height: '36px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#1e293b',
                      padding: '0 10px',
                      outline: 'none'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[500, 1000, 1500].filter(v => v < totalQty).map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setUnitSize(String(val))}
                        style={{
                          height: '36px',
                          padding: '0 10px',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#475569',
                          cursor: 'pointer'
                        }}
                      >
                        {val.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
                  💡 <strong>{totalQty.toLocaleString()}</strong>를 1PLT당 <strong>{(parseFloat(unitSize) || 0).toLocaleString()}</strong>씩 나누면,{' '}
                  <span style={{ color: '#2563eb', fontWeight: 800 }}>
                    정량 {Math.floor(totalQty / (parseFloat(unitSize) || 1))}개 PLT
                  </span>
                  {totalQty % (parseFloat(unitSize) || 1) > 0 && (
                    <span style={{ color: '#d97706', fontWeight: 800 }}>
                      {' '}+ 잔여(나머지) {(totalQty % (parseFloat(unitSize) || 1)).toLocaleString()} (1개 PLT)
                    </span>
                  )}
                  {' '}➔ <strong>총 {previewRows.length}개 Pallet</strong>로 분할됩니다.
                </div>
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                  분할할 Pallet(PKG) 개수 입력 <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number"
                    min="2"
                    max="50"
                    value={splitCount}
                    onChange={e => setSplitCount(e.target.value)}
                    placeholder="예: 2, 3, 4..."
                    style={{
                      flex: 1,
                      height: '36px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#1e293b',
                      padding: '0 10px',
                      outline: 'none'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[2, 3, 4, 5].map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSplitCount(String(val))}
                        style={{
                          height: '36px',
                          padding: '0 12px',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#475569',
                          cursor: 'pointer'
                        }}
                      >
                        {val}개
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Preview Table */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>
                📋 분할 실행 미리보기 (총 {previewRows.length}개 행 생성)
              </span>
              <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 700 }}>
                ✓ 수량 합계: {previewRows.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0).toLocaleString()} (일치)
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #cbd5e1' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '6px', textAlign: 'center', width: '50px', color: '#475569', fontWeight: 750 }}>No</th>
                  <th style={{ padding: '6px', textAlign: 'left', color: '#475569', fontWeight: 750 }}>구분</th>
                  <th style={{ padding: '6px', textAlign: 'right', color: '#475569', fontWeight: 750 }}>수량</th>
                  <th style={{ padding: '6px', textAlign: 'right', color: '#475569', fontWeight: 750 }}>NET WT</th>
                  <th style={{ padding: '6px', textAlign: 'right', color: '#475569', fontWeight: 750 }}>GROSS WT</th>
                  <th style={{ padding: '6px', textAlign: 'right', color: '#475569', fontWeight: 750 }}>CBM</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, rIdx) => (
                  <tr
                    key={rIdx}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      background: r.isRemainder ? '#fffbeb' : (rIdx % 2 === 0 ? '#fff' : '#f8fafc')
                    }}
                  >
                    <td style={{ padding: '6px', textAlign: 'center', fontWeight: 700, color: '#64748b' }}>
                      {rIdx + 1}
                    </td>
                    <td style={{ padding: '6px', fontWeight: 700, color: r.isRemainder ? '#b45309' : '#1e293b' }}>
                      {r.isRemainder ? '⚠️ ' : '📦 '}{r.label || `PLT #${rIdx + 1}`}
                    </td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 800, color: '#2563eb' }}>
                      {parseFloat(r.qty).toLocaleString()}
                    </td>
                    <td style={{ padding: '6px', textAlign: 'right', color: '#475569' }}>
                      {parseFloat(r.netWeight).toLocaleString()} Kg
                    </td>
                    <td style={{ padding: '6px', textAlign: 'right', color: '#475569' }}>
                      {parseFloat(r.grossWeight).toLocaleString()} Kg
                    </td>
                    <td style={{ padding: '6px', textAlign: 'right', color: '#0284c7', fontWeight: 600 }}>
                      {r.cbm}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Buttons */}
        <div style={{
          padding: '12px 20px',
          backgroundColor: '#fafafa',
          borderTop: '1px solid #cbd5e1',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: '34px',
              padding: '0 16px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              color: '#475569',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={previewRows.length === 0}
            style={{
              height: '34px',
              padding: '0 20px',
              background: '#3b82f6',
              border: 'none',
              borderRadius: '4px',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '13px',
              cursor: previewRows.length > 0 ? 'pointer' : 'not-allowed',
              boxShadow: '0 2px 6px rgba(59, 130, 246, 0.3)'
            }}
          >
            ✓ {previewRows.length}개 Pallet로 분할 실행
          </button>
        </div>
      </div>
    </div>
  );
};
