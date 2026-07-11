import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ImportRequest } from '../types';
import { db, COMPANY_ID } from '../firebase';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { SupplierSearchModal } from '../components/SupplierSearchModal';
import { CustomerSearchModal } from '../components/CustomerSearchModal';
import type { Customer } from '../types/customer';
const getSellerAbbr = (name: string): string => {
  if (!name) return 'SUP';
  const words = name.replace(/[^a-zA-Z\s]/g, '').toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    return words.slice(0, 3).map(w => w[0]).join('');
  } else if (words.length === 2) {
    return words[0][0] + words[1][0] + (words[1][1] || 'X');
  } else if (words.length === 1) {
    return words[0].slice(0, 3).padEnd(3, 'X');
  }
  return 'SUP';
};

const computePoNumber = (importCompany: string, sellerName: string, id: string): string => {
  const compPrefix = importCompany === 'YS' ? 'YS' : 'YSACC';
  const sellerAbbr = getSellerAbbr(sellerName);
  const currentYear = new Date().getFullYear().toString();
  const serial = id.slice(-2) || '01';
  return `PO-${compPrefix}-${sellerAbbr}-${currentYear}-${serial}`;
};

import { ProductSearchModal } from '../components/ProductSearchModal';
import type { Product, ProductPriceHistory } from '../types/product';
import { useAuth } from '../contexts/AuthContext';

export const INITIAL_IMPORTS: ImportRequest[] = [];

