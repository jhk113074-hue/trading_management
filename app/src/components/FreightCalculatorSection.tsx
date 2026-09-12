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

const FormattedNumberInput: React.FC<{
  value: number;
  onChange: (val: number) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  isInteger?: boolean;
}> = ({ value, onChange, placeholder, style, isInteger }) => {
  const [localStr, setLocalStr] = useState('');

  useEffect(() => {
    const parsed = parseFloat(localStr.replace(/,/g, '')) || 0;
    if (parsed !== value || (value === 0 && localStr !== '')) {
      if (value === 0) {
        setLocalStr('');
      } else {
        const parts = value.toString().split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        setLocalStr(parts.join('.'));
      }
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/,/g, '').trim();
    if (raw === '') {
      setLocalStr('');
      onChange(0);
      return;
    }

    if (isInteger) {
      if (/^\d*$/.test(raw)) {
        const formatted = raw.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        setLocalStr(formatted);
        onChange(parseInt(raw, 10) || 0);
      }
    } else {
      if (/^\d*\.?\d*$/.test(raw)) {
        const parts = raw.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        setLocalStr(parts.join('.'));
        onChange(parseFloat(raw) || 0);
      }
    }
  };

  const handleBlur = () => {
    if (value === 0) {
      setLocalStr('');
    } else {
      const parts = value.toString().split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      setLocalStr(parts.join('.'));
    }
  };

  return (
    <input
      type="text"
      value={localStr}
      placeholder={placeholder}
      onChange={handleChange}
      onBlur={handleBlur}
      style={style}
    />
  );
};

export const FreightCalculatorSection: React.FC<Props> = ({
  formData,
  setFormData
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
    containers: [{
      type: formData.freightCharges?.[0]?.type || '20GP',
      qty: formData.freightCharges?.[0]?.qty ?? 1,
      oceanPriceRaw: formData.freightCharges?.[0]?.price || 0,
      remarks: formData.freightCharges?.[0]?.remarks || '기본 해상운임'
    }],
    extraCharges: [],
    freightRemarks: '',
    coFee: { amount: 0, currency: 'KRW' },
    customsFee: { amount: 0, currency: 'KRW' },
    purchaseCertFee: { amount: 0, currency: 'KRW' },
    inlandFreight: { amount: 0, currency: 'KRW' },
    otherFee: { amount: 0, currency: 'KRW' },
    roundUpType: 'none'
  };

  // Derive active containers (backward compatibility with legacy oceanPriceRaw)
  const containers: Array<{ type: string; qty: number; oceanPriceRaw: number; remarks: string }> = useMemo(() => {
    if (calc.containers && calc.containers.length > 0) {
      return calc.containers.map((c, idx) => ({
        type: c.type || '20GP',
        qty: c.qty ?? 1,
        oceanPriceRaw: c.oceanPriceRaw || 0,
        remarks: c.remarks !== undefined ? c.remarks : (formData.freightCharges?.[idx]?.remarks || '기본 해상운임')
      }));
    }
    const legacyType = formData.freightCharges?.[0]?.type || '20GP';
    const legacyQty = formData.freightCharges?.[0]?.qty ?? 1;
    const legacyPrice = calc.oceanPriceRaw || formData.freightCharges?.[0]?.price || 0;
    const legacyRemarks = formData.freightCharges?.[0]?.remarks || '기본 해상운임';
    return [{ type: legacyType, qty: legacyQty, oceanPriceRaw: legacyPrice, remarks: legacyRemarks }];
  }, [calc.containers, calc.oceanPriceRaw, formData.freightCharges]);

  // Derive active extra charges
  const extraCharges: Array<{ type: string; qty: number; price: number; remarks: string }> = useMemo(() => {
    if (calc.extraCharges !== undefined) {
      return calc.extraCharges;
    }
    const list = formData.freightCharges || [];
    const containerCount = calc.containers?.length || 1;
    const candidates = list.slice(containerCount);
    return candidates
      .filter(fc => !fc.type?.includes('부대비용') && !fc.type?.includes('Incidental'))
      .map(fc => ({
        type: fc.type || '',
        qty: fc.qty ?? 1,
        price: fc.price ?? 0,
        remarks: fc.remarks || ''
      }));
  }, [calc.extraCharges, calc.containers, formData.freightCharges]);

  const currentExRate = Number(calc.oceanExchangeRate || formData.exchangeRate || 1400);
  const variance = Number(calc.oceanVarianceRate || 0);

  // Compute total ocean freight in USD
  const appliedOceanTotalUsd = useMemo(() => {
    return containers.reduce((acc, c) => {
      const rawPrice = Number(c.oceanPriceRaw || 0);
      const baseUnitUsd = calc.oceanCurrency === 'KRW'
        ? (currentExRate > 0 ? rawPrice / currentExRate : 0)
        : rawPrice;
      const appliedUnitUsd = parseFloat((baseUnitUsd * (1 + variance / 100)).toFixed(2));
      const lineQty = Number(c.qty || 1);
      return acc + parseFloat((lineQty * appliedUnitUsd).toFixed(2));
    }, 0);
  }, [containers, calc.oceanCurrency, currentExRate, variance]);

  const toUsd = (fee?: { amount: number; currency: 'KRW' | 'USD' }) => {
    if (!fee || !fee.amount) return 0;
    if (fee.currency === 'USD') return Number(fee.amount);
    return currentExRate > 0 ? Number(fee.amount) / currentExRate : 0;
  };

  const coUsd = toUsd(calc.coFee);
  const customsUsd = toUsd(calc.customsFee);
  const purchaseCertUsd = toUsd(calc.purchaseCertFee);
  const inlandUsd = toUsd(calc.inlandFreight);
  const otherUsd = toUsd(calc.otherFee);
  const incidentalTotalUsd = coUsd + customsUsd + purchaseCertUsd + inlandUsd + otherUsd;

  const extraTotalUsd = useMemo(() => {
    return extraCharges.reduce((acc, ex) => {
      return acc + (Number(ex.qty ?? 1) * Number(ex.price || 0));
    }, 0);
  }, [extraCharges]);

  const excelRoundup = (value: number, digits: number): number => {
    if (value === 0) return 0;
    const epsilon = 1e-9;
    const sign = value > 0 ? 1 : -1;
    const absValue = Math.abs(value);
    if (digits < 0) {
      const scale = Math.pow(10, Math.abs(digits));
      return sign * Math.ceil((absValue / scale) - epsilon) * scale;
    }
    const factor = Math.pow(10, digits);
    return sign * Math.ceil((absValue * factor) - epsilon) / factor;
  };

  const rawTotalCalculated = appliedOceanTotalUsd + incidentalTotalUsd + extraTotalUsd;

  let finalCalculated = parseFloat(rawTotalCalculated.toFixed(2));
  const activeRoundType = calc.roundUpType || 'none';
  if (activeRoundType === 'ceil_1' || activeRoundType === '0') {
    finalCalculated = excelRoundup(rawTotalCalculated, 0);
  } else if (activeRoundType === '1') {
    finalCalculated = excelRoundup(rawTotalCalculated, 1);
  } else if (activeRoundType === '2') {
    finalCalculated = excelRoundup(rawTotalCalculated, 2);
  } else if (activeRoundType === '-1') {
    finalCalculated = excelRoundup(rawTotalCalculated, -1);
  } else if (activeRoundType === '-2') {
    finalCalculated = excelRoundup(rawTotalCalculated, -2);
  } else if (activeRoundType === '-3') {
    finalCalculated = excelRoundup(rawTotalCalculated, -3);
  } else if (activeRoundType === 'ceil_5') {
    finalCalculated = Math.ceil(finalCalculated / 5) * 5;
  } else if (activeRoundType === 'ceil_10') {
    finalCalculated = Math.ceil(finalCalculated / 10) * 10;
  }

  // Unified updater for freightCalculationDetails & formData.freightCharges
  const updateFreightCalculation = (updates: any) => {
    setFormData(prev => {
      const prevDetails = prev.freightCalculationDetails || {
        oceanCurrency: 'USD',
        oceanPriceRaw: prev.freightCharges?.[0]?.price || 0,
        oceanExchangeRate: prev.exchangeRate || 1400,
        oceanVarianceRate: 0,
        containers: [{
          type: prev.freightCharges?.[0]?.type || '20GP',
          qty: prev.freightCharges?.[0]?.qty ?? 1,
          oceanPriceRaw: prev.freightCharges?.[0]?.price || 0,
          remarks: prev.freightCharges?.[0]?.remarks || '기본 해상운임'
        }],
        extraCharges: [],
        freightRemarks: '',
        coFee: { amount: 0, currency: 'KRW' },
        customsFee: { amount: 0, currency: 'KRW' },
        purchaseCertFee: { amount: 0, currency: 'KRW' },
        inlandFreight: { amount: 0, currency: 'KRW' },
        otherFee: { amount: 0, currency: 'KRW' },
        roundUpType: 'none'
      };

      const newDetails = { ...prevDetails, ...updates };
      const exRate = Number(newDetails.oceanExchangeRate || prev.exchangeRate || 1400);
      const vRate = Number(newDetails.oceanVarianceRate || 0);

      // 1. Containers list
      const curContainers = (newDetails.containers && newDetails.containers.length > 0)
        ? newDetails.containers
        : [{
            type: prev.freightCharges?.[0]?.type || '20GP',
            qty: prev.freightCharges?.[0]?.qty ?? 1,
            oceanPriceRaw: Number(newDetails.oceanPriceRaw || prev.freightCharges?.[0]?.price || 0),
            remarks: prev.freightCharges?.[0]?.remarks || '기본 해상운임'
          }];

      let oceanTotalUsd = 0;
      const containerRows = curContainers.map((c: any, cIdx: number) => {
        const rawPrice = Number(c.oceanPriceRaw || 0);
        const baseUnitUsd = newDetails.oceanCurrency === 'KRW'
          ? (exRate > 0 ? rawPrice / exRate : 0)
          : rawPrice;
        const appliedUnitUsd = parseFloat((baseUnitUsd * (1 + vRate / 100)).toFixed(2));
        const lineQty = Number(c.qty || 1);
        const lineTotalUsd = parseFloat((lineQty * appliedUnitUsd).toFixed(2));
        oceanTotalUsd += lineTotalUsd;

        const rowRemarks = (c.remarks !== undefined && c.remarks !== null)
          ? c.remarks
          : (prev.freightCharges?.[cIdx]?.remarks || '기본 해상운임');

        return {
          type: c.type || '20GP',
          qty: lineQty,
          price: appliedUnitUsd,
          amount: lineTotalUsd,
          remarks: rowRemarks,
          name: c.type || '20GP'
        };
      });

      // Synchronize backward-compatible oceanPriceRaw to first container
      newDetails.oceanPriceRaw = curContainers[0]?.oceanPriceRaw || 0;
      newDetails.containers = curContainers.map((c: any, i: number) => ({
        type: c.type || '20GP',
        qty: Number(c.qty || 1),
        oceanPriceRaw: Number(c.oceanPriceRaw || 0),
        remarks: containerRows[i]?.remarks ?? '기본 해상운임'
      }));

      // 2. Incidental fees in USD
      const toUsdHelper = (fee?: { amount: number; currency: 'KRW' | 'USD' }) => {
        if (!fee || !fee.amount) return 0;
        if (fee.currency === 'USD') return Number(fee.amount);
        return exRate > 0 ? Number(fee.amount) / exRate : 0;
      };

      const cUsd = toUsdHelper(newDetails.coFee);
      const custUsd = toUsdHelper(newDetails.customsFee);
      const pCertUsd = toUsdHelper(newDetails.purchaseCertFee);
      const inlUsd = toUsdHelper(newDetails.inlandFreight);
      const othUsd = toUsdHelper(newDetails.otherFee);
      const rawIncidentalUsd = parseFloat((cUsd + custUsd + pCertUsd + inlUsd + othUsd).toFixed(2));

      // 3. Extra charges
      const curExtras = newDetails.extraCharges || [];
      let extraTotalUsd = 0;
      const extraRows = curExtras.map((ex: any) => {
        const exQty = Number(ex.qty ?? 1);
        const exPrice = Number(ex.price || 0);
        const exAmt = parseFloat((exQty * exPrice).toFixed(2));
        extraTotalUsd += exAmt;
        return {
          type: ex.type || '추가 운송',
          qty: exQty,
          price: exPrice,
          amount: exAmt,
          remarks: ex.remarks || '',
          name: ex.type || '추가 운송'
        };
      });

      // 4. Roundup on subtotal (Ocean + Incidental + Extras)
      const rawSubtotal = oceanTotalUsd + rawIncidentalUsd + extraTotalUsd;
      let finalWithRoundup = parseFloat(rawSubtotal.toFixed(2));
      const rType = newDetails.roundUpType || 'none';
      if (rType === 'ceil_1' || rType === '0') {
        finalWithRoundup = excelRoundup(rawSubtotal, 0);
      } else if (rType === '1') {
        finalWithRoundup = excelRoundup(rawSubtotal, 1);
      } else if (rType === '2') {
        finalWithRoundup = excelRoundup(rawSubtotal, 2);
      } else if (rType === '-1') {
        finalWithRoundup = excelRoundup(rawSubtotal, -1);
      } else if (rType === '-2') {
        finalWithRoundup = excelRoundup(rawSubtotal, -2);
      } else if (rType === '-3') {
        finalWithRoundup = excelRoundup(rawSubtotal, -3);
      } else if (rType === 'ceil_5') {
        finalWithRoundup = Math.ceil(finalWithRoundup / 5) * 5;
      } else if (rType === 'ceil_10') {
        finalWithRoundup = Math.ceil(finalWithRoundup / 10) * 10;
      }

      const roundupDiff = parseFloat((finalWithRoundup - rawSubtotal).toFixed(2));

      // 5. Construct freightCharges list
      const finalFreightCharges: any[] = [...containerRows];

      if (rawIncidentalUsd > 0 || roundupDiff !== 0) {
        const adjustedIncidentalUsd = parseFloat(Math.max(0, rawIncidentalUsd + roundupDiff).toFixed(2));
        finalFreightCharges.push({
          type: '부대비용 (Incidental Charges)',
          qty: 1,
          price: adjustedIncidentalUsd,
          amount: adjustedIncidentalUsd,
          remarks: newDetails.freightRemarks || '수출신고/내륙운송 등 세부 부대비용',
          name: '부대비용 (Incidental Charges)'
        });
      }

      // Append extra charges
      finalFreightCharges.push(...extraRows);

      return {
        ...prev,
        freightCalculationDetails: newDetails,
        freightCharges: finalFreightCharges,
        freightTotal: finalWithRoundup
      };
    });
  };

  // Container handlers
  const handleAddContainer = () => {
    const nextContainers = [
      ...containers,
      { type: '40HQ', qty: 1, oceanPriceRaw: 0, remarks: '기본 해상운임' }
    ];
    updateFreightCalculation({ containers: nextContainers });
  };

  const handleUpdateContainer = (idx: number, field: 'type' | 'qty' | 'oceanPriceRaw' | 'remarks', value: any) => {
    const nextContainers = [...containers];
    nextContainers[idx] = { ...nextContainers[idx], [field]: value };
    updateFreightCalculation({ containers: nextContainers });
  };

  const handleRemoveContainer = (idx: number) => {
    if (containers.length <= 1) return;
    const nextContainers = containers.filter((_, i) => i !== idx);
    updateFreightCalculation({ containers: nextContainers });
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
      </div>

      {/* 1. 기본 해상운임 섹션 (복수 컨테이너 행 지원) */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px' }}>
        {/* Header & Global Settings Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e3a8a', textTransform: 'uppercase' }}>
              🌊 1. 기본 해상운임 (Ocean Freight & Variance)
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', background: '#dbeafe', padding: '2px 8px', borderRadius: '4px' }}>
              적용 해상운임 총액: ${appliedOceanTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Section 1 Common Controls: Currency, ExRate, Variance, Add Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* 운임 통화 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <label style={{ fontSize: '10.5px', fontWeight: 750, color: '#64748b' }}>통화:</label>
              <select
                value={calc.oceanCurrency || 'USD'}
                onChange={e => updateFreightCalculation({ oceanCurrency: e.target.value as 'USD' | 'KRW' })}
                style={{ height: '30px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 700, background: calc.oceanCurrency === 'KRW' ? '#f0fdf4' : '#eff6ff', color: calc.oceanCurrency === 'KRW' ? '#166534' : '#1d4ed8', outline: 'none' }}
              >
                <option value="USD">USD ($)</option>
                <option value="KRW">KRW (₩)</option>
              </select>
            </div>

            {/* 적용 기준환율 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <label style={{ fontSize: '10.5px', fontWeight: 750, color: '#64748b' }}>기준환율:</label>
              <FormattedNumberInput
                value={calc.oceanExchangeRate || formData.exchangeRate || 1400}
                isInteger={false}
                placeholder="1,400"
                onChange={val => updateFreightCalculation({ oceanExchangeRate: val || 1400 })}
                style={{ width: '80px', height: '30px', padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 600, textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* 변동률 % */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <label style={{ fontSize: '10.5px', fontWeight: 750, color: '#64748b' }}>변동률:</label>
              <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                <input
                  type="number"
                  step="1"
                  value={calc.oceanVarianceRate || ''}
                  onChange={e => updateFreightCalculation({ oceanVarianceRate: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                  style={{ width: '55px', height: '30px', padding: '0 4px', border: '1px solid #cbd5e1', borderRadius: '4px 0 0 4px', fontSize: '12px', fontWeight: 700, color: (calc.oceanVarianceRate || 0) > 0 ? '#16a34a' : (calc.oceanVarianceRate || 0) < 0 ? '#dc2626' : '#1e293b', textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}
                />
                <span style={{ height: '30px', display: 'flex', alignItems: 'center', background: '#f1f5f9', border: '1px solid #cbd5e1', borderLeft: 'none', borderRadius: '0 4px 4px 0', padding: '0 5px', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>%</span>
              </div>
            </div>

            {/* 컨테이너 규격 추가 버튼 */}
            <button
              type="button"
              onClick={handleAddContainer}
              style={{ height: '30px', background: '#2563eb', color: '#fff', border: 'none', padding: '0 10px', borderRadius: '4px', fontSize: '11.5px', fontWeight: 750, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(37,99,235,0.2)' }}
            >
              ➕ 컨테이너 규격 추가
            </button>
          </div>
        </div>

        {/* Container Rows List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {containers.map((c, idx) => {
            const rawP = Number(c.oceanPriceRaw || 0);
            const unitUsd = (calc.oceanCurrency === 'KRW' ? (currentExRate > 0 ? rawP / currentExRate : 0) : rawP);
            const appliedUnitUsd = unitUsd * (1 + (calc.oceanVarianceRate || 0) / 100);
            const lineTotalUsd = (c.qty || 1) * appliedUnitUsd;

            return (
              <div
                key={idx}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 0.55fr 1.05fr 0.95fr 1.6fr 32px',
                  gap: '8px',
                  alignItems: 'center',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '5px',
                  padding: '6px 10px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                }}
              >
                {/* Container Type */}
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 750, color: '#64748b', display: 'block', marginBottom: '2px' }}>
                    컨테이너 규격 #{idx + 1}
                  </label>
                  <select
                    value={c.type || '20GP'}
                    onChange={e => {
                      const selectedVal = e.target.value;
                      handleContainerTypeSelection(selectedVal, c.type || '20GP', customContainerTypes, (newType) => {
                        handleUpdateContainer(idx, 'type', newType);
                      });
                    }}
                    style={{ width: '100%', height: '32px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
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
                  <label style={{ fontSize: '10px', fontWeight: 750, color: '#64748b', display: 'block', marginBottom: '2px' }}>
                    수량 (대)
                  </label>
                  <FormattedNumberInput
                    value={c.qty ?? 1}
                    isInteger={true}
                    placeholder="1"
                    onChange={val => handleUpdateContainer(idx, 'qty', val || 1)}
                    style={{ width: '100%', height: '32px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Ocean Freight Unit Price */}
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 750, color: '#64748b', display: 'block', marginBottom: '2px' }}>
                    운임 단가 ({calc.oceanCurrency || 'USD'})
                  </label>
                  <FormattedNumberInput
                    value={c.oceanPriceRaw || 0}
                    isInteger={calc.oceanCurrency === 'KRW'}
                    placeholder={calc.oceanCurrency === 'KRW' ? '예: 1,400,000' : '예: 1,000.00'}
                    onChange={val => handleUpdateContainer(idx, 'oceanPriceRaw', val)}
                    style={{ width: '100%', height: '32px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Row Applied Subtotal USD */}
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 750, color: '#64748b', display: 'block', marginBottom: '2px' }}>
                    적용 소계 (USD)
                  </label>
                  <div style={{ height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12.5px', fontWeight: 800, color: '#1d4ed8', boxSizing: 'border-box' }}>
                    ${lineTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Container Remarks */}
                <div>
                  <label style={{ fontSize: '10px', fontWeight: 750, color: '#64748b', display: 'block', marginBottom: '2px' }}>
                    비고 (Remarks)
                  </label>
                  <input
                    type="text"
                    value={c.remarks !== undefined ? c.remarks : '기본 해상운임'}
                    placeholder="예: 기본 해상운임"
                    onChange={e => handleUpdateContainer(idx, 'remarks', e.target.value)}
                    style={{ width: '100%', height: '32px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', fontWeight: 600, color: '#1e293b', background: '#fff', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Remove Container Button */}
                <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%', paddingBottom: '1px' }}>
                  <button
                    type="button"
                    onClick={() => handleRemoveContainer(idx)}
                    disabled={containers.length <= 1}
                    style={{
                      width: '32px',
                      height: '32px',
                      background: containers.length <= 1 ? '#f1f5f9' : '#fee2e2',
                      color: containers.length <= 1 ? '#94a3b8' : '#dc2626',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: containers.length <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: '13px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                    title={containers.length <= 1 ? '최소 1개의 컨테이너 규격이 필요합니다' : '컨테이너 규격 삭제'}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Multi-container summary badge if > 1 containers */}
        {containers.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', padding: '6px 10px', background: '#eff6ff', borderRadius: '4px', border: '1px dashed #93c5fd' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 750, color: '#1e40af' }}>
              📦 컨테이너 구성 합계: {containers.map(c => `${c.type || '20GP'} ${c.qty || 1}대`).join(' + ')} (총 {containers.reduce((sum, c) => sum + (c.qty || 1), 0)}대)
            </span>
            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#1d4ed8' }}>
              총 해상운임 소계: ${appliedOceanTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>

      {/* 2. 5종 부대비용 그리드 */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>📑 2. 부대비용 세부 분리 입력 (Incidental Logistics Costs)</span>
          <span style={{ fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
            부대비용 소계: ${incidentalTotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
          {/* 1. 상공회의소 */}
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 750, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="상공회의소(상업송장,원산지증명)">
                📜 상공회의소
              </span>
              <span style={{ fontSize: '10.5px', color: '#2563eb', fontWeight: 700, marginLeft: '4px' }}>${coUsd.toFixed(2)}</span>
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
              <FormattedNumberInput
                value={calc.coFee?.amount || 0}
                isInteger={calc.coFee?.currency !== 'USD'}
                placeholder="0"
                onChange={val => updateFreightCalculation({ coFee: { amount: val, currency: calc.coFee?.currency || 'KRW' } })}
                style={{ flex: 1, minWidth: '0', height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '12px', fontWeight: 600, textAlign: 'right', padding: '0 6px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* 2. Customs Fee */}
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 750, color: '#475569' }}>📑 수출신고비</span>
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
              <FormattedNumberInput
                value={calc.customsFee?.amount || 0}
                isInteger={calc.customsFee?.currency !== 'USD'}
                placeholder="0"
                onChange={val => updateFreightCalculation({ customsFee: { amount: val, currency: calc.customsFee?.currency || 'KRW' } })}
                style={{ flex: 1, minWidth: '0', height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '12px', fontWeight: 600, textAlign: 'right', padding: '0 6px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* 3. Purchase Cert Fee */}
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 750, color: '#475569' }}>📋 구매확인서</span>
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
              <FormattedNumberInput
                value={calc.purchaseCertFee?.amount || 0}
                isInteger={calc.purchaseCertFee?.currency !== 'USD'}
                placeholder="0"
                onChange={val => updateFreightCalculation({ purchaseCertFee: { amount: val, currency: calc.purchaseCertFee?.currency || 'KRW' } })}
                style={{ flex: 1, minWidth: '0', height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '12px', fontWeight: 600, textAlign: 'right', padding: '0 6px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* 4. Inland Freight */}
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 750, color: '#475569' }}>🚚 내륙운송비</span>
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
              <FormattedNumberInput
                value={calc.inlandFreight?.amount || 0}
                isInteger={calc.inlandFreight?.currency !== 'USD'}
                placeholder="0"
                onChange={val => updateFreightCalculation({ inlandFreight: { amount: val, currency: calc.inlandFreight?.currency || 'KRW' } })}
                style={{ flex: 1, minWidth: '0', height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '12px', fontWeight: 600, textAlign: 'right', padding: '0 6px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          {/* 5. Other Fee */}
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 750, color: '#475569' }}>📦 기타 부대비용</span>
              <span style={{ fontSize: '10.5px', color: '#2563eb', fontWeight: 700 }}>${otherUsd.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <select
                value={calc.otherFee?.currency || 'KRW'}
                onChange={e => updateFreightCalculation({ otherFee: { amount: calc.otherFee?.amount || 0, currency: e.target.value as any } })}
                style={{ width: '65px', height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '11.5px', fontWeight: 700 }}
              >
                <option value="KRW">₩ KRW</option>
                <option value="USD">$ USD</option>
              </select>
              <FormattedNumberInput
                value={calc.otherFee?.amount || 0}
                isInteger={calc.otherFee?.currency !== 'USD'}
                placeholder="0"
                onChange={val => updateFreightCalculation({ otherFee: { amount: val, currency: calc.otherFee?.currency || 'KRW' } })}
                style={{ flex: 1, minWidth: '0', height: '30px', border: '1px solid #cbd5e1', borderRadius: '3px', fontSize: '12px', fontWeight: 600, textAlign: 'right', padding: '0 6px', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. 운송 관련 비고 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', width: '120px', flexShrink: 0 }}>부대비용/종합 비고:</span>
          <textarea
            placeholder="부대비용(수출신고, 내륙운송 등) 및 운송 종합 특약 사항/메모를 입력하세요."
            value={calc.freightRemarks ?? ''}
            onChange={e => updateFreightCalculation({ freightRemarks: e.target.value })}
            rows={1}
            style={{ flex: 1, minHeight: '34px', padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      {/* 4. Final Decided Total Freight Badge with Round Up Feature */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: '6px', padding: '10px 14px', marginTop: '2px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e3a8a' }}>
              🎯 최종 결정 운송비 (Final Total Freight)
            </span>
            <span style={{ fontSize: '11.5px', color: '#3b82f6', fontWeight: 600 }}>
              (해상운임 ${appliedOceanTotalUsd.toFixed(2)} + 부대비용 ${incidentalTotalUsd.toFixed(2)})
            </span>
          </div>
          {activeRoundType !== 'none' && (
            <div style={{ fontSize: '11.5px', color: '#166534', fontWeight: 750 }}>
              원금액 ${rawTotalCalculated.toFixed(2)} ➔ 올림 반영: ${finalCalculated.toFixed(2)}
            </div>
          )}
        </div>

        {/* Round Up Selector & Final Amount */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', padding: '3px 6px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', marginRight: '2px' }}>ROUNDUP 자리수:</span>
            
            {/* 엑셀 ROUNDUP 세그먼트 버튼 그룹 (none, 2, 1, 0, -1, -2, -3) */}
            <div style={{ display: 'inline-flex', borderRadius: '4px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
              <button
                type="button"
                onClick={() => updateFreightCalculation({ roundUpType: 'none' })}
                style={{
                  height: '26px',
                  padding: '0 8px',
                  border: 'none',
                  borderRight: '1px solid #cbd5e1',
                  background: activeRoundType === 'none' ? '#3b82f6' : '#f8fafc',
                  color: activeRoundType === 'none' ? '#fff' : '#475569',
                  fontSize: '11px',
                  fontWeight: activeRoundType === 'none' ? 800 : 600,
                  cursor: 'pointer'
                }}
                title={`소수점 그대로 유지 ($${rawTotalCalculated.toFixed(2)})`}
              >
                유지
              </button>

              <button
                type="button"
                onClick={() => updateFreightCalculation({ roundUpType: '2' })}
                style={{
                  height: '26px',
                  padding: '0 8px',
                  border: 'none',
                  borderRight: '1px solid #cbd5e1',
                  background: activeRoundType === '2' ? '#3b82f6' : '#f8fafc',
                  color: activeRoundType === '2' ? '#fff' : '#475569',
                  fontSize: '11px',
                  fontWeight: activeRoundType === '2' ? 800 : 600,
                  cursor: 'pointer'
                }}
                title={`ROUNDUP(..., 2) 소수둘째자리 올림 ($${excelRoundup(rawTotalCalculated, 2).toFixed(2)})`}
              >
                2
              </button>

              <button
                type="button"
                onClick={() => updateFreightCalculation({ roundUpType: '1' })}
                style={{
                  height: '26px',
                  padding: '0 8px',
                  border: 'none',
                  borderRight: '1px solid #cbd5e1',
                  background: activeRoundType === '1' ? '#3b82f6' : '#f8fafc',
                  color: activeRoundType === '1' ? '#fff' : '#475569',
                  fontSize: '11px',
                  fontWeight: activeRoundType === '1' ? 800 : 600,
                  cursor: 'pointer'
                }}
                title={`ROUNDUP(..., 1) 소수첫째자리 올림 ($${excelRoundup(rawTotalCalculated, 1).toFixed(2)})`}
              >
                1
              </button>

              <button
                type="button"
                onClick={() => updateFreightCalculation({ roundUpType: '0' })}
                style={{
                  height: '26px',
                  padding: '0 8px',
                  border: 'none',
                  borderRight: '1px solid #cbd5e1',
                  background: (activeRoundType === '0' || activeRoundType === 'ceil_1') ? '#3b82f6' : '#f8fafc',
                  color: (activeRoundType === '0' || activeRoundType === 'ceil_1') ? '#fff' : '#475569',
                  fontSize: '11px',
                  fontWeight: (activeRoundType === '0' || activeRoundType === 'ceil_1') ? 800 : 600,
                  cursor: 'pointer'
                }}
                title={`ROUNDUP(..., 0) 1$ 정수 올림 ($${excelRoundup(rawTotalCalculated, 0).toFixed(2)})`}
              >
                0
              </button>

              <button
                type="button"
                onClick={() => updateFreightCalculation({ roundUpType: '-1' })}
                style={{
                  height: '26px',
                  padding: '0 8px',
                  border: 'none',
                  borderRight: '1px solid #cbd5e1',
                  background: activeRoundType === '-1' ? '#3b82f6' : '#f8fafc',
                  color: activeRoundType === '-1' ? '#fff' : '#475569',
                  fontSize: '11px',
                  fontWeight: activeRoundType === '-1' ? 800 : 600,
                  cursor: 'pointer'
                }}
                title={`ROUNDUP(..., -1) 10$ 단위 올림 ($${excelRoundup(rawTotalCalculated, -1).toFixed(2)})`}
              >
                -1
              </button>

              <button
                type="button"
                onClick={() => updateFreightCalculation({ roundUpType: '-2' })}
                style={{
                  height: '26px',
                  padding: '0 8px',
                  border: 'none',
                  borderRight: '1px solid #cbd5e1',
                  background: activeRoundType === '-2' ? '#3b82f6' : '#f8fafc',
                  color: activeRoundType === '-2' ? '#fff' : '#475569',
                  fontSize: '11px',
                  fontWeight: activeRoundType === '-2' ? 800 : 600,
                  cursor: 'pointer'
                }}
                title={`ROUNDUP(..., -2) 100$ 단위 올림 ($${excelRoundup(rawTotalCalculated, -2).toFixed(2)})`}
              >
                -2
              </button>

              <button
                type="button"
                onClick={() => updateFreightCalculation({ roundUpType: '-3' })}
                style={{
                  height: '26px',
                  padding: '0 8px',
                  border: 'none',
                  background: activeRoundType === '-3' ? '#3b82f6' : '#f8fafc',
                  color: activeRoundType === '-3' ? '#fff' : '#475569',
                  fontSize: '11px',
                  fontWeight: activeRoundType === '-3' ? 800 : 600,
                  cursor: 'pointer'
                }}
                title={`ROUNDUP(..., -3) 1,000$ 단위 올림 ($${excelRoundup(rawTotalCalculated, -3).toFixed(2)})`}
              >
                -3
              </button>
            </div>
          </div>

          <div style={{ fontSize: '18px', fontWeight: 900, color: '#1d4ed8', minWidth: '90px', textAlign: 'right' }}>
            ${(formData.freightTotal || finalCalculated || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    </div>
  );
};
