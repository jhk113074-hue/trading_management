import React, { useState, useEffect, useMemo } from 'react';
import { subscribeCustomContainerTypes, handleContainerTypeSelection, DEFAULT_CONTAINER_TYPES } from '../utils/containerType';
import type { ProformaInvoice } from '../types/pi';

interface Props {
  formData: Partial<ProformaInvoice>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<ProformaInvoice>>>;
  updateFreightCharge: (index: number, field: 'type' | 'qty' | 'price' | 'remarks', value: any) => void;
  addFreightCharge: () => void;
  removeFreightCharge: (index: number) => void;
}

export const FreightCalculatorSection: React.FC<Props> = ({
  formData,
  setFormData,
  updateFreightCharge,
  addFreightCharge,
  removeFreightCharge
}) => {
  const [customContainerTypes, setCustomContainerTypes] = useState<string[]>([]);
  useEffect(() => {
    return subscribeCustomContainerTypes(setCustomContainerTypes);
  }, []);

  const combinedContainerTypes = useMemo(() => {
    return Array.from(new Set([...DEFAULT_CONTAINER_TYPES, ...customContainerTypes]));
  }, [customContainerTypes]);
  const calc = formData.freightCalculationDetails || {
    oceanCurrency: 'USD',
    oceanPriceRaw: formData.freightCharges?.[0]?.price || 0,
    oceanExchangeRate: formData.exchangeRate || 1400,
    oceanVarianceRate: 0,
    coFee: { amount: 0, currency: 'KRW' },
    customsFee: { amount: 0, currency: 'KRW' },
    purchaseCertFee: { amount: 0, currency: 'KRW' },
    inlandFreight: { amount: 0, currency: 'KRW' },
    roundUpType: 'none'
  };

  const currentExRate = Number(calc.oceanExchangeRate || formData.exchangeRate || 1400);
  const rawOcean = Number(calc.oceanPriceRaw || 0);
  const baseOceanUsd = calc.oceanCurrency === 'KRW' ? (currentExRate > 0 ? rawOcean / currentExRate : 0) : rawOcean;
  const variance = Number(calc.oceanVarianceRate || 0);
  const appliedOceanUsd = baseOceanUsd * (1 + variance / 100);

  const toUsd = (fee?: { amount: number; currency: 'KRW' | 'USD' }) => {
    if (!fee || !fee.amount) return 0;
    if (fee.currency === 'USD') return Number(fee.amount);
    return currentExRate > 0 ? Number(fee.amount) / currentExRate : 0;
  };

  const coUsd = toUsd(calc.coFee);
  const customsUsd = toUsd(calc.customsFee);
  const purchaseCertUsd = toUsd(calc.purchaseCertFee);
  const inlandUsd = toUsd(calc.inlandFreight);
  
  const rawTotalCalculated = appliedOceanUsd + coUsd + customsUsd + purchaseCertUsd + inlandUsd;
  
  let finalCalculated = parseFloat(rawTotalCalculated.toFixed(2));
  const activeRoundType = calc.roundUpType || 'none';
  if (activeRoundType === 'ceil_1') {
    finalCalculated = Math.ceil(finalCalculated);
  } else if (activeRoundType === 'ceil_5') {
    finalCalculated = Math.ceil(finalCalculated / 5) * 5;
  } else if (activeRoundType === 'ceil_10') {
    finalCalculated = Math.ceil(finalCalculated / 10) * 10;
  }

  const updateFreightCalculation = (updates: any) => {
    setFormData(prev => {
      const prevDetails = prev.freightCalculationDetails || {
        oceanCurrency: 'USD',
        oceanPriceRaw: prev.freightCharges?.[0]?.price || 0,
        oceanExchangeRate: prev.exchangeRate || 1400,
        oceanVarianceRate: 0,
        coFee: { amount: 0, currency: 'KRW' },
        customsFee: { amount: 0, currency: 'KRW' },
        purchaseCertFee: { amount: 0, currency: 'KRW' },
        inlandFreight: { amount: 0, currency: 'KRW' },
        roundUpType: 'none'
      };

      const newDetails = { ...prevDetails, ...updates };
      const exRate = Number(newDetails.oceanExchangeRate || prev.exchangeRate || 1400);

      const rPrice = Number(newDetails.oceanPriceRaw || 0);
      const bOceanUsd = newDetails.oceanCurrency === 'KRW'
        ? (exRate > 0 ? rPrice / exRate : 0)
        : rPrice;

      const vRate = Number(newDetails.oceanVarianceRate || 0);
      const appOceanUsd = bOceanUsd * (1 + vRate / 100);

      const toUsdHelper = (fee?: { amount: number; currency: 'KRW' | 'USD' }) => {
        if (!fee || !fee.amount) return 0;
        if (fee.currency === 'USD') return Number(fee.amount);
        return exRate > 0 ? Number(fee.amount) / exRate : 0;
      };

      const cUsd = toUsdHelper(newDetails.coFee);
      const custUsd = toUsdHelper(newDetails.customsFee);
      const pCertUsd = toUsdHelper(newDetails.purchaseCertFee);
      const inlUsd = toUsdHelper(newDetails.inlandFreight);

      let totalCalcUsd = parseFloat((appOceanUsd + cUsd + custUsd + pCertUsd + inlUsd).toFixed(2));
      
      const rType = newDetails.roundUpType || 'none';
      if (rType === 'ceil_1') {
        totalCalcUsd = Math.ceil(totalCalcUsd);
      } else if (rType === 'ceil_5') {
        totalCalcUsd = Math.ceil(totalCalcUsd / 5) * 5;
      } else if (rType === 'ceil_10') {
        totalCalcUsd = Math.ceil(totalCalcUsd / 10) * 10;
      }

      let currentCharges = [...(prev.freightCharges || [])];
      if (currentCharges.length === 0) {
        currentCharges = [{ type: 'LCL', qty: 1, price: totalCalcUsd, remarks: '', name: 'LCL', amount: totalCalcUsd }];
      } else {
        currentCharges[0] = {
          ...currentCharges[0],
          price: totalCalcUsd,
          amount: (currentCharges[0].qty || 1) * totalCalcUsd
        };
      }

      return {
        ...prev,
        freightCalculationDetails: newDetails,
        freightCharges: currentCharges
      };
    });
  };

  const generateFreightRemarks = () => {
    const details = formData.freightCalculationDetails;
    if (!details) return;
    const parts: string[] = [];

    const rPrice = Number(details.oceanPriceRaw || 0);
    if (rPrice > 0) {
      const currSym = details.oceanCurrency === 'KRW' ? '₩' : '$';
      const varStr = (details.oceanVarianceRate || 0) !== 0 ? ` (변동률 ${(details.oceanVarianceRate || 0) > 0 ? '+' : ''}${details.oceanVarianceRate}%)` : '';
      parts.push(`해상운임: ${currSym}${rPrice.toLocaleString()}${varStr}`);
    }
    if (details.coFee?.amount) parts.push(`원산지: ${details.coFee.currency === 'USD' ? '$' : '₩'}${Number(details.coFee.amount).toLocaleString()}`);
    if (details.customsFee?.amount) parts.push(`수출신고: ${details.customsFee.currency === 'USD' ? '$' : '₩'}${Number(details.customsFee.amount).toLocaleString()}`);
    if (details.purchaseCertFee?.amount) parts.push(`구매확인서: ${details.purchaseCertFee.currency === 'USD' ? '$' : '₩'}${Number(details.purchaseCertFee.amount).toLocaleString()}`);
    if (details.inlandFreight?.amount) parts.push(`내륙운송: ${details.inlandFreight.currency === 'USD' ? '$' : '₩'}${Number(details.inlandFreight.amount).toLocaleString()}`);

    const summary = parts.join(' / ');
    if (summary) {
      updateFreightCharge(0, 'remarks', summary);
    }
  };

  return (
    <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '10px', background: '#fff', border: '1px solid #cbd5e1', padding: '14px 18px', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #e2e8f0', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e3a8a', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            🚢 FREIGHT CHARGES & LOGISTICS CALCULATOR
          </span>
          <span style={{ fontSize: '11px', fontWeight: 750, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '4px' }}>
            정밀 운송비 산출기
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            type="button" 
            onClick={generateFreightRemarks} 
            style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px', fontWeight: 750, color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}
            title="해상운임 및 4종 부대비용 입력 내역을 비고란에 자동으로 요약 기재합니다."
          >
            📝 비고 자동생성
          </button>
          <button 
            type="button" 
            onClick={addFreightCharge} 
            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#475569' }}
          >
            ＋ 추가 운송행
          </button>
        </div>
      </div>

      {/* 1. 기본 해상운임 섹션 */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>🌊 1. 기본 해상운임 (Ocean Freight & Variance)</span>
          <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 800 }}>
            적용 해상운임: ${appliedOceanUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.6fr 0.8fr 1.2fr 1fr 0.8fr', gap: '8px', alignItems: 'center' }}>
          {/* Container Type */}
          <div>
            <label style={{ fontSize: '10.5px', fontWeight: 750, color: '#64748b', display: 'block', marginBottom: '2px' }}>컨테이너 타입</label>
            <select
              value={formData.freightCharges?.[0]?.type || 'LCL'}
              onChange={e => {
                const selectedVal = e.target.value;
                const currentVal = formData.freightCharges?.[0]?.type || 'LCL';
                handleContainerTypeSelection(selectedVal, currentVal, customContainerTypes, (newType) => {
                  if (formData.freightCharges && formData.freightCharges.length > 0) {
                    updateFreightCharge(0, 'type', newType);
                  } else {
                    addFreightCharge();
                    updateFreightCharge(0, 'type', newType);
                  }
                });
              }}
              style={{ width: '100%', height: '34px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, background: '#fff', outline: 'none' }}
            >
              {combinedContainerTypes.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
              <option value="ADD_NEW_CONTAINER_TYPE" style={{ color: '#2563eb', fontWeight: 'bold' }}>
                ➕ 신규 타입 직접 추가...
              </option>
            </select>
          </div>

          {/* Qty */}
          <div>
            <label style={{ fontSize: '10.5px', fontWeight: 750, color: '#64748b', display: 'block', marginBottom: '2px' }}>수량</label>
            <input
              type="number"
              value={formData.freightCharges?.[0]?.qty ?? 1}
              onChange={e => updateFreightCharge(0, 'qty', parseFloat(e.target.value) || 1)}
              style={{ width: '100%', height: '34px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Currency */}
          <div>
            <label style={{ fontSize: '10.5px', fontWeight: 750, color: '#64748b', display: 'block', marginBottom: '2px' }}>운임 통화</label>
            <select
              value={calc.oceanCurrency || 'USD'}
              onChange={e => updateFreightCalculation({ oceanCurrency: e.target.value as 'USD' | 'KRW' })}
              style={{ width: '100%', height: '34px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 700, background: calc.oceanCurrency === 'KRW' ? '#f0fdf4' : '#eff6ff', color: calc.oceanCurrency === 'KRW' ? '#166534' : '#1d4ed8', outline: 'none' }}
            >
              <option value="USD">USD ($)</option>
              <option value="KRW">KRW (₩)</option>
            </select>
          </div>

          {/* Raw Ocean Price */}
          <div>
            <label style={{ fontSize: '10.5px', fontWeight: 750, color: '#64748b', display: 'block', marginBottom: '2px' }}>
              해상운임 단가 ({calc.oceanCurrency || 'USD'})
            </label>
            <input
              type="number"
              step={calc.oceanCurrency === 'KRW' ? '1000' : '0.01'}
              value={calc.oceanPriceRaw || ''}
              onChange={e => updateFreightCalculation({ oceanPriceRaw: parseFloat(e.target.value) || 0 })}
              placeholder={calc.oceanCurrency === 'KRW' ? '예: 1,400,000' : '예: 1,000.00'}
              style={{ width: '100%', height: '34px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 700, textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Exchange Rate */}
          <div>
            <label style={{ fontSize: '10.5px', fontWeight: 750, color: '#64748b', display: 'block', marginBottom: '2px' }}>적용 기준환율 (₩/$)</label>
            <input
              type="number"
              step="0.1"
              value={calc.oceanExchangeRate || formData.exchangeRate || 1400}
              onChange={e => updateFreightCalculation({ oceanExchangeRate: parseFloat(e.target.value) || 1400 })}
              style={{ width: '100%', height: '34px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Variance Rate % */}
          <div>
            <label style={{ fontSize: '10.5px', fontWeight: 750, color: '#64748b', display: 'block', marginBottom: '2px' }}>변동률 (%)</label>
            <input
              type="number"
              step="1"
              value={calc.oceanVarianceRate || ''}
              onChange={e => updateFreightCalculation({ oceanVarianceRate: parseFloat(e.target.value) || 0 })}
              placeholder="예: 10"
              style={{ width: '100%', height: '34px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 700, color: (calc.oceanVarianceRate || 0) > 0 ? '#16a34a' : (calc.oceanVarianceRate || 0) < 0 ? '#dc2626' : '#1e293b', textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      </div>

      {/* 2. 4종 부대비용 그리드 */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>📑 2. 4종 부대비용 세부 분리 입력 (Incidental Logistics Costs)</span>
          <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
            부대비용 소계: ${(coUsd + customsUsd + purchaseCertUsd + inlandUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {/* 1. C/O Fee */}
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>📜 원산지증명서</span>
              <span style={{ fontSize: '10.5px', color: '#2563eb', fontWeight: 700 }}>${coUsd.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <select
                value={calc.coFee?.currency || 'KRW'}
                onChange={e => updateFreightCalculation({ coFee: { amount: calc.coFee?.amount || 0, currency: e.target.value as any } })}
                style={{ width: '65px', height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11.5px', fontWeight: 700 }}
              >
                <option value="KRW">₩ KRW</option>
                <option value="USD">$ USD</option>
              </select>
              <input
                type="number"
                value={calc.coFee?.amount || ''}
                onChange={e => updateFreightCalculation({ coFee: { amount: parseFloat(e.target.value) || 0, currency: calc.coFee?.currency || 'KRW' } })}
                placeholder="0"
                style={{ flex: 1, height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '12px', fontWeight: 600, textAlign: 'right', padding: '0 6px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* 2. Customs Fee */}
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>📑 수출신고비</span>
              <span style={{ fontSize: '10.5px', color: '#2563eb', fontWeight: 700 }}>${customsUsd.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <select
                value={calc.customsFee?.currency || 'KRW'}
                onChange={e => updateFreightCalculation({ customsFee: { amount: calc.customsFee?.amount || 0, currency: e.target.value as any } })}
                style={{ width: '65px', height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11.5px', fontWeight: 700 }}
              >
                <option value="KRW">₩ KRW</option>
                <option value="USD">$ USD</option>
              </select>
              <input
                type="number"
                value={calc.customsFee?.amount || ''}
                onChange={e => updateFreightCalculation({ customsFee: { amount: parseFloat(e.target.value) || 0, currency: calc.customsFee?.currency || 'KRW' } })}
                placeholder="0"
                style={{ flex: 1, height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '12px', fontWeight: 600, textAlign: 'right', padding: '0 6px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* 3. Purchase Cert Fee */}
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>📋 구매확인서</span>
              <span style={{ fontSize: '10.5px', color: '#2563eb', fontWeight: 700 }}>${purchaseCertUsd.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <select
                value={calc.purchaseCertFee?.currency || 'KRW'}
                onChange={e => updateFreightCalculation({ purchaseCertFee: { amount: calc.purchaseCertFee?.amount || 0, currency: e.target.value as any } })}
                style={{ width: '65px', height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11.5px', fontWeight: 700 }}
              >
                <option value="KRW">₩ KRW</option>
                <option value="USD">$ USD</option>
              </select>
              <input
                type="number"
                value={calc.purchaseCertFee?.amount || ''}
                onChange={e => updateFreightCalculation({ purchaseCertFee: { amount: parseFloat(e.target.value) || 0, currency: calc.purchaseCertFee?.currency || 'KRW' } })}
                placeholder="0"
                style={{ flex: 1, height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '12px', fontWeight: 600, textAlign: 'right', padding: '0 6px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* 4. Inland Freight */}
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>🚚 내륙운송비</span>
              <span style={{ fontSize: '10.5px', color: '#2563eb', fontWeight: 700 }}>${inlandUsd.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <select
                value={calc.inlandFreight?.currency || 'KRW'}
                onChange={e => updateFreightCalculation({ inlandFreight: { amount: calc.inlandFreight?.amount || 0, currency: e.target.value as any } })}
                style={{ width: '65px', height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11.5px', fontWeight: 700 }}
              >
                <option value="KRW">₩ KRW</option>
                <option value="USD">$ USD</option>
              </select>
              <input
                type="number"
                value={calc.inlandFreight?.amount || ''}
                onChange={e => updateFreightCalculation({ inlandFreight: { amount: parseFloat(e.target.value) || 0, currency: calc.inlandFreight?.currency || 'KRW' } })}
                placeholder="0"
                style={{ flex: 1, height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '12px', fontWeight: 600, textAlign: 'right', padding: '0 6px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. 비고란 및 추가 운송 항목 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', width: '90px' }}>비고 (Remarks):</span>
          <textarea
            placeholder="비고란 (비고 자동생성 버튼 클릭 시 세부 항목이 자동 입력됩니다)"
            value={formData.freightCharges?.[0]?.remarks || ''}
            onChange={e => updateFreightCharge(0, 'remarks', e.target.value)}
            rows={1}
            style={{ flex: 1, minHeight: '34px', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Extra Freight Rows if any (Index >= 1) */}
        {(formData.freightCharges || []).slice(1).map((fc, idx) => {
          const actualIdx = idx + 1;
          return (
            <div key={actualIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#fdf2f8', padding: '6px 8px', borderRadius: '4px', border: '1px dashed #f472b6' }}>
              <input
                type="text"
                placeholder="추가 운송 항목명"
                value={fc.type || ''}
                onChange={e => updateFreightCharge(actualIdx, 'type', e.target.value)}
                style={{ width: '130px', height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '12px' }}
              />
              <input
                type="number"
                placeholder="수량"
                value={fc.qty ?? 1}
                onChange={e => updateFreightCharge(actualIdx, 'qty', parseFloat(e.target.value) || 1)}
                style={{ width: '60px', height: '30px', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '12px', textAlign: 'right' }}
              />
              <input
                type="number"
                step="0.01"
                placeholder="금액 (USD)"
                value={fc.price ?? 0}
                onChange={e => updateFreightCharge(actualIdx, 'price', parseFloat(e.target.value) || 0)}
                style={{ width: '100px', height: '30px', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '12px', textAlign: 'right' }}
              />
              <textarea
                placeholder="비고"
                value={fc.remarks || ''}
                onChange={e => updateFreightCharge(actualIdx, 'remarks', e.target.value)}
                rows={1}
                style={{ flex: 1, minHeight: '30px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '12px' }}
              />
              <button type="button" onClick={() => removeFreightCharge(actualIdx)} style={{ background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '3px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>✕</button>
            </div>
          );
        })}
      </div>

      {/* 4. Final Decided Total Freight Badge with Round Up Feature */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: '6px', padding: '10px 14px', marginTop: '2px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>
              🎯 최종 결정 운송비 (Final Total Freight)
            </span>
            <span style={{ fontSize: '11.5px', color: '#3b82f6', fontWeight: 600 }}>
              (해상운임 ${appliedOceanUsd.toFixed(2)} + 4종 부대비용 ${(coUsd + customsUsd + purchaseCertUsd + inlandUsd).toFixed(2)})
            </span>
          </div>
          {activeRoundType !== 'none' && (
            <div style={{ fontSize: '11px', color: '#166534', fontWeight: 700 }}>
              💡 원금액 ${rawTotalCalculated.toFixed(2)} ➔ 올림 적용: ${finalCalculated.toFixed(2)}
            </div>
          )}
        </div>

        {/* Round Up Selector & Final Amount */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 750, color: '#475569' }}>소수점 처리:</span>
            <select
              value={calc.roundUpType || 'none'}
              onChange={e => updateFreightCalculation({ roundUpType: e.target.value as any })}
              style={{
                height: '32px',
                padding: '0 8px',
                border: activeRoundType !== 'none' ? '1.5px solid #2563eb' : '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                background: activeRoundType !== 'none' ? '#dbeafe' : '#fff',
                color: activeRoundType !== 'none' ? '#1d4ed8' : '#334155',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="none">소수점 유지 (그대로: ${rawTotalCalculated.toFixed(2)})</option>
              <option value="ceil_1">🔼 1달러 정수 올림 (${Math.ceil(rawTotalCalculated).toFixed(2)})</option>
              <option value="ceil_5">🔼 5달러 단위 올림 (${(Math.ceil(rawTotalCalculated / 5) * 5).toFixed(2)})</option>
              <option value="ceil_10">🔼 10달러 단위 올림 (${(Math.ceil(rawTotalCalculated / 10) * 10).toFixed(2)})</option>
            </select>
          </div>

          <div style={{ fontSize: '18px', fontWeight: 900, color: '#1d4ed8', minWidth: '100px', textAlign: 'right' }}>
            ${(formData.freightTotal || finalCalculated || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
};