export const Imports: React.FC<{ mode?: 'active' | 'quotes' }> = ({ mode = 'active' }) => {
  const calculateTotalCostHelper = (cb: any, _piItems: any[] = []) => {
    const applied = cb.appliedExchangeRate || 1450;
    const priceUsd = cb.buyingPriceUsd || 0;
    const qty = cb.buyingQty || 1;
    
    const goodsAmountKrw = priceUsd * applied * qty;
    const freightKrw = (cb.freightUsd || 0) * applied;
    const insuranceKrw = (cb.insuranceUsd || 0) * applied;
    const originInlandKrw = (cb.originInlandUsd || 0) * applied;
    
    const cifKrw = Math.round(goodsAmountKrw + freightKrw + insuranceKrw + originInlandKrw);
    const customsDuty = Math.round(cifKrw * (((cb.ftaTaxRate || 0) + (cb.antiDumpingRate || 0)) / 100));
    const vatKrw = Math.round((cifKrw + customsDuty) * 0.1);
    
    const clearanceFee = cb.clearanceFee || 0;
    const portFee = cb.portFee || 0;
    const domesticTransportFee = cb.domesticTransportFee || 0;
    const handlingFee = cb.handlingFee || 0;
    const otherFee = cb.otherFee || 0;
    
    const totalImportCost = cifKrw + customsDuty + clearanceFee + portFee + domesticTransportFee + handlingFee + otherFee;
    const totalCashRequired = totalImportCost + vatKrw;
    
    return {
      goodsAmountKrw,
      freightKrw,
      insuranceKrw,
      originInlandKrw,
      cifKrw,
      customsDuty,
      vatKrw,
      totalImportCost,
      totalCashRequired,
      unitCost: Math.round(totalImportCost / qty)
    };
  };



  const calculateEditTotalCost = (req: Partial<ImportRequest>) => {
    const cb = req.costBreakdown || {};
    const res = calculateTotalCostHelper(cb, req.piItems || []);
    return res.totalImportCost;
  };



  const recalculateEditCosts = (prev: Partial<ImportRequest>, nextB: any) => {
    const totalCost = calculateEditTotalCost({ ...prev, costBreakdown: nextB });
    const rate = prev.marginRate || 0;
    const marginAmount = Math.round(totalCost * (rate / 100));
    return { ...prev, costBreakdown: nextB, marginAmount, customerQuoteAmount: totalCost + marginAmount };
  };

  const renderCostCalculatorTable = (
    req: Partial<ImportRequest>,
    onChangeCostBreakdown: (nextB: any) => void,
    onChangeMarginRate: (rate: number) => void
  ) => {
    const cb = req.costBreakdown || {};
    const {
      goodsAmountKrw,
      freightKrw,
      insuranceKrw,
      originInlandKrw,
      cifKrw,
      customsDuty,
      vatKrw,
      totalImportCost,
      totalCashRequired,
      unitCost
    } = calculateTotalCostHelper(cb, req.piItems || []);

    return (
      <div style={{ background: '#fff', padding: '20px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '14px', gridColumn: 'span 2', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginTop: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px' }}>
          <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>📊 간편 수입원가 계산표 (Trade Cost Calculator)</span>
          <button
            type="button"
            onClick={() => setIsCostTableExpanded(!isCostTableExpanded)}
            style={{
              padding: '4px 10px',
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 650,
              color: '#475569',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            {isCostTableExpanded ? '상세 접기 ▴' : '상세 펼치기 ▾'}
          </button>
        </div>
        
        {/* 1 ~ 4번 항목: 상단 기본정보 입력란 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', background: '#f8fafc', padding: '12px', borderRadius: '4px', border: '1px solid #e2e8f0', marginBottom: '6px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>적용환율 (EXCHANGE RATE)</label>
            <input type="number" value={cb.appliedExchangeRate || ''} onChange={e => {
              const val = Number(e.target.value) || 0;
              onChangeCostBreakdown({ ...cb, appliedExchangeRate: val });
            }} style={{ height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, color: '#1e293b', padding: '0 8px', outline: 'none', background: '#fff' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>인코텀즈 (INCOTERMS)</label>
            <select value={cb.incoterms || 'FOB'} onChange={e => {
              const val = e.target.value;
              onChangeCostBreakdown({ ...cb, incoterms: val });
            }} style={{ height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, color: '#1e293b', padding: '0 8px', outline: 'none', background: '#fff' }}>
              <option value="EXW">EXW</option>
              <option value="FOB">FOB</option>
              <option value="CIF">CIF</option>
              <option value="DDP">DDP</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>물품금액 (INVOICE USD)</label>
            <input type="number" value={cb.buyingPriceUsd || ''} onChange={e => {
              const val = Number(e.target.value) || 0;
              onChangeCostBreakdown({ ...cb, buyingPriceUsd: val });
            }} style={{ height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, color: '#1e293b', padding: '0 8px', outline: 'none', background: '#fff' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.02em' }}>수량 (Q'TY)</label>
            <input type="number" value={cb.buyingQty || ''} onChange={e => {
              const val = Number(e.target.value) || 1;
              onChangeCostBreakdown({ ...cb, buyingQty: val });
            }} style={{ height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, color: '#1e293b', padding: '0 8px', outline: 'none', background: '#fff' }} />
          </div>
        </div>

        {/* 24개 세부 계산 테이블 */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', height: '32px' }}>
                <th style={{ padding: '6px 8px', textAlign: 'center', width: '50px', fontSize: '12.5px', fontWeight: 750, color: '#475569' }}>No.</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '12.5px', fontWeight: 750, color: '#475569' }}>항목</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', width: '180px', fontSize: '12.5px', fontWeight: 750, color: '#475569' }}>입력값</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: '12.5px', fontWeight: 750, color: '#475569' }}>계산금액 (KRW)</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', width: '90px', fontSize: '12.5px', fontWeight: 750, color: '#475569' }}>원가포함</th>
              </tr>
            </thead>
            <tbody>

              {isCostTableExpanded && (
                <>
                  {/* 1. 물품금액 */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>1</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>물품금액 (FOB Amount)</td>
                    <td style={{ color: '#64748b' }}>Invoice USD: ${cb.buyingPriceUsd?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) || '0'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{goodsAmountKrw.toLocaleString()} 원</td>
                    <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                  </tr>
                  {/* 2. 국제운임 */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>2</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>국제운임 (Ocean/Air Freight)</td>
                    <td style={{ padding: '2px 4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>$</span>
                        <input type="number" value={cb.freightUsd || ''} onChange={e => {
                          const val = Number(e.target.value) || 0;
                          onChangeCostBreakdown({ ...cb, freightUsd: val });
                        }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{freightKrw.toLocaleString()} 원</td>
                    <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                  </tr>
                  {/* 3. 보험료 */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>3</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>보험료 (Cargo Insurance)</td>
                    <td style={{ padding: '2px 4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>$</span>
                        <input type="number" value={cb.insuranceUsd || ''} onChange={e => {
                          const val = Number(e.target.value) || 0;
                          onChangeCostBreakdown({ ...cb, insuranceUsd: val });
                        }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{insuranceKrw.toLocaleString()} 원</td>
                    <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                  </tr>
                  {/* 4. 수출국 내륙운송·수출비 */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>4</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>수출국 내륙운송·수출비</td>
                    <td style={{ padding: '2px 4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>$</span>
                        <input type="number" value={cb.originInlandUsd || ''} onChange={e => {
                          const val = Number(e.target.value) || 0;
                          onChangeCostBreakdown({ ...cb, originInlandUsd: val });
                        }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{originInlandKrw.toLocaleString()} 원</td>
                    <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                  </tr>
                  {/* 5. CIF 과세가격 */}
                  <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#f8fafc', height: '34px', fontSize: '12.5px' }}>
                    <td style={{ textAlign: 'center', fontWeight: 'bold' }}>5</td>
                    <td style={{ fontWeight: 800, color: '#0f172a' }}>CIF 과세가격 (Customs Value)</td>
                    <td style={{ color: '#475569', fontSize: '11px' }}>자동: (1+2+3+4) × 환율</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{cifKrw.toLocaleString()} 원</td>
                    <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                  </tr>
                  {/* 6. 관세율 */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>6</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>관세율 (Customs Duty Rate)</td>
                    <td style={{ padding: '2px 4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input type="number" value={cb.ftaTaxRate || ''} onChange={e => {
                          const val = Number(e.target.value) || 0;
                          onChangeCostBreakdown({ ...cb, ftaTaxRate: val });
                        }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }} />
                        <span style={{ fontSize: '11.5px', color: '#64748b' }}>%</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', color: '#64748b' }}>-</td>
                    <td style={{ textAlign: 'center', color: '#94a3b8' }}>-</td>
                  </tr>
                  {/* 7. 관세 */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>7</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>관세 (Customs Duty)</td>
                    <td style={{ color: '#475569', fontSize: '11px' }}>자동: 5 × 6</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{customsDuty.toLocaleString()} 원</td>
                    <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                  </tr>
                  {/* 8. 수입 부가세 */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>8</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>수입 부가세 (Import VAT)</td>
                    <td style={{ color: '#475569', fontSize: '11px' }}>자동: (5 + 7) × 10%</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#475569' }}>{vatKrw.toLocaleString()} 원</td>
                    <td style={{ textAlign: 'center', color: '#f59e0b', fontSize: '11px', fontWeight: 'bold' }}>조건부 (제외)</td>
                  </tr>
                  {/* 9. 통관비 */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>9</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>통관비 (Customs Brokerage)</td>
                    <td style={{ padding: '2px 4px' }}>
                      <input type="number" value={cb.clearanceFee || ''} onChange={e => {
                        const val = Number(e.target.value) || 0;
                        onChangeCostBreakdown({ ...cb, clearanceFee: val });
                      }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(cb.clearanceFee || 0).toLocaleString()} 원</td>
                    <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                  </tr>
                  {/* 10. 항만·공항 비용 */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>10</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>항만·공항 비용 (Port Charges)</td>
                    <td style={{ padding: '2px 4px' }}>
                      <input type="number" value={cb.portFee || ''} onChange={e => {
                        const val = Number(e.target.value) || 0;
                        onChangeCostBreakdown({ ...cb, portFee: val });
                      }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(cb.portFee || 0).toLocaleString()} 원</td>
                    <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                  </tr>
                  {/* 11. 국내 운송비 */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>11</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>국내 운송비 (Domestic Transport)</td>
                    <td style={{ padding: '2px 4px' }}>
                      <input type="number" value={cb.domesticTransportFee || ''} onChange={e => {
                        const val = Number(e.target.value) || 0;
                        onChangeCostBreakdown({ ...cb, domesticTransportFee: val });
                      }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(cb.domesticTransportFee || 0).toLocaleString()} 원</td>
                    <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                  </tr>
                  {/* 12. 하역·장비비 */}
                  <tr style={{ borderBottom: '1px solid #f1f5f9', height: '34px', fontSize: '12.5px' }}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>12</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>하역·장비비 (Handling Fee)</td>
                    <td style={{ padding: '2px 4px' }}>
                      <input type="number" value={cb.handlingFee || ''} onChange={e => {
                        const val = Number(e.target.value) || 0;
                        onChangeCostBreakdown({ ...cb, handlingFee: val });
                      }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(cb.handlingFee || 0).toLocaleString()} 원</td>
                    <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                  </tr>
                  {/* 13. 기타 비용 */}
                  <tr style={{ borderBottom: '1px solid #cbd5e1', height: '34px', fontSize: '12.5px' }}>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>13</td>
                    <td style={{ fontWeight: 600, color: '#334155' }}>기타 비용 (Other Expenses)</td>
                    <td style={{ padding: '2px 4px' }}>
                      <input type="number" value={cb.otherFee || ''} onChange={e => {
                        const val = Number(e.target.value) || 0;
                        onChangeCostBreakdown({ ...cb, otherFee: val });
                      }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(cb.otherFee || 0).toLocaleString()} 원</td>
                    <td style={{ textAlign: 'center', color: '#22c55e', fontWeight: 'bold' }}>O</td>
                  </tr>
                </>
              )}

              {/* 14. 총 수입원가 */}
              <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#eff6ff', height: '36px', fontSize: '13px' }}>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>14</td>
                <td style={{ fontWeight: 800, color: '#1e3a8a' }}>총 수입원가 (Total Import Cost)</td>
                <td style={{ color: '#475569', fontSize: '11px' }}>자동: 5 + 7 + 9 + 10 + 11 + 12 + 13</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>{totalImportCost.toLocaleString()} 원</td>
                <td style={{ textAlign: 'center', color: '#1e3a8a', fontWeight: 'bold' }}>O</td>
              </tr>
              {/* 15. 총 현금소요액 */}
              <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc', height: '36px', fontSize: '13px' }}>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>15</td>
                <td style={{ fontWeight: 800, color: '#475569' }}>총 현금소요액 (Total Cash)</td>
                <td style={{ color: '#475569', fontSize: '11px' }}>자동: 총 수입원가 + 수입 부가세</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#475569' }}>{totalCashRequired.toLocaleString()} 원</td>
                <td style={{ textAlign: 'center', color: '#94a3b8' }}>-</td>
              </tr>
              {/* 16. 단위당 수입원가 */}
              <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc', height: '36px', fontSize: '13px' }}>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>16</td>
                <td style={{ fontWeight: 800, color: '#b45309' }}>단위당 수입원가 (Cost per Unit)</td>
                <td style={{ color: '#475569', fontSize: '11px' }}>자동: 총 수입원가 ÷ 수량</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#b45309' }}>{unitCost.toLocaleString()} 원 / {(req.piItems?.[0]?.unit || 'UNIT')}</td>
                <td style={{ textAlign: 'center', color: '#b45309', fontWeight: 'bold' }}>O</td>
              </tr>
              {/* 17. 마진율 (%) */}
              <tr style={{ borderBottom: '1px solid #f1f5f9', height: '36px', fontSize: '13px' }}>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>17</td>
                <td style={{ fontWeight: 600, color: '#334155' }}>마진율 (Margin Rate)</td>
                <td style={{ padding: '2px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="number" value={req.marginRate ?? ''} onChange={e => {
                      const rate = Number(e.target.value) || 0;
                      onChangeMarginRate(rate);
                    }} style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12.5px', fontWeight: 600, color: '#1e293b', padding: '0 4px', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }} />
                    <span style={{ fontSize: '11.5px', color: '#64748b' }}>%</span>
                  </div>
                </td>
                <td style={{ textAlign: 'right', color: '#64748b' }}>-</td>
                <td style={{ textAlign: 'center', color: '#94a3b8' }}>-</td>
              </tr>
              {/* 18. 마진 금액 */}
              <tr style={{ borderBottom: '1px solid #f1f5f9', height: '36px', fontSize: '13px' }}>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>18</td>
                <td style={{ fontWeight: 600, color: '#334155' }}>마진 금액 (Margin Amount)</td>
                <td style={{ color: '#475569', fontSize: '11px' }}>자동: 총 수입원가 × 마진율</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#b45309' }}>{(req.marginAmount || 0).toLocaleString()} 원</td>
                <td style={{ textAlign: 'center', color: '#94a3b8' }}>-</td>
              </tr>
              {/* 19. 고객 제시 견적금액 */}
              <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#fef3c7', height: '36px', fontSize: '13px' }}>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>19</td>
                <td style={{ fontWeight: 800, color: '#1e3a8a' }}>고객 제시 견적금액 (Customer Quote)</td>
                <td style={{ color: '#475569', fontSize: '11px' }}>자동: 총 수입원가 + 마진 금액</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>{(req.customerQuoteAmount || 0).toLocaleString()} 원</td>
                <td style={{ textAlign: 'center', color: '#1e3a8a', fontWeight: 'bold' }}>O</td>
              </tr>
              {/* 20. 단위당 최종 판매단가 */}
              <tr style={{ background: '#f0fdf4', height: '36px', fontSize: '13px' }}>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>20</td>
                <td style={{ fontWeight: 800, color: '#10b981' }}>단위당 최종 판매단가 (Final Selling Price)</td>
                <td style={{ color: '#475569', fontSize: '11px' }}>자동: 고객 제시 견적금액 ÷ 수량</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
                  {Math.round((req.customerQuoteAmount || 0) / (cb.buyingQty || 1)).toLocaleString()} 원 / {(req.piItems?.[0]?.unit || 'UNIT')}
                </td>
                <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>O</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };
  const [isCostTableExpanded, setIsCostTableExpanded] = useState(true);
  const [isActualCostTableExpanded, setIsActualCostTableExpanded] = useState(true);
  const isQuoteMode = mode === 'quotes';
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const [importRequests, setImportRequests] = useState<ImportRequest[]>([]);

  // 📅 날짜/기간 필터링 상태 추가 (수입견적: 월별 default, 수입관리: 날짜 default)
  const [dateFilterType, setDateFilterType] = useState<string>('All');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [rangeStart, setRangeStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [rangeEnd, setRangeEnd] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });

  useEffect(() => {
    const importsRef = collection(doc(db, 'companies', COMPANY_ID), 'imports');
    const unsubscribe = onSnapshot(importsRef, (snap) => {
      if (snap.empty) {
        setImportRequests([]);
      } else {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ImportRequest));
        setImportRequests(list);
      }
    }, (error) => {
      console.error('Failed to sync imports from Firestore:', error);
    });
    return () => unsubscribe();
  }, []);

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);


  // 고객사(바이어) DB 실시간 동기화 로드
  useEffect(() => {
    const unsub = onSnapshot(collection(doc(db, 'companies', COMPANY_ID), 'customers'), (snap) => {
      setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
    });
    return () => unsub();
  }, []);
  const [products, setProducts] = useState<Product[]>([]);
  const loadSuppliers = async () => {};

  useEffect(() => {
    // Real-time suppliers sync
    const unsubscribeSuppliers = onSnapshot(
      collection(db, 'companies', 'YSACC', 'suppliers'),
      (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setSuppliers(list);
      },
      (err) => {
        console.error("Failed to sync suppliers inside Imports:", err);
      }
    );

    // Real-time products sync
    const unsubscribeProducts = onSnapshot(
      collection(db, 'companies', 'YSACC', 'products'),
      (snap) => {
        const list = snap.docs.map(d => ({ ...d.data() as any, id: d.id }));
        setProducts(list);

        // Auto-cleanup duplicate documents in Firestore using authenticated client context
        const seenCodes = new Map();
        list.forEach(async (docObj) => {
          const code = (docObj.productCode || docObj.id || '').replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, "").toLowerCase();
          if (!code) return;
          if (seenCodes.has(code)) {
            const duplicateDocId = docObj.id;
            console.warn(`[Auto Cleanup] Found duplicate product: code=${code}, docId=${duplicateDocId}. Deleting...`);
            try {
              await deleteDoc(doc(db, 'companies', 'YSACC', 'products', duplicateDocId));
            } catch (err) {
              console.error("[Auto Cleanup] Failed to delete duplicate:", err);
            }
          } else {
            seenCodes.set(code, docObj.id);
          }
        });
      },
      (err) => {
        console.error("Failed to sync products inside Imports:", err);
      }
    );

    return () => {
      unsubscribeSuppliers();
      unsubscribeProducts();
    };
  }, []);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedImporter, setSelectedImporter] = useState('All');
  const [selectedItemName, setSelectedItemName] = useState('All');
  const [selectedCustomer, setSelectedCustomer] = useState('All');

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'requestDate', direction: 'desc' });
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    quote_requestDate: 120,
    quote_quoteNumber: 150,
    quote_importCompany: 160,
    quote_itemName: 200,
    quote_finalSellingPrice: 120,
    quote_customerQuoteAmount: 130,
    quote_finalCustomer: 150,
    quote_importerName: 150,
    quote_buyingPrice: 120,
    quote_appliedExchangeRate: 100,
    quote_customerDecision: 100,

    active_requestDate: 110,
    active_id: 100,
    active_poNumber: 180,
    active_importerName: 150,
    active_itemName: 180,
    active_transportType: 160,
    active_importCompany: 140,
    active_routeFrom: 160,
    active_etd: 110,
    active_eta: 110,
    active_finalCustomer: 140,
    active_managerName: 100,
    active_customerQuoteAmount: 140,
  });

  const handleResizeStart = (colKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[colKey] || 100;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      setColWidths(prev => ({
        ...prev,
        [colKey]: Math.max(50, startWidth + deltaX),
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev && prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const renderSortIndicator = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) return <span style={{ color: '#cbd5e1', marginLeft: '4px', fontSize: '10px' }}>⇅</span>;
    return sortConfig.direction === 'asc' ? <span style={{ color: '#2563eb', marginLeft: '4px', fontSize: '10px' }}>▲</span> : <span style={{ color: '#2563eb', marginLeft: '4px', fontSize: '10px' }}>▼</span>;
  };

  const currentTabBaseRequests = useMemo(() => {
    return isQuoteMode 
      ? importRequests
      : importRequests.filter(req => req.customerDecision === '승인');
  }, [importRequests, isQuoteMode]);

  const uniqueImporters = useMemo(() => {
    const set = new Set<string>();
    currentTabBaseRequests.forEach(r => {
      if (r.importerName) set.add(r.importerName);
    });
    return Array.from(set).sort();
  }, [currentTabBaseRequests]);

  const uniqueItems = useMemo(() => {
    const set = new Set<string>();
    currentTabBaseRequests.forEach(r => {
      if (r.itemName) set.add(r.itemName);
    });
    return Array.from(set).sort();
  }, [currentTabBaseRequests]);

  const uniqueCustomers = useMemo(() => {
    const set = new Set<string>();
    currentTabBaseRequests.forEach(r => {
      if (r.finalCustomer) set.add(r.finalCustomer);
    });
    return Array.from(set).sort();
  }, [currentTabBaseRequests]);
  const [showSupplierSearch, setShowSupplierSearch] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchTargetIdx, setProductSearchTargetIdx] = useState<number | null>(null);

  const saveToStorage = (data: ImportRequest[]) => {
    const prevIds = new Set(importRequests.map(r => r.id));
    const nextIds = new Set(data.map(r => r.id));
    setImportRequests(data); // 낙관적 업데이트 (Firestore onSnapshot이 곧 확정값으로 재동기화)

    prevIds.forEach(pid => {
      if (!nextIds.has(pid)) {
        deleteDoc(doc(db, 'companies', COMPANY_ID, 'imports', pid)).catch(err => {
          console.error('Failed to delete import doc:', err);
        });
      }
    });
    data.forEach(item => {
      const { id: itemId, ...rest } = item;
      setDoc(doc(db, 'companies', COMPANY_ID, 'imports', itemId), rest, { merge: true }).catch(err => {
        console.error('Failed to save import doc:', err);
      });
    });
  };

  // 모달리스 위치 및 리사이즈 상태
  const [modalPosition, setModalPosition] = useState({ x: 80, y: 35 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    // Input/Select/Button을 드래그 영역에서 제외
    const targetTag = (e.target as HTMLElement).tagName.toLowerCase();
    if (targetTag === 'input' || targetTag === 'select' || targetTag === 'button') {
      return;
    }
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - modalPosition.x,
      y: e.clientY - modalPosition.y
    });
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const nextX = Math.max(10, Math.min(window.innerWidth - 300, e.clientX - dragOffset.x));
      const nextY = Math.max(10, Math.min(window.innerHeight - 150, e.clientY - dragOffset.y));
      setModalPosition({
        x: nextX,
        y: nextY
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  const handleCreateNewImport = () => {
    const reqId = String(Math.floor(100000 + Math.random() * 900000));
    const compPrefix = isQuoteMode ? 'YS' : 'YSACC';
    const sellerAbbr = 'TBD';
    const currentYear = new Date().getFullYear().toString();
    const serial = reqId.slice(-2);
    const generatedPo = `PO-${compPrefix}-${sellerAbbr}-${currentYear}-${serial}`;

    const currentYearStr = new Date().getFullYear().toString();
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const currentDay = new Date().getDate().toString().padStart(2, '0');
    const dateStr = `${currentYearStr.slice(-2)}${currentMonth}${currentDay}`;
    const randomSerial = String(Math.floor(100 + Math.random() * 900));
    const generatedQuoteNo = `QT-${dateStr}-${randomSerial}`;

    const created: ImportRequest = {
      id: reqId,
      quoteNumber: generatedQuoteNo,
      blAwb: '-',
      poNumber: generatedPo,
      itemName: '신규 품목 정보 입력',
      transportType: 'By Sea',
      volume: '',
      routeFrom: '',
      routeTo: '',
      manager: '김주한',
      amount: 0,
      createdAt: new Date().toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\s/g, ''),
      importCompany: isQuoteMode ? 'YS' : 'YSACC',
      importerName: '',
      finalCustomer: '',
      origin: 'CHINA',
      requestDate: new Date().toISOString().slice(0, 10),
      requestedBy: '김주한',
      requestNote: '',
      customerDecision: isQuoteMode ? '검토중' : '승인',
      status: isQuoteMode ? '진행 결정 요청' : '발주 진행',

      incoterms: 'FOB',
      paymentTerms: '100% T/T in advance',
      pol: '',
      pod: '',
      piItems: [{ name: '', qty: '', unitPrice: '', amount: '', hsCode: '', unit: 'EA', palletSize: '', cbm: '', netWeight: '', grossWeight: '' }],
      supplierQuotes: [],
      costBreakdown: {
        productCost: 0,
        freightCost: 0,
        customsCost: 0,
        otherCost: 0,
        todayExchangeRate: 1450,
        appliedExchangeRate: 1450,
        buyingPriceUsd: 0,
        buyingQty: 0,
        ftaTaxRate: 0,
        antiDumpingRate: 0,
        transferFee: 0,
        importDeclareFee: 0,
        localTransportCost: 0
      },
      marginRate: 13,
      marginAmount: 0,
      customerQuoteAmount: 0,
      
      // Default 상세
      portOfLoading: '',
      portOfDischarge: '',
      packingQty: 1,
      packingUnit: 'PALLET',
      dimensions: '',
      weight: '',
      dangerousCargo: '미포함',
      msdsStatus: '미포함',
      lssIncluded: '포함',
      localTransportType: '독차',
      customsAgent: '이음관세사무소',
      cargoInsurance: '미신청',
      ftaOriginCert: '미신청'
    };

    const nextList = [created, ...importRequests];
    saveToStorage(nextList);
    
    // Redirect immediately to the empty ImportDetail page!
    if (isQuoteMode) {
      navigate(`/imports/${reqId}?mode=quote`);
    } else {
      navigate(`/imports/${reqId}?mode=active`);
    }
  };

  // 수입 수정 모달 상태
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<Partial<ImportRequest> | null>(null);

  const handleEditRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest || !editingRequest.id) return;

    let computedItemName = editingRequest.itemName || '';
    if (editingRequest.piItems && editingRequest.piItems.length > 0) {
      computedItemName = editingRequest.piItems[0].name || '';
      if (editingRequest.piItems.length > 1) {
        computedItemName += ` 외 ${editingRequest.piItems.length - 1}건`;
      }
    }
    if (!computedItemName) computedItemName = '미지정 품목';

    const itemsList = (editingRequest.piItems || []).map(it => ({
      ...it,
      amount: String(((Number(it.qty) || 0) * (Number(it.unitPrice) || 0)).toFixed(2))
    }));
    const totalCbm = itemsList.reduce((sum, it) => sum + (Number(it.cbm) || 0), 0);
    const totalNetWeight = itemsList.reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0);
    const totalGrossWeight = itemsList.reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0);
    const totalQty = itemsList.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

    const getSellerAbbr = (name: string): string => {
      if (!name) return 'SUP';
      const words = name.replace(/[^a-zA-Z\s]/g, '').toUpperCase().split(/\s+/).filter(Boolean);
      if (words.length >= 3) {
        return words.slice(0, 3).map(w => w[0]).join('');
      } else if (words.length === 2) {
        return words[0][0] + words[1][0] + (words[1][1] || 'X');
      } else if (words.length === 1) {
        return words[0].slice(0, 3).padEnd(3, 'X');
      }
      return 'SUP';
    };

    const nextList = importRequests.map(req => {
      if (req.id === editingRequest.id) {
        const compPrefix = (editingRequest.importCompany === 'YS' ? 'YS' : 'YSACC');
        const sellerAbbr = getSellerAbbr(editingRequest.importerName || req.importerName || '');
        const currentYear = new Date().getFullYear().toString();
        const serial = req.id.slice(-2) || '01';
        const generatedPo = `PO-${compPrefix}-${sellerAbbr}-${currentYear}-${serial}`;

        const totalUsd = itemsList.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
        const appliedExchange = editingRequest.costBreakdown?.appliedExchangeRate || req.costBreakdown?.appliedExchangeRate || 1450;
        
        return {
          ...req,
          ...editingRequest,
          poNumber: generatedPo,
          itemName: computedItemName,
          volume: `${totalCbm.toFixed(2)} CBM`,
          routeFrom: editingRequest.pol || editingRequest.routeFrom || req.routeFrom,
          routeTo: editingRequest.pod || editingRequest.routeTo || req.routeTo,
          amount: totalUsd > 0 ? Math.round(totalUsd * appliedExchange) : Number(editingRequest.amount || req.amount || 0),
          packingQty: totalQty || 1,
          weight: `${totalGrossWeight}KG (Net: ${totalNetWeight}KG)`,
          dimensions: itemsList[0]?.palletSize || req.dimensions
        } as ImportRequest;
      }
      return req;
    });

    saveToStorage(nextList);
    setShowEditModal(false);
    setEditingRequest(null);
  };

  const handleDeleteRequest = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`의뢰번호 ${id} 수입운송 건을 삭제하시겠습니까?`)) {
      const nextList = importRequests.filter(req => req.id !== id);
      saveToStorage(nextList);
    }
  };

  const handleCopyRequest = (req: ImportRequest, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`의뢰번호 ${req.id} 건을 복사하여 새로운 수입건으로 등록하시겠습니까?`)) {
      const nextId = String(Math.floor(100000 + Math.random() * 900000));
      
      const compPrefix = req.importCompany === 'YS' ? 'YS' : 'YSACC';
      const sellerAbbr = 'TBD';
      const currentYear = new Date().getFullYear().toString();
      const serial = nextId.slice(-2);
      const generatedPo = `PO-${compPrefix}-${sellerAbbr}-${currentYear}-${serial}`;

      const currentYearStr = new Date().getFullYear().toString();
      const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
      const currentDay = new Date().getDate().toString().padStart(2, '0');
      const dateStr = `${currentYearStr.slice(-2)}${currentMonth}${currentDay}`;
      const randomSerial = String(Math.floor(100 + Math.random() * 900));
      const generatedQuoteNo = `QT-${dateStr}-${randomSerial}`;

      const copied: ImportRequest = {
        ...req,
        id: nextId,
        poNumber: generatedPo,
        quoteNumber: generatedQuoteNo,
        createdAt: new Date().toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' }).replace(/\s/g, ''),
        requestDate: new Date().toISOString().slice(0, 10),
        itemName: req.itemName.includes('(복사)') ? req.itemName : `${req.itemName} (복사)`,
        customerDecision: isQuoteMode ? '검토중' : '승인',
        status: isQuoteMode ? '진행 결정 요청' : '발주 진행'
      };

      const nextList = [copied, ...importRequests];
      saveToStorage(nextList);
      alert(`의뢰번호 ${nextId} 건으로 복사되었습니다.`);
    }
  };

  // 📦 실행/정산 원가 → 상품별 수입원가 이력 반영
  // "실행원가" 계산표에 입력된 실제 청구 금액을 기준으로, 상품 DB와 연결된(productId 보유)
  // 품목마다 금액 비중으로 원가를 배분해 각 상품의 purchasePrices 이력에 한 줄씩 추가한다.
  // 수입과 무관한(연결 안 된) 상품은 전혀 건드리지 않으므로, 수입제품에 한해서만 이력이 쌓인다.
  const handleSettleImportCost = () => {
    if (!editingRequest || !editingRequest.id) return;
    const cb = editingRequest.actualCostBreakdown || {};
    const items = editingRequest.piItems || [];
    const linkedItems = items.filter(it => !!it.productId);

    if (linkedItems.length === 0) {
      alert('상품 DB와 연결된 품목이 없습니다. 위 "수입 제품 및 패킹 명세 목록"에서 🔍 버튼으로 상품 DB의 제품을 먼저 지정해주세요.');
      return;
    }
    if (editingRequest.settlementCompleted) {
      if (!window.confirm('이미 정산완료 처리된 건입니다. 다시 정산하면 각 상품의 원가 이력에 새 항목이 추가됩니다. 계속하시겠습니까?')) {
        return;
      }
    }

    const { totalImportCost } = calculateTotalCostHelper(cb, items);
    const totalAmount = items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
    const today = new Date().toISOString().slice(0, 10);
    const applied = cb.appliedExchangeRate || 1450;

    linkedItems.forEach(it => {
      const itemAmount = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
      const share = totalAmount > 0 ? itemAmount / totalAmount : 1 / linkedItems.length;
      const itemQty = Number(it.qty) || 1;

      const goodsAmountKrw = Math.round(((cb.buyingPriceUsd || 0) * applied * (cb.buyingQty || 0)) * share);
      const freightKrw = Math.round(((cb.freightUsd || 0) * applied) * share);
      const insuranceKrw = Math.round(((cb.insuranceUsd || 0) * applied) * share);
      const originInlandKrw = Math.round(((cb.originInlandUsd || 0) * applied) * share);
      const cifKrw = goodsAmountKrw + freightKrw + insuranceKrw + originInlandKrw;
      const customsDutyRate = (cb.ftaTaxRate || 0) + (cb.antiDumpingRate || 0);
      const customsDuty = Math.round(cifKrw * (customsDutyRate / 100));
      const clearanceFee = Math.round((cb.clearanceFee || 0) * share);
      const portFee = Math.round((cb.portFee || 0) * share);
      const domesticTransportFee = Math.round((cb.domesticTransportFee || 0) * share);
      const handlingFee = Math.round((cb.handlingFee || 0) * share);
      const otherFee = Math.round((cb.otherFee || 0) * share);
      const itemTotalImportCost = Math.round(totalImportCost * share);
      const unitCost = Math.round(itemTotalImportCost / itemQty);

      const historyEntry: ProductPriceHistory = {
        validFrom: today,
        supplierCode: '',
        supplierName: editingRequest.importerName || '',
        currency: 'KRW',
        price: unitCost,
        remarks: `수입원가 자동반영 (PO ${editingRequest.poNumber || '-'})`,
        sourceImportId: editingRequest.id,
        poNumber: editingRequest.poNumber,
        exchangeRate: cb.appliedExchangeRate,
        incoterms: cb.incoterms,
        importCostDetail: {
          qty: itemQty,
          goodsAmountKrw,
          freightKrw,
          insuranceKrw,
          originInlandKrw,
          cifKrw,
          customsDutyRate,
          customsDuty,
          clearanceFee,
          portFee,
          domesticTransportFee,
          handlingFee,
          otherFee,
          totalImportCost: itemTotalImportCost,
          unitCost
        }
      };

      const targetProduct = products.find(pr => pr.id === it.productId);
      const existingPrices = (targetProduct?.purchasePrices || []) as ProductPriceHistory[];
      setDoc(
        doc(db, 'companies', 'YSACC', 'products', it.productId as string),
        { purchasePrices: [historyEntry, ...existingPrices] },
        { merge: true }
      ).catch(err => console.error('Failed to write import cost history to product:', err));
    });

    const settledInfo = { settlementCompleted: true, settledAt: today, settledBy: userProfile?.name || '' };
    setEditingRequest(p => p ? ({ ...p, ...settledInfo }) : null);
    // 정산 정보는 즉시 원본 문서에도 반영 (수정완료를 누르지 않아도 유실되지 않도록)
    setDoc(doc(db, 'companies', COMPANY_ID, 'imports', editingRequest.id), settledInfo, { merge: true }).catch(err => {
      console.error('Failed to save settlement flag on import doc:', err);
    });

    alert(`${linkedItems.length}개 품목의 수입원가 이력이 상품 DB에 반영되었습니다.`);
  };

  const filteredRequests = useMemo(() => {
    let base = [...currentTabBaseRequests];

    // 📅 날짜/기간 실필터 적용
    base = base.filter(req => {
      if (!req.requestDate) return false;
      const d = new Date(req.requestDate);
      if (isNaN(d.getTime())) return false;
      const y = d.getFullYear();
      const m = d.getMonth() + 1;

      if (dateFilterType === 'Monthly') {
        return y === selectedYear && m === selectedMonth;
      } else if (dateFilterType === 'Range') {
        if (rangeStart && req.requestDate < rangeStart) return false;
        if (rangeEnd && req.requestDate > rangeEnd) return false;
      }
      return true;
    });

    // 🔍 수입처/품명/최종고객별 Select Dropdown 필터 적용
    if (selectedImporter !== 'All') {
      base = base.filter(req => req.importerName === selectedImporter);
    }
    if (selectedItemName !== 'All') {
      base = base.filter(req => req.itemName === selectedItemName);
    }
    if (selectedCustomer !== 'All') {
      base = base.filter(req => req.finalCustomer === selectedCustomer);
    }

    if (searchTerm.trim()) {
      base = base.filter(req =>
        req.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.id.includes(searchTerm) ||
        (req.importerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (req.shipperName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.routeFrom.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // ⇅ 정렬 (Sorting) 적용
    if (sortConfig) {
      base.sort((a, b) => {
        let aVal: any = '';
        let bVal: any = '';

        const key = sortConfig.key;
        if (key === 'requestDate') {
          aVal = a.requestDate || a.createdAt || '';
          bVal = b.requestDate || b.createdAt || '';
        } else if (key === 'quoteNumber') {
          aVal = a.quoteNumber || `QT-${a.id}`;
          bVal = b.quoteNumber || `QT-${b.id}`;
        } else if (key === 'finalSellingPrice') {
          const aQty = Number(a.costBreakdown?.buyingQty) || a.piItems?.reduce((sum: number, it: any) => sum + (Number(it.qty) || 0), 0) || 1;
          const bQty = Number(b.costBreakdown?.buyingQty) || b.piItems?.reduce((sum: number, it: any) => sum + (Number(it.qty) || 0), 0) || 1;
          aVal = Math.round((a.customerQuoteAmount || 0) / aQty);
          bVal = Math.round((b.customerQuoteAmount || 0) / bQty);
        } else if (key === 'buyingPrice') {
          aVal = Number(a.piItems?.[0]?.unitPrice) || 0;
          bVal = Number(b.piItems?.[0]?.unitPrice) || 0;
        } else if (key === 'appliedExchangeRate') {
          aVal = Number(a.costBreakdown?.appliedExchangeRate) || 0;
          bVal = Number(b.costBreakdown?.appliedExchangeRate) || 0;
        } else if (['id', 'poNumber', 'importCompany', 'itemName', 'finalCustomer', 'importerName', 'customerDecision', 'transportType', 'routeFrom', 'managerName', 'etd', 'eta'].includes(key)) {
          aVal = (a as any)[key] || '';
          bVal = (b as any)[key] || '';
        } else if (key === 'customerQuoteAmount') {
          aVal = Number(a.customerQuoteAmount) || 0;
          bVal = Number(b.customerQuoteAmount) || 0;
        }

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        } else {
          return sortConfig.direction === 'asc' ? (aVal > bVal ? 1 : -1) : (aVal < bVal ? 1 : -1);
        }
      });
    }

    return base;
  }, [
    currentTabBaseRequests, 
    searchTerm, 
    dateFilterType, 
    selectedYear, 
    selectedMonth, 
    rangeStart, 
    rangeEnd,
    selectedImporter,
    selectedItemName,
    selectedCustomer,
    sortConfig
  ]);

  const renderTh = (colKey: string, label: string, sortKey?: string, textAlign: 'left' | 'center' | 'right' = 'left') => {
    const width = colWidths[colKey] || 100;
    return (
      <th 
        style={{ 
          padding: '12px 16px', 
          fontSize: '11.5px', 
          fontWeight: 750, 
          color: '#475569', 
          letterSpacing: '0.02em', 
          textTransform: 'uppercase', 
          width: `${width}px`,
          minWidth: `${width}px`,
          maxWidth: `${width}px`,
          position: 'relative',
          cursor: sortKey ? 'pointer' : 'default',
          userSelect: 'none',
          textAlign,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          boxSizing: 'border-box'
        }}
        onClick={() => sortKey && handleSort(sortKey)}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', verticalAlign: 'middle' }}>
          {label}
          {sortKey && renderSortIndicator(sortKey)}
        </span>
        <div
          onMouseDown={(e) => handleResizeStart(colKey, e)}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '6px',
            cursor: 'col-resize',
            zIndex: 10,
            background: 'transparent'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#cbd5e1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        />
      </th>
    );
  };

  const getTdStyle = (colKey: string, textAlign: 'left' | 'center' | 'right' = 'left'): React.CSSProperties => {
    const width = colWidths[colKey] || 100;
    return {
      padding: '10px 16px',
      width: `${width}px`,
      minWidth: `${width}px`,
      maxWidth: `${width}px`,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      textAlign,
      boxSizing: 'border-box',
      verticalAlign: 'middle'
    };
  };

  return (
    <div style={{ padding: '24px', background: '#f8fafc', minHeight: 'calc(100vh - 64px)', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Title Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isQuoteMode ? '수입 견적관리' : '수입관리'}
          <span style={{ fontSize: '10px', fontWeight: 500, color: '#94a3b8', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>v1.4.2_clean</span>
        </h2>
        <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
          {isQuoteMode
            ? '고객사 수입요청 접수 및 해외공급사 견적/원가 산정 단계입니다. 고객이 진행을 승인하면 수입관리로 자동 이동합니다.'
            : '고객사가 진행을 승인한 수입 발주/물류/통관/정산 건 목록입니다. 견적 검토 중인 건은 수입 견적관리에서 확인하세요.'}
        </p>
      </div>

      {/* Filter panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: '16px', borderRadius: '4px', border: '1px solid #cbd5e1', marginBottom: '20px', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
          
          {/* 조회 기간 대분류 */}
          <select 
            value={dateFilterType}
            onChange={(e) => setDateFilterType(e.target.value)}
            style={{ padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', outline: 'none', height: '34px', boxSizing: 'border-box', color: '#1e293b', cursor: 'pointer' }}
          >
            <option value="All">전체 기간</option>
            <option value="Monthly">월별 조회</option>
            <option value="Range">날짜 지정</option>
          </select>

          {/* 월별 서브 옵션 */}
          {dateFilterType === 'Monthly' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', height: '34px', boxSizing: 'border-box', color: '#1e293b', cursor: 'pointer' }}
              >
                {[2024, 2025, 2026, 2027, 2028].map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', background: '#fff', height: '34px', boxSizing: 'border-box', color: '#1e293b', cursor: 'pointer' }}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
              </select>
            </div>
          )}

          {/* 날짜 범위 서브 옵션 */}
          {dateFilterType === 'Range' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', height: '34px', boxSizing: 'border-box', color: '#1e293b' }}
              />
              <span style={{ fontSize: '13px', color: '#94a3b8' }}>~</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', outline: 'none', height: '34px', boxSizing: 'border-box', color: '#1e293b' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff', overflow: 'hidden', maxWidth: '240px', width: '100%', height: '34px', boxSizing: 'border-box' }}>
            <input 
              type="text" 
              placeholder="의뢰번호, 품명, 수입처, 출발지 검색..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ border: 'none', padding: '0 12px', fontSize: '13px', outline: 'none', flex: 1, height: '100%', color: '#1e293b' }}
            />
          </div>

          {/* 🔍 수입처 필터 */}
          <select
            value={selectedImporter}
            onChange={(e) => setSelectedImporter(e.target.value)}
            style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', background: '#fff', height: '34px', boxSizing: 'border-box', cursor: 'pointer', outline: 'none' }}
          >
            <option value="All">전체 수입처</option>
            {uniqueImporters.map(imp => <option key={imp} value={imp}>{imp}</option>)}
          </select>

          {/* 🔍 품명 필터 */}
          <select
            value={selectedItemName}
            onChange={(e) => setSelectedItemName(e.target.value)}
            style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', background: '#fff', height: '34px', boxSizing: 'border-box', cursor: 'pointer', outline: 'none', maxWidth: '160px' }}
          >
            <option value="All">전체 품명</option>
            {uniqueItems.map(it => <option key={it} value={it}>{it}</option>)}
          </select>

          {/* 🔍 최종고객 필터 */}
          <select
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
            style={{ padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '13px', fontWeight: 600, color: '#1e293b', background: '#fff', height: '34px', boxSizing: 'border-box', cursor: 'pointer', outline: 'none' }}
          >
            <option value="All">전체 최종고객</option>
            {uniqueCustomers.map(cust => <option key={cust} value={cust}>{cust}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', height: '34px' }}>
          {isQuoteMode ? (
            <button
              onClick={handleCreateNewImport}
              style={{ padding: '0 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s', height: '100%', display: 'flex', alignItems: 'center', boxSizing: 'border-box' }}
              onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
              onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
            >
              신규 수입요청 등록
            </button>
          ) : (
            <button
              onClick={handleCreateNewImport}
              style={{ padding: '0 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s', height: '100%', display: 'flex', alignItems: 'center', boxSizing: 'border-box' }}
              onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
              onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
            >
              신규 수입 확정등록
            </button>
          )}
          <button 
            style={{ padding: '0 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center', boxSizing: 'border-box', transition: 'background 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
          >
            목록 받기
          </button>
          <button 
            style={{ padding: '0 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', height: '100%', display: 'flex', alignItems: 'center', boxSizing: 'border-box', transition: 'background 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
          >
            테이블 설정
          </button>
        </div>
      </div>

      {/* Main Table Grid */}
      <div style={{ background: '#ffffff', borderRadius: '4px', border: '1px solid #cbd5e1', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', height: '40px' }}>
              {isQuoteMode ? (
                <>
                  {renderTh('quote_requestDate', '견적일', 'requestDate')}
                  {renderTh('quote_quoteNumber', '견적번호', 'quoteNumber')}
                  {renderTh('quote_importCompany', '견적주체(YSACC/영성ACC)', 'importCompany', 'center')}
                  {renderTh('quote_itemName', '품명', 'itemName')}
                  {renderTh('quote_finalSellingPrice', '견적단가', 'finalSellingPrice', 'right')}
                  {renderTh('quote_customerQuoteAmount', '견적가', 'customerQuoteAmount', 'right')}
                  {renderTh('quote_finalCustomer', '최종고객', 'finalCustomer')}
                  {renderTh('quote_importerName', '수입처', 'importerName')}
                  {renderTh('quote_buyingPrice', '수입견적단가', 'buyingPrice', 'right')}
                  {renderTh('quote_appliedExchangeRate', '기준환율', 'appliedExchangeRate', 'right')}
                  {renderTh('quote_customerDecision', '진행상태', 'customerDecision', 'center')}
                </>
              ) : (
                <>
                  {renderTh('active_requestDate', '의뢰일', 'requestDate')}
                  {renderTh('active_id', '주문번호', 'id')}
                  {renderTh('active_poNumber', 'PO번호', 'poNumber')}
                  {renderTh('active_importerName', '수입처', 'importerName')}
                  {renderTh('active_itemName', '품명', 'itemName')}
                  {renderTh('active_transportType', '운송내용', 'transportType')}
                  {renderTh('active_importCompany', '수입주체', 'importCompany', 'center')}
                  {renderTh('active_routeFrom', '경로', 'routeFrom')}
                  {renderTh('active_etd', 'ETD', 'etd')}
                  {renderTh('active_eta', 'ETA', 'eta')}
                  {renderTh('active_finalCustomer', '최종고객', 'finalCustomer')}
                  {renderTh('active_managerName', '담당자', 'managerName')}
                  {renderTh('active_customerQuoteAmount', '수입금액', 'customerQuoteAmount', 'right')}
                </>
              )}
              <th style={{ padding: '12px 16px', fontSize: '11.5px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', width: '90px', textAlign: 'center' }}>관리</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.map(req => (
              <tr 
                key={req.id}
                onClick={() => {
                  if (isQuoteMode) {
                    navigate(`/imports/${req.id}?mode=quote`);
                  } else {
                    navigate(`/imports/${req.id}?mode=active`);
                  }
                }}
                style={{ borderBottom: '1px solid #cbd5e1', cursor: 'pointer', height: '64px', transition: 'background 0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
              >
                {isQuoteMode ? (
                  <>
                    {/* 견적일 */}
                    <td style={getTdStyle('quote_requestDate')}>
                      {req.requestDate || req.createdAt || '-'}
                    </td>

                    {/* 견적번호 */}
                    <td style={getTdStyle('quote_quoteNumber')}>
                      {req.quoteNumber || `QT-${req.id}`}
                    </td>

                    {/* 견적주체(YSACC/영성ACC) */}
                    <td style={getTdStyle('quote_importCompany', 'center')}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, color: (req.importCompany === 'YSACC' || req.importCompany === 'YS') ? '#15803d' : '#0369a1', background: (req.importCompany === 'YSACC' || req.importCompany === 'YS') ? '#dcfce7' : '#e0f2fe' }}>
                        {(req.importCompany === 'YSACC' || req.importCompany === 'YS') ? 'YSACC' : '영성ACC'}
                      </span>
                    </td>

                    {/* 품명 */}
                    <td style={getTdStyle('quote_itemName')}>
                      {req.itemName}
                    </td>

                    {/* 견적단가 */}
                    <td style={getTdStyle('quote_finalSellingPrice', 'right')}>
                      <span style={{ fontSize: '12.5px', color: '#2563eb', fontWeight: 700 }}>
                        {(() => {
                          const buyingQty = Number(req.costBreakdown?.buyingQty) || req.piItems?.reduce((sum: number, it: any) => sum + (Number(it.qty) || 0), 0) || 1;
                          const finalPrice = Math.round((req.customerQuoteAmount || 0) / buyingQty);
                          return finalPrice ? `₩${finalPrice.toLocaleString()}` : '-';
                        })()}
                      </span>
                    </td>

                    {/* 견적가 */}
                    <td style={getTdStyle('quote_customerQuoteAmount', 'right')}>
                      <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>
                        ₩{(req.customerQuoteAmount || 0).toLocaleString()}
                      </span>
                    </td>

                    {/* 최종고객 */}
                    <td style={getTdStyle('quote_finalCustomer')}>
                      {req.finalCustomer || '-'}
                    </td>

                    {/* 수입처 */}
                    <td style={getTdStyle('quote_importerName')}>
                      {req.importerName || '-'}
                    </td>

                    {/* 수입견적단가 */}
                    <td style={getTdStyle('quote_buyingPrice', 'right')}>
                      {req.piItems?.[0]?.unitPrice ? `$${Number(req.piItems[0].unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                    </td>

                    {/* 기준환율 */}
                    <td style={getTdStyle('quote_appliedExchangeRate', 'right')}>
                      {req.costBreakdown?.appliedExchangeRate ? `₩${Number(req.costBreakdown.appliedExchangeRate).toLocaleString()}` : '-'}
                    </td>

                    {/* 진행상태 */}
                    <td style={getTdStyle('quote_customerDecision', 'center')}>
                      {(() => {
                        const decision = req.customerDecision || '검토중';
                        const colorMap: Record<string, { bg: string; color: string }> = {
                          '검토중': { bg: '#fef3c7', color: '#b45309' },
                          '승인': { bg: '#dcfce7', color: '#15803d' },
                          '보류': { bg: '#f1f5f9', color: '#64748b' },
                          '거절': { bg: '#fee2e2', color: '#dc2626' }
                        };
                        const c = colorMap[decision] || colorMap['검토중'];
                        return (
                          <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, background: c.bg, color: c.color }}>
                            {decision}
                          </span>
                        );
                      })()}
                    </td>
                  </>
                ) : (
                  <>
                    {/* 의뢰일 */}
                    <td style={getTdStyle('active_requestDate')}>
                      {req.requestDate || req.createdAt || '-'}
                    </td>

                    {/* 주문번호 */}
                    <td style={getTdStyle('active_id')}>
                      {req.id}
                    </td>

                    {/* PO번호 */}
                    <td style={getTdStyle('active_poNumber')}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                        {req.poNumber && req.poNumber !== '-' ? req.poNumber : '-'}
                      </span>
                    </td>
                    
                    {/* 수입처 */}
                    <td style={getTdStyle('active_importerName')}>
                      {req.importerName || req.shipperName || '-'}
                    </td>

                    {/* 품명 */}
                    <td style={getTdStyle('active_itemName')}>
                      {req.itemName}
                    </td>

                    {/* 운송내용 */}
                    <td style={getTdStyle('active_transportType')}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569' }}>{req.transportType}</span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>{req.volume}</span>
                      </div>
                    </td>

                    {/* 수입주체 */}
                    <td style={getTdStyle('active_importCompany', 'center')}>
                      {req.importCompany ? (
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, color: req.importCompany === 'YS' ? '#0369a1' : '#15803d', background: req.importCompany === 'YS' ? '#e0f2fe' : '#dcfce7' }}>
                          {req.importCompany}
                        </span>
                      ) : '-'}
                    </td>

                    {/* 경로 */}
                    <td style={getTdStyle('active_routeFrom')}>
                      <div style={{ display: 'flex', gap: '2px', flexDirection: 'column', fontSize: '12.5px', color: '#475569', fontWeight: 600 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          📍 {req.routeFrom} ➔
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
                          ⚓ {req.routeTo}
                        </span>
                      </div>
                    </td>

                    {/* ETD */}
                    <td style={getTdStyle('active_etd')}>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0369a1' }}>
                        {req.etd || '-'}
                      </span>
                    </td>

                    {/* ETA */}
                    <td style={getTdStyle('active_eta')}>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#166534' }}>
                        {req.eta || '-'}
                      </span>
                    </td>

                    {/* 최종고객 */}
                    <td style={getTdStyle('active_finalCustomer')}>
                      {req.finalCustomer || '-'}
                    </td>

                    {/* 담당자 */}
                    <td style={getTdStyle('active_managerName')}>
                      {req.manager}
                    </td>

                    {/* 수입금액 */}
                    <td style={getTdStyle('active_customerQuoteAmount', 'right')}>
                      <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>
                        ₩{req.amount.toLocaleString()}
                      </span>
                    </td>
                  </>
                )}

                {/* 관리 (수정 및 삭제 버튼) */}
                <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                    <button
                      onClick={(e) => handleCopyRequest(req, e)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#10b981',
                        fontSize: '15px',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        fontWeight: 'bold'
                      }}
                      title="의뢰 복사"
                    >
                      📋
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingRequest(JSON.parse(JSON.stringify(req)));
                        setShowEditModal(true);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#3b82f6',
                        fontSize: '15px',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        fontWeight: 'bold'
                      }}
                      title="의뢰 수정"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => handleDeleteRequest(req.id, e)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: '16px',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        transition: 'background 0.2s',
                        fontWeight: 'bold'
                      }}
                      title="의뢰 삭제"
                      onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>



      {/* Supplier Search Modal (Subwindow) */}
      {showSupplierSearch && (
        <SupplierSearchModal
          suppliers={suppliers}
          onClose={() => setShowSupplierSearch(false)}
          onRefreshSuppliers={loadSuppliers}
          onSelect={(sup) => {
            if (showEditModal) {
              setEditingRequest(p => p ? { ...p, importerName: sup.name || '' } : null);
            }
            setShowSupplierSearch(false);
          }}
        />
      )}
      {/* Product Search Modal (Subwindow) */}
      {showProductSearch && productSearchTargetIdx !== null && (
        <ProductSearchModal
          products={products}
          onClose={() => {
            setShowProductSearch(false);
            setProductSearchTargetIdx(null);
          }}
          onSelect={(prod) => {
            if (showEditModal) {
              setEditingRequest(p => {
                if (!p) return null;
                const next = [...(p.piItems || [])];
                const idx = productSearchTargetIdx;
                if (next[idx]) {
                  next[idx] = {
                    ...next[idx],
                    name: prod.nameEn || prod.nameKo || '',
                    hsCode: prod.hsCode || '',
                    unitPrice: String(prod.purchasePrice || ''),
                    unit: prod.unit || 'EA',
                    weight: String(prod.weight || ''),
                    productId: prod.id
                  };
                }
                return { ...p, piItems: next };
              });
            }
            setShowProductSearch(false);
            setProductSearchTargetIdx(null);
          }}
        />
      )}
      {/* Edit Modal (Modalless & Resizeable/Draggable Window) */}
      {showEditModal && editingRequest && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10009, pointerEvents: 'none' }}>
          <div style={{
            position: 'absolute',
            left: `${modalPosition.x}px`,
            top: `${modalPosition.y}px`,
            background: '#fff',
            borderRadius: '12px',
            width: '1240px',
            minWidth: '600px',
            maxWidth: '98vw',
            height: '85vh',
            maxHeight: '90vh',
            padding: '16px 20px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15), 0 0 1px 1px rgba(0,0,0,0.2)',
            boxSizing: 'border-box',
            pointerEvents: 'auto',
            resize: 'both',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div 
              onMouseDown={handleHeaderMouseDown}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '16px', cursor: 'move', userSelect: 'none' }}
            >
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>수입 의뢰 건 수정 📌 <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>(헤더를 잡고 드래그 이동 / 우측하단 드래그로 크기조절 가능)</span></h3>
              <button onClick={() => { setShowEditModal(false); setEditingRequest(null); }} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>
            
            <form onSubmit={handleEditRequest} style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
              {/* 기본 수입주체 & 수입처 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>수입주체 구분</label>
                  <select 
                    value={editingRequest?.importCompany || 'YSACC'} 
                    onChange={e => {
                      const comp = e.target.value as any;
                      setEditingRequest(p => {
                        if (!p) return null;
                        const nextPo = computePoNumber(comp, p.importerName || '', p.id || '');
                        return { ...p, importCompany: comp, poNumber: nextPo };
                      });
                    }}
                    style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#fff' }}
                  >
                    <option value="YSACC">YSACC</option>
                    <option value="YS">YS (영성ACC)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>수입처 (공급업체관리 연결)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text"
                      readOnly
                      required
                      placeholder="우측 [검색] 버튼을 눌러 공급업체 선택"
                      value={editingRequest.importerName || ''}
                      style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#f8fafc', color: '#334155', fontWeight: 600 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSupplierSearch(true)}
                      style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      🔍 검색
                    </button>
                  </div>
                </div>
              </div>

              {/* PO 번호 & PI 번호 라인 */}
              {!isQuoteMode && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>PO 번호 (자동 넘버링 / 수정가능)</label>
                    <input 
                      type="text" 
                      required={!isQuoteMode}
                      value={editingRequest?.poNumber || ''} 
                      onChange={e => setEditingRequest(p => p ? ({ ...p, poNumber: e.target.value }) : null)}
                      style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                      placeholder="예: PO-YSACC-BOR-2026-01"
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>PI 번호 (상대회사 제공)</label>
                    <input 
                      type="text" 
                      value={editingRequest?.piNumber || ''} 
                      onChange={e => setEditingRequest(p => p ? ({ ...p, piNumber: e.target.value }) : null)}
                      style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                      placeholder="예: PI20260701-01"
                    />
                  </div>
                </div>
              )}

              {/* 최종고객 & INCOTERMS & B/L AWB 번호 */}
              {isQuoteMode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>최종고객 (고객사 DB 연계)</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      readOnly
                      value={editingRequest.finalCustomer || ''} 
                      style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#f8fafc' }}
                      placeholder="우측 [검색] 버튼으로 고객사 지정"
                    />
                    <button
                      type="button"
                      onClick={() => { setShowCustomerModal(true); }}
                      style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      🔍 검색
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>최종고객 (고객사 DB 연계)</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                          type="text" 
                          readOnly
                          value={editingRequest.finalCustomer || ''} 
                          style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#f8fafc' }}
                          placeholder="우측 [검색] 버튼으로 고객사 지정"
                        />
                        <button
                          type="button"
                          onClick={() => { setShowCustomerModal(true); }}
                          style={{ padding: '8px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          🔍 검색
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>INCOTERMS</label>
                      <select 
                        value={editingRequest.incoterms || 'FOB'} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, incoterms: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#fff' }}
                      >
                        <option value="EXW">EXW</option>
                        <option value="FCA">FCA</option>
                        <option value="FOB">FOB</option>
                        <option value="CFR">CFR</option>
                        <option value="CIF">CIF</option>
                        <option value="DAP">DAP</option>
                        <option value="DDP">DDP</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>B/L (AWB) 번호</label>
                      <input 
                        type="text" 
                        value={editingRequest.blAwb || ''} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, blAwb: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: B/L 번호 직접 입력"
                      />
                    </div>
                  </div>

                  {/* PAYMENT TERMS & 운송수단 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>PAYMENT TERMS</label>
                      <input 
                        type="text" 
                        value={editingRequest.paymentTerms || ''} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, paymentTerms: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: 100% T/T in advance"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>운송수단</label>
                      <select 
                        value={editingRequest.transportType || 'By Sea'} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, transportType: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none', background: '#fff' }}
                      >
                        <option value="By Sea">By Sea</option>
                        <option value="By Air">By Air</option>
                        <option value="By courier">By courier</option>
                      </select>
                    </div>
                  </div>

                  {/* 출발PORT & 도착PORT & 견적 운임 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>출발 PORT</label>
                      <input 
                        type="text" 
                        required={!isQuoteMode}
                        value={editingRequest.pol || ''} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, pol: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: SHANGHAI PORT, CHINA"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>도착 PORT</label>
                      <input 
                        type="text" 
                        required={!isQuoteMode}
                        value={editingRequest.pod || ''} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, pod: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: INCHEON PORT, KOREA"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>원산지 (Origin)</label>
                      <input 
                        type="text" 
                        required={!isQuoteMode}
                        value={editingRequest.origin || 'CHINA'} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, origin: e.target.value }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                        placeholder="예: CHINA, KOREA"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>견적 운임 (₩)</label>
                      <input 
                        type="number" 
                        value={editingRequest.amount} 
                        onChange={e => setEditingRequest(p => p ? ({ ...p, amount: Number(e.target.value) }) : null)}
                        style={{ padding: '8px 10px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* 4. 동적 통합 수입 제품 및 패킹 테이블 */}
              <div style={{ border: '1px solid var(--border-default)', borderRadius: '8px', padding: '12px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>📦 수입 제품 및 패킹 명세 목록</span>
                  <button 
                    type="button" 
                    onClick={() => setEditingRequest(p => p ? ({ ...p, piItems: [...(p.piItems || []), { name: '', qty: '', unitPrice: '', amount: '', hsCode: '', unit: 'EA', palletSize: '', cbm: '', netWeight: '', grossWeight: '' }] }) : null)}
                    style={{ padding: '2px 8px', border: '1px solid #2563eb', borderRadius: '4px', background: '#fff', color: '#2563eb', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    ＋ 항목 추가
                  </button>
                </div>
                
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', minWidth: '1000px' }}>
                    <thead>
                      <tr style={{ background: 'var(--border-color)', borderBottom: '1px solid var(--border-default)', height: '30px' }}>
                        <th style={{ padding: '4px', width: '30px', textAlign: 'center' }}>No</th>
                        <th style={{ padding: '4px', textAlign: 'left', minWidth: '180px' }}>DESCRIPTION OF COMMODITY</th>
                        <th style={{ padding: '4px', width: '90px' }}>HS CODE</th>
                        <th style={{ padding: '4px', width: '70px', textAlign: 'right' }}>QTY</th>
                        <th style={{ padding: '4px', width: '50px', textAlign: 'center' }}>UNIT</th>
                        <th style={{ padding: '4px', width: '80px', textAlign: 'right' }}>U.PRICE</th>
                        <th style={{ padding: '4px', width: '90px', textAlign: 'right' }}>TOTAL AMOUNT</th>
                        <th style={{ padding: '4px', width: '130px' }}>PALLET SIZE</th>
                        <th style={{ padding: '4px', width: '70px', textAlign: 'right' }}>CBM</th>
                        <th style={{ padding: '4px', width: '80px', textAlign: 'right' }}>N.WT (KG)</th>
                        <th style={{ padding: '4px', width: '80px', textAlign: 'right' }}>G.WT (KG)</th>
                        <th style={{ padding: '4px', width: '30px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(editingRequest.piItems || []).map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                          <td style={{ padding: '4px' }}>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <input 
                                type="text" 
                                value={item.name} 
                                onChange={e => {
                                  const val = e.target.value;
                                  setEditingRequest(p => {
                                    if (!p) return null;
                                    const next = [...(p.piItems || [])];
                                    next[idx] = { ...next[idx], name: val };
                                    return { ...p, piItems: next };
                                  });
                                }}
                                style={{ flex: 1, padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', boxSizing: 'border-box' }}
                                placeholder="예: E-GLASS SURFACE TISSUE"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setProductSearchTargetIdx(idx);
                                  setShowProductSearch(true);
                                }}
                                style={{ padding: '3px 6px', background: item.productId ? '#f0fdf4' : 'var(--border-color)', border: item.productId ? '1px solid #16a34a' : '1px solid var(--border-default)', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                                title={item.productId ? '상품 DB 연결됨 — 정산완료 시 이 품목의 원가 이력이 자동 반영됩니다' : '상품 DB에서 가져오기'}
                              >
                                {item.productId ? '✅' : '🔍'}
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.hsCode || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], hsCode: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.qty} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], qty: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.unit || 'EA'} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], unit: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.unitPrice} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], unitPrice: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              readOnly
                              value={
                                ((Number(item.qty) || 0) * (Number(item.unitPrice) || 0))
                                  ? String(((Number(item.qty) || 0) * (Number(item.unitPrice) || 0)).toFixed(2))
                                  : ''
                              } 
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box', background: '#f1f5f9', color: 'var(--text-secondary)', fontWeight: 'bold' }}
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.palletSize || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], palletSize: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', boxSizing: 'border-box' }}
                              placeholder="예: 110*110*120"
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.cbm || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], cbm: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                              placeholder="0.0"
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.netWeight || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], netWeight: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                              placeholder="0"
                            />
                          </td>
                          <td style={{ padding: '4px' }}>
                            <input 
                              type="text" 
                              value={item.grossWeight || ''} 
                              onChange={e => {
                                const val = e.target.value;
                                setEditingRequest(p => {
                                  if (!p) return null;
                                  const next = [...(p.piItems || [])];
                                  next[idx] = { ...next[idx], grossWeight: val };
                                  return { ...p, piItems: next };
                                });
                              }}
                              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }}
                              placeholder="0"
                            />
                          </td>
                          <td style={{ padding: '4px', textAlign: 'center' }}>
                            {editingRequest.piItems && editingRequest.piItems.length > 1 && (
                              <button 
                                type="button" 
                                onClick={() => setEditingRequest(p => p ? ({ ...p, piItems: (p.piItems || []).filter((_, i) => i !== idx) }) : null)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}

                      {/* 제일 밑줄에 nos of package and CBM and weight의 합계를 보여주는 요약행 */}
                      <tr style={{ background: '#f1f5f9', fontWeight: 'bold', height: '32px', borderTop: '2px solid var(--border-default)' }}>
                        <td colSpan={3} style={{ padding: '6px 8px', textAlign: 'center' }}>[합계 요약 (Total Summary)]</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1e3a8a' }}>
                          {(editingRequest.piItems || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0)}
                        </td>
                        <td colSpan={3} style={{ padding: '6px 8px' }}></td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>NOS of PLT/PKG</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#0f766e' }}>
                          {(editingRequest.piItems || []).reduce((sum, it) => sum + (Number(it.cbm) || 0), 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#b45309' }}>
                          {(editingRequest.piItems || []).reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0)} kg
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#b45309' }}>
                          {(editingRequest.piItems || []).reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0)} kg
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 💰 실행/정산 원가 (수입관리 전용) — 견적 시점 예상원가와 별개로, 실제 청구서 기준 확정 금액을 입력하고
                  "정산완료" 시 상품 DB와 연결된 품목마다 원가 이력으로 자동 반영한다. */}
              {!isQuoteMode && editingRequest && (() => {
                const acb = editingRequest.actualCostBreakdown || {};
                const {
                  goodsAmountKrw, freightKrw, insuranceKrw, originInlandKrw,
                  cifKrw, customsDuty, totalImportCost, unitCost
                } = calculateTotalCostHelper(acb, editingRequest.piItems || []);
                const linkedCount = (editingRequest.piItems || []).filter(it => !!it.productId).length;
                const setAcb = (nextB: any) => setEditingRequest(p => p ? ({ ...p, actualCostBreakdown: nextB }) : null);

                return (
                  <div style={{ background: '#fff', padding: '20px', borderRadius: '4px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b' }}>
                        💰 실행/정산 원가 (Actual Cost Settlement)
                        {editingRequest.settlementCompleted && (
                          <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '2px 8px' }}>
                            ✅ 정산완료 {editingRequest.settledAt ? `(${editingRequest.settledAt})` : ''}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsActualCostTableExpanded(!isActualCostTableExpanded)}
                        style={{ padding: '4px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', fontWeight: 650, color: '#475569', cursor: 'pointer' }}
                      >
                        {isActualCostTableExpanded ? '상세 접기 ▴' : '상세 펼치기 ▾'}
                      </button>
                    </div>
                    <p style={{ margin: 0, fontSize: '11.5px', color: '#64748b' }}>
                      견적 시점 예상원가와 별개로, 실제 청구서(운임/보험/관세/통관비 등)를 기준으로 확정 금액을 입력하세요.
                      입력 후 "정산완료 & 상품원가 반영"을 누르면 아래 품목 중 상품 DB와 연결된 항목({linkedCount}개)의 단위당 수입원가 이력에 자동으로 기록됩니다.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', background: '#f8fafc', padding: '12px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>실제 적용환율</label>
                        <input type="number" value={acb.appliedExchangeRate || ''} onChange={e => setAcb({ ...acb, appliedExchangeRate: Number(e.target.value) || 0 })}
                          style={{ height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, padding: '0 8px', outline: 'none' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>인코텀즈</label>
                        <select value={acb.incoterms || 'FOB'} onChange={e => setAcb({ ...acb, incoterms: e.target.value })}
                          style={{ height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, padding: '0 8px', outline: 'none', background: '#fff' }}>
                          <option value="EXW">EXW</option>
                          <option value="FOB">FOB</option>
                          <option value="CIF">CIF</option>
                          <option value="DDP">DDP</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>실제 청구 물품금액 (USD)</label>
                        <input type="number" value={acb.buyingPriceUsd || ''} onChange={e => setAcb({ ...acb, buyingPriceUsd: Number(e.target.value) || 0 })}
                          style={{ height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, padding: '0 8px', outline: 'none' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>수량</label>
                        <input type="number" value={acb.buyingQty || ''} onChange={e => setAcb({ ...acb, buyingQty: Number(e.target.value) || 0 })}
                          style={{ height: '34px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, padding: '0 8px', outline: 'none' }} />
                      </div>
                    </div>

                    {isActualCostTableExpanded && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', height: '32px' }}>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: '12.5px', fontWeight: 750, color: '#475569' }}>항목</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', width: '160px', fontSize: '12.5px', fontWeight: 750, color: '#475569' }}>입력값</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right', fontSize: '12.5px', fontWeight: 750, color: '#475569' }}>계산금액 (KRW)</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr style={{ borderBottom: '1px solid #f1f5f9', height: '32px', fontSize: '12.5px' }}>
                              <td style={{ fontWeight: 600, color: '#334155' }}>물품금액 (Invoice Amount)</td>
                              <td style={{ color: '#64748b' }}>-</td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{goodsAmountKrw.toLocaleString()} 원</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #f1f5f9', height: '32px', fontSize: '12.5px' }}>
                              <td style={{ fontWeight: 600, color: '#334155' }}>실제 국제운임 ($)</td>
                              <td style={{ padding: '2px 4px' }}>
                                <input type="number" value={acb.freightUsd || ''} onChange={e => setAcb({ ...acb, freightUsd: Number(e.target.value) || 0 })}
                                  style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', boxSizing: 'border-box' }} />
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{freightKrw.toLocaleString()} 원</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #f1f5f9', height: '32px', fontSize: '12.5px' }}>
                              <td style={{ fontWeight: 600, color: '#334155' }}>실제 보험료 ($)</td>
                              <td style={{ padding: '2px 4px' }}>
                                <input type="number" value={acb.insuranceUsd || ''} onChange={e => setAcb({ ...acb, insuranceUsd: Number(e.target.value) || 0 })}
                                  style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', boxSizing: 'border-box' }} />
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{insuranceKrw.toLocaleString()} 원</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #f1f5f9', height: '32px', fontSize: '12.5px' }}>
                              <td style={{ fontWeight: 600, color: '#334155' }}>수출국 내륙운송·수출비 ($)</td>
                              <td style={{ padding: '2px 4px' }}>
                                <input type="number" value={acb.originInlandUsd || ''} onChange={e => setAcb({ ...acb, originInlandUsd: Number(e.target.value) || 0 })}
                                  style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', boxSizing: 'border-box' }} />
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{originInlandKrw.toLocaleString()} 원</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #cbd5e1', background: '#f8fafc', height: '32px', fontSize: '12.5px' }}>
                              <td style={{ fontWeight: 800, color: '#0f172a' }}>CIF 과세가격</td>
                              <td style={{ color: '#475569', fontSize: '11px' }}>자동</td>
                              <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{cifKrw.toLocaleString()} 원</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #f1f5f9', height: '32px', fontSize: '12.5px' }}>
                              <td style={{ fontWeight: 600, color: '#334155' }}>실제 관세율 (%)</td>
                              <td style={{ padding: '2px 4px' }}>
                                <input type="number" value={acb.ftaTaxRate || ''} onChange={e => setAcb({ ...acb, ftaTaxRate: Number(e.target.value) || 0 })}
                                  style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }} />
                              </td>
                              <td style={{ textAlign: 'right', color: '#64748b' }}>-</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #f1f5f9', height: '32px', fontSize: '12.5px' }}>
                              <td style={{ fontWeight: 600, color: '#334155' }}>관세 (자동)</td>
                              <td style={{ color: '#475569', fontSize: '11px' }}>CIF × 관세율</td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{customsDuty.toLocaleString()} 원</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #f1f5f9', height: '32px', fontSize: '12.5px' }}>
                              <td style={{ fontWeight: 600, color: '#334155' }}>실제 통관비</td>
                              <td style={{ padding: '2px 4px' }}>
                                <input type="number" value={acb.clearanceFee || ''} onChange={e => setAcb({ ...acb, clearanceFee: Number(e.target.value) || 0 })}
                                  style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(acb.clearanceFee || 0).toLocaleString()} 원</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #f1f5f9', height: '32px', fontSize: '12.5px' }}>
                              <td style={{ fontWeight: 600, color: '#334155' }}>실제 항만·공항비용</td>
                              <td style={{ padding: '2px 4px' }}>
                                <input type="number" value={acb.portFee || ''} onChange={e => setAcb({ ...acb, portFee: Number(e.target.value) || 0 })}
                                  style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(acb.portFee || 0).toLocaleString()} 원</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #f1f5f9', height: '32px', fontSize: '12.5px' }}>
                              <td style={{ fontWeight: 600, color: '#334155' }}>실제 국내운송비</td>
                              <td style={{ padding: '2px 4px' }}>
                                <input type="number" value={acb.domesticTransportFee || ''} onChange={e => setAcb({ ...acb, domesticTransportFee: Number(e.target.value) || 0 })}
                                  style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(acb.domesticTransportFee || 0).toLocaleString()} 원</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #f1f5f9', height: '32px', fontSize: '12.5px' }}>
                              <td style={{ fontWeight: 600, color: '#334155' }}>실제 하역·장비비</td>
                              <td style={{ padding: '2px 4px' }}>
                                <input type="number" value={acb.handlingFee || ''} onChange={e => setAcb({ ...acb, handlingFee: Number(e.target.value) || 0 })}
                                  style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(acb.handlingFee || 0).toLocaleString()} 원</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #cbd5e1', height: '32px', fontSize: '12.5px' }}>
                              <td style={{ fontWeight: 600, color: '#334155' }}>기타 비용</td>
                              <td style={{ padding: '2px 4px' }}>
                                <input type="number" value={acb.otherFee || ''} onChange={e => setAcb({ ...acb, otherFee: Number(e.target.value) || 0 })}
                                  style={{ width: '100%', height: '26px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', padding: '0 4px', outline: 'none', textAlign: 'right', boxSizing: 'border-box' }} />
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{(acb.otherFee || 0).toLocaleString()} 원</td>
                            </tr>
                            <tr style={{ background: '#eff6ff', height: '36px', fontSize: '13px' }}>
                              <td style={{ fontWeight: 800, color: '#1e3a8a' }}>총 실행원가 (Total Actual Cost)</td>
                              <td style={{ color: '#475569', fontSize: '11px' }}>자동 계산</td>
                              <td style={{ textAlign: 'right', fontWeight: 800, color: '#1e3a8a' }}>{totalImportCost.toLocaleString()} 원</td>
                            </tr>
                            <tr style={{ background: '#fefce8', height: '36px', fontSize: '13px' }}>
                              <td style={{ fontWeight: 800, color: '#b45309' }}>단위당 실행원가</td>
                              <td style={{ color: '#475569', fontSize: '11px' }}>총 실행원가 ÷ 수량</td>
                              <td style={{ textAlign: 'right', fontWeight: 800, color: '#b45309' }}>{unitCost.toLocaleString()} 원</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    )}

                    {editingRequest.costBreakdown?.appliedExchangeRate ? (() => {
                      const { totalImportCost: quotedTotal } = calculateTotalCostHelper(editingRequest.costBreakdown || {}, editingRequest.piItems || []);
                      const diffRate = quotedTotal > 0 ? Math.round(((totalImportCost - quotedTotal) / quotedTotal) * 1000) / 10 : 0;
                      return (
                        <div style={{ fontSize: '12px', color: diffRate > 5 ? '#dc2626' : '#475569', background: diffRate > 5 ? '#fef2f2' : '#f8fafc', border: `1px solid ${diffRate > 5 ? '#fecaca' : '#e2e8f0'}`, borderRadius: '4px', padding: '8px 10px' }}>
                          견적원가 {quotedTotal.toLocaleString()}원 대비 실행원가 오차율: <b>{diffRate > 0 ? '+' : ''}{diffRate}%</b>
                          {diffRate > 5 && ' — 마진 감소 가능성이 있으니 확인해주세요.'}
                        </div>
                      );
                    })() : null}

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={handleSettleImportCost}
                        style={{ padding: '10px 18px', background: '#16a34a', border: 'none', color: '#fff', borderRadius: '6px', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        ✅ 정산완료 & 상품원가 반영 ({linkedCount}개 품목)
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* 📥 해외공급사 견적 비교 & 원가/마진 산정 통합 세션 (isQuoteMode 전용) */}
              {isQuoteMode && editingRequest && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '2px solid #e2e8f0', paddingTop: '16px', marginTop: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {renderCostCalculatorTable(
                      editingRequest,
                      (nextB) => {
                        setEditingRequest(p => p ? recalculateEditCosts(p, nextB) : null);
                      },
                      (rate) => {
                        setEditingRequest(p => {
                          if (!p) return null;
                          const totalCost = calculateEditTotalCost(p);
                          const marginAmount = Math.round(totalCost * (rate / 100));
                          return { ...p, marginRate: rate, marginAmount, customerQuoteAmount: totalCost + marginAmount };
                        });
                      }
                    )}

                    <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px', gridColumn: 'span 2' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-default)', paddingBottom: '4px' }}>고객사 진행 결정 (수입확정여부)</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <select
                          value={editingRequest.customerDecision || '검토중'}
                          onChange={(e) => {
                            const val = e.target.value as any;
                            const nextStatus = val === '승인' ? '발주 진행' : '진행 결정 요청';
                            setEditingRequest(p => p ? ({ ...p, customerDecision: val, status: nextStatus }) : null);
                          }}
                          style={{ padding: '4px 6px', border: '1px solid var(--border-default)', borderRadius: '4px', fontSize: '12px', outline: 'none', background: '#fff' }}
                        >
                          <option value="검토중">검토중 (Under Review)</option>
                          <option value="승인">승인 (Approved - 실무 진행)</option>
                          <option value="반려">반려 (Rejected)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 하단 제어 */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button 
                  type="button" 
                  onClick={() => { setShowEditModal(false); setEditingRequest(null); }}
                  style={{ padding: '8px 16px', background: '#f1f5f9', border: 'none', color: 'var(--text-secondary)', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
                >
                  취소
                </button>
                <button 
                  type="submit"
                  style={{ padding: '8px 16px', background: '#2563eb', border: 'none', color: '#fff', borderRadius: '6px', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
                >
                  수정완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🔍 바이어(최종고객) 검색 모달 */}
      {showCustomerModal && (
        <CustomerSearchModal
          customers={customers}
          onClose={() => setShowCustomerModal(false)}
          onSelect={(cust) => {
            setEditingRequest(p => p ? ({ ...p, finalCustomer: cust.name }) : null);
            setShowCustomerModal(false);
          }}
        />
      )}
    </div>
  );
};
