import React, { useState } from 'react';
import type { ScreenMockupConfig, PortalFieldStep } from '../constants/portalGuides';

interface PortalScreenMockupProps {
  mockup?: ScreenMockupConfig;
  fieldSteps?: PortalFieldStep[];
  portalId: string;
}

export const PortalScreenMockup: React.FC<PortalScreenMockupProps> = ({
  mockup,
  fieldSteps,
  portalId
}) => {
  const [activePin, setActivePin] = useState<number | null>(1);

  if (!mockup && (!fieldSteps || fieldSteps.length === 0)) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '28px' }}>
      {/* ── 1. 실제 화면 레이아웃 & 번호 핀 시각화 (Interactive Screen Mockup) ── */}
      {mockup && (
        <div style={{
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)'
        }}>
          {/* Mockup Window Header Bar */}
          <div style={{
            background: '#1e293b',
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #334155'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
              <span style={{ marginLeft: '8px', fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                🖥️ {mockup.screenName} (화면 예시)
              </span>
            </div>
            <div style={{
              background: '#0f172a',
              color: '#94a3b8',
              fontSize: '10.5px',
              padding: '2px 10px',
              borderRadius: '12px',
              fontFamily: 'monospace'
            }}>
              💡 번호 핀(①, ②, ③...)을 누르면 해당 입력 위치와 사용방법이 강조됩니다
            </div>
          </div>

          {/* Render Mockup based on Type */}
          <div style={{ padding: '16px', backgroundColor: '#f1f5f9' }}>
            {mockup.mockupType === 'order_tab_info' && (
              <OrderTabInfoMockup activePin={activePin} onSelectPin={setActivePin} />
            )}
            {mockup.mockupType === 'order_tab_sourcing' && (
              <OrderTabSourcingMockup activePin={activePin} onSelectPin={setActivePin} />
            )}
            {mockup.mockupType === 'order_tab_shipping' && (
              <OrderTabShippingMockup activePin={activePin} onSelectPin={setActivePin} />
            )}
            {mockup.mockupType === 'order_tab_customs' && (
              <OrderTabCustomsMockup activePin={activePin} onSelectPin={setActivePin} />
            )}
            {mockup.mockupType === 'order_tab_settlement' && (
              <OrderTabSettlementMockup activePin={activePin} onSelectPin={setActivePin} />
            )}
            {portalId === 'orders-detail' && (!mockup.mockupType || mockup.mockupType === 'order_detail') && (
              <OrderDetailMockup activePin={activePin} onSelectPin={setActivePin} />
            )}
            {portalId === 'proforma-invoices' && (
              <PiFormMockup activePin={activePin} onSelectPin={setActivePin} />
            )}
            {portalId === 'dashboard' && (
              <DashboardMockup activePin={activePin} onSelectPin={setActivePin} />
            )}
            {portalId === 'orders' && (
              <OrdersListMockup activePin={activePin} onSelectPin={setActivePin} />
            )}
            {portalId !== 'orders-detail' && portalId !== 'proforma-invoices' && portalId !== 'dashboard' && portalId !== 'orders' && !mockup.mockupType?.startsWith('order_tab_') && (
              <GenericPortalMockup mockup={mockup} activePin={activePin} onSelectPin={setActivePin} />
            )}
          </div>

          {/* Callouts Explanation Panel under Mockup */}
          <div style={{
            padding: '14px 18px',
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '10px'
          }}>
            {mockup.callouts.map(callout => {
              const isSelected = activePin === callout.pin;
              return (
                <div
                  key={callout.pin}
                  onClick={() => setActivePin(callout.pin)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: isSelected ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                    backgroundColor: isSelected ? '#eff6ff' : '#f8fafc',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: isSelected ? '#2563eb' : '#64748b',
                      color: '#ffffff',
                      fontSize: '11px',
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {callout.pin}
                    </span>
                    <span style={{ fontSize: '12.5px', fontWeight: 800, color: isSelected ? '#1e40af' : '#1e293b' }}>
                      {callout.title}
                    </span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: '1.45' }}>
                    {callout.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 2. 필드별 입력 가이드 & 방법 (Field-by-Field Input Walkthrough) ── */}
      {fieldSteps && fieldSteps.length > 0 && (
        <div style={{
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: '#ffffff'
        }}>
          <div style={{
            background: '#fafafa',
            padding: '12px 18px',
            borderBottom: '1px solid #cbd5e1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>📝</span>
              <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: 800, color: '#1e293b' }}>
                단계별 화면 입력 가이드 & 처리 방법 (어떻게 입력하나요?)
              </h4>
            </div>
            <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
              실제 입력란과 버튼 조작 절차 가이드
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'center', width: '70px', fontWeight: 750, color: '#475569' }}>순서</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', width: '160px', fontWeight: 750, color: '#475569' }}>입력 항목 (위치)</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', width: '160px', fontWeight: 750, color: '#475569' }}>입력 예시 값</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 750, color: '#475569' }}>입력 방법 및 버튼 조작 상세 설명</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center', width: '90px', fontWeight: 750, color: '#475569' }}>구분</th>
                </tr>
              </thead>
              <tbody>
                {fieldSteps.map((step, idx) => (
                  <tr 
                    key={idx}
                    style={{ 
                      borderBottom: '1px solid #f1f5f9',
                      backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafafa'
                    }}
                  >
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{
                        background: '#eff6ff',
                        color: '#2563eb',
                        border: '1px solid #bfdbfe',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 800
                      }}>
                        {step.stepNo}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 750, color: '#1e293b' }}>
                      <div>{step.title}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>{step.field}</div>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#0369a1', fontFamily: 'monospace', fontWeight: 700 }}>
                      <code style={{ background: '#f0f9ff', padding: '2px 6px', borderRadius: '4px', border: '1px solid #bae6fd' }}>
                        {step.exampleValue}
                      </code>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#334155', lineHeight: '1.55' }}>
                      {step.actionGuide}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 750,
                        background: step.required === true ? '#fef2f2' : step.required === '자동계산' ? '#f0fdf4' : '#f8fafc',
                        color: step.required === true ? '#dc2626' : step.required === '자동계산' ? '#166534' : '#64748b',
                        border: `1px solid ${step.required === true ? '#fecaca' : step.required === '자동계산' ? '#bbf7d0' : '#e2e8f0'}`
                      }}>
                        {step.required === true ? '필수 입력' : step.required === '자동계산' ? '자동 계산' : '선택'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Specific Screen Mockups for Tab Guides ── */

/* 1. 수주정보 탭 Mockup */
const OrderTabInfoMockup: React.FC<{ activePin: number | null; onSelectPin: (p: number) => void }> = ({ activePin, onSelectPin }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
      {/* Header & Sub-Tab indicator */}
      <div style={{ background: '#ffffff', borderRadius: '6px', padding: '10px 14px', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e293b' }}>📦 PO-2026-UNG-01</span>
          <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: 800, fontSize: '11px' }}>수주진행</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['1. 수주정보', '2. 소싱/발주', '3. 소싱/선적', '4. 통관서류', '5. 원가/이익'].map((t, idx) => (
            <span
              key={idx}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                background: idx === 0 ? '#3b82f6' : '#f1f5f9',
                color: idx === 0 ? '#ffffff' : '#64748b',
                fontWeight: 750,
                fontSize: '11px',
                border: idx === 0 ? '1px solid #2563eb' : '1px solid #e2e8f0'
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Basic Info Form Grid */}
      <div style={{ background: '#ffffff', borderRadius: '6px', padding: '14px', border: '1px solid #cbd5e1', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {/* Pin 1: Buyer selection */}
        <div
          onClick={() => onSelectPin(1)}
          style={{
            padding: '8px',
            borderRadius: '6px',
            border: activePin === 1 ? '2px solid #2563eb' : '1px solid #cbd5e1',
            background: activePin === 1 ? '#eff6ff' : '#f8fafc',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>고객사 (바이어) *</span>
            <PinBadge num={1} active={activePin === 1} />
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input readOnly value="United Neama Group (UNG)" style={{ flex: 1, height: '28px', fontSize: '12px', fontWeight: 700, padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff' }} />
            <button style={{ height: '28px', padding: '0 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>검색</button>
          </div>
        </div>

        {/* Pin 2: Lead time & 추후통보 */}
        <div
          onClick={() => onSelectPin(2)}
          style={{
            padding: '8px',
            borderRadius: '6px',
            border: activePin === 2 ? '2px solid #2563eb' : '1px solid #cbd5e1',
            background: activePin === 2 ? '#eff6ff' : '#f8fafc',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>요청 납기일 *</span>
            <PinBadge num={2} active={activePin === 2} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input readOnly value="2026-10-31" style={{ flex: 1, height: '28px', fontSize: '12px', fontWeight: 700, padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#fff' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 750, color: '#1d4ed8', background: '#dbeafe', padding: '4px 6px', borderRadius: '4px', cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked /> 추후통보
            </label>
          </div>
        </div>

        {/* Pin 3: Incoterms & Payment */}
        <div
          onClick={() => onSelectPin(3)}
          style={{
            padding: '8px',
            borderRadius: '6px',
            border: activePin === 3 ? '2px solid #2563eb' : '1px solid #cbd5e1',
            background: activePin === 3 ? '#eff6ff' : '#f8fafc',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>인코텀즈 & 결제조건 *</span>
            <PinBadge num={3} active={activePin === 3} />
          </div>
          <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#1e293b', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '5px 8px' }}>
            FOB BUSAN | T/T 30% Adv, 70% BL
          </div>
        </div>
      </div>

      {/* Pin 4: Order Items Table */}
      <div
        onClick={() => onSelectPin(4)}
        style={{
          background: '#ffffff',
          borderRadius: '6px',
          border: activePin === 4 ? '2px solid #2563eb' : '1px solid #cbd5e1',
          overflow: 'hidden',
          cursor: 'pointer'
        }}
      >
        <div style={{ background: '#f8fafc', padding: '8px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '12.5px' }}>수주 품목 내역</span>
            <PinBadge num={4} active={activePin === 4} />
          </div>
          <span style={{ fontWeight: 800, color: '#2563eb', fontSize: '12px' }}>총 수주액: USD $45,000.00</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
              <th style={{ padding: '6px 10px', textAlign: 'left' }}>품목명 / 규격</th>
              <th style={{ padding: '6px 10px', textAlign: 'center' }}>수량</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>외화 단가</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>외화 금액</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '6px 10px', fontWeight: 700 }}>HEX HEAD BOLT SET M16 x 80mm</td>
              <td style={{ padding: '6px 10px', textAlign: 'center' }}>10,000 PCS</td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>$0.450</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>$4,500.00</td>
            </tr>
            <tr>
              <td style={{ padding: '6px 10px', fontWeight: 700 }}>STAINLESS WASHER M16</td>
              <td style={{ padding: '6px 10px', textAlign: 'center' }}>20,000 PCS</td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>$0.050</td>
              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700 }}>$1,000.00</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* 2. 소싱/발주 탭 Mockup */
const OrderTabSourcingMockup: React.FC<{ activePin: number | null; onSelectPin: (p: number) => void }> = ({ activePin, onSelectPin }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
      {/* Header & Sub-Tab indicator */}
      <div style={{ background: '#ffffff', borderRadius: '6px', padding: '10px 14px', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e293b' }}>📦 PO-2026-UNG-01</span>
          <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 6px', borderRadius: '4px', fontWeight: 800, fontSize: '11px' }}>발주진행</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['1. 수주정보', '2. 소싱/발주', '3. 소싱/선적', '4. 통관서류', '5. 원가/이익'].map((t, idx) => (
            <span
              key={idx}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                background: idx === 1 ? '#3b82f6' : '#f1f5f9',
                color: idx === 1 ? '#ffffff' : '#64748b',
                fontWeight: 750,
                fontSize: '11px',
                border: idx === 1 ? '1px solid #2563eb' : '1px solid #e2e8f0'
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Sourcing Allocation Table */}
      <div style={{ background: '#ffffff', borderRadius: '6px', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
        <div style={{ background: '#f8fafc', padding: '8px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '12.5px' }}>품목별 제조 공급사 배정 및 매입단가</span>
          <span style={{ fontSize: '11px', color: '#64748b' }}>공급사 지정 즉시 발주서 그룹핑</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
          <thead>
            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
              <th style={{ padding: '6px 10px', textAlign: 'left' }}>수주 품목</th>
              <th style={{ padding: '6px 10px', textAlign: 'center' }}>수량</th>
              <th style={{ padding: '6px 10px', textAlign: 'left' }}>공급사 배정 (협력사)</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>매입 단가 (KRW)</th>
              <th style={{ padding: '6px 10px', textAlign: 'right' }}>매입 총액</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px 10px', fontWeight: 700 }}>HEX HEAD BOLT SET M16x80</td>
              <td style={{ padding: '8px 10px', textAlign: 'center' }}>10,000 PCS</td>
              <td style={{ padding: '8px 10px', cursor: 'pointer' }} onClick={() => onSelectPin(1)}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: activePin === 1 ? '#eff6ff' : '#fff', border: activePin === 1 ? '2px solid #2563eb' : '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px' }}>
                  <span>🏭 대한볼트산업 ▼</span>
                  <PinBadge num={1} active={activePin === 1} />
                </div>
              </td>
              <td style={{ padding: '8px 10px', textAlign: 'right', cursor: 'pointer' }} onClick={() => onSelectPin(2)}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <code style={{ background: activePin === 2 ? '#fef08a' : '#f0f9ff', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, color: '#0369a1' }}>₩420</code>
                  <PinBadge num={2} active={activePin === 2} />
                </div>
              </td>
              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>₩4,200,000</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Supplier PO Card */}
      <div style={{ background: '#ffffff', borderRadius: '6px', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
        <div style={{ background: '#f8fafc', padding: '8px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '13px' }}>🏭 대한볼트산업 발주서 (PO-2026-UNG-01-S01)</span>
            <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700 }}>
              입고요청일: 추후통보
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {/* Pin 3: 발주서 발행 */}
            <span
              onClick={() => onSelectPin(3)}
              style={{
                background: '#2563eb',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '4px',
                fontWeight: 700,
                fontSize: '11px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                border: activePin === 3 ? '2px solid #ef4444' : 'none'
              }}
            >
              <span>📄 발주서 발행</span>
              <PinBadge num={3} active={activePin === 3} />
            </span>

            {/* Pin 4: 메일/카톡 발송 */}
            <span
              onClick={() => onSelectPin(4)}
              style={{
                background: '#f0fdf4',
                border: activePin === 4 ? '2px solid #ef4444' : '1px solid #bbf7d0',
                color: '#15803d',
                padding: '4px 6px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px'
              }}
            >
              <span>✉️ 메일 발송</span>
              <PinBadge num={4} active={activePin === 4} />
            </span>
            <span style={{ background: '#FEE500', color: '#191919', padding: '4px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
              카톡 발송
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* 3. 소싱/선적 탭 Mockup (패킹 및 컨테이너로딩플랜 & 도착보고 상관관계) */
const OrderTabShippingMockup: React.FC<{ activePin: number | null; onSelectPin: (p: number) => void }> = ({ activePin, onSelectPin }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
      {/* 1. Header & Main Tab Switcher */}
      <div style={{ background: '#ffffff', borderRadius: '6px', padding: '10px 14px', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e293b' }}>📦 PO-2026-UNG-01</span>
          <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: '4px', fontWeight: 800, fontSize: '11px' }}>선적준비</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['1. 수주정보', '2. 소싱/발주', '3. 소싱/선적', '4. 통관서류', '5. 원가/이익'].map((t, idx) => (
            <span
              key={idx}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                background: idx === 2 ? '#3b82f6' : '#f1f5f9',
                color: idx === 2 ? '#ffffff' : '#64748b',
                fontWeight: 750,
                fontSize: '11px',
                border: idx === 2 ? '1px solid #2563eb' : '1px solid #e2e8f0'
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* 2. Top Shipment Round Bar & Sub-Tabs */}
      <div style={{ background: '#ffffff', borderRadius: '6px', padding: '10px 14px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Shipment Round Selection (Pin 1) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => onSelectPin(1)}>
            <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>선적 차수 선택:</span>
            <span style={{ background: '#2563eb', color: '#ffffff', padding: '3px 10px', borderRadius: '4px', fontWeight: 750, fontSize: '11px' }}>
              1차 선적 (2026-10-04)
            </span>
            <span style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#1d4ed8', padding: '3px 8px', borderRadius: '4px', fontWeight: 750, fontSize: '11px' }}>
              + 분할 선적 추가
            </span>
            <PinBadge num={1} active={activePin === 1} />
          </div>
          <span style={{ fontSize: '11px', color: '#64748b', background: '#f8fafc', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
            단일 선적 모드
          </span>
        </div>

        {/* 3-Tab Sub Navigation bar (Pin 9: 도착보고 상관관계 연계) */}
        <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
          <span style={{ padding: '5px 12px', borderRadius: '4px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 700, fontSize: '11.5px' }}>
            포워딩/운송사 선정
          </span>
          <span style={{ padding: '5px 12px', borderRadius: '4px', background: '#2563eb', color: '#ffffff', fontWeight: 800, fontSize: '11.5px', border: '1px solid #1d4ed8', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>📦 패킹 및 컨테이너로딩플랜</span>
            <span style={{ background: '#1d4ed8', padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>현재화면</span>
          </span>
          <span
            onClick={() => onSelectPin(9)}
            style={{
              padding: '5px 12px',
              borderRadius: '4px',
              background: activePin === 9 ? '#fef08a' : '#eff6ff',
              border: activePin === 9 ? '2px solid #ef4444' : '1px solid #bfdbfe',
              color: '#1d4ed8',
              fontWeight: 800,
              fontSize: '11.5px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span>🚚 도착보고 (공급사 연계)</span>
            <PinBadge num={9} active={activePin === 9} />
          </span>
        </div>
      </div>

      {/* 3. Global Excel Toolbar & Container Header (Pin 7) */}
      <div style={{ background: '#ffffff', borderRadius: '6px', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
        <div style={{ background: '#f8fafc', padding: '8px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '12.5px' }}>
            📦 컨테이너 로딩 플랜 및 패킹리스트 (자동/수동 편집 지원)
          </span>
          {/* Global Buttons (Pin 7) */}
          <div style={{ display: 'flex', gap: '6px', cursor: 'pointer' }} onClick={() => onSelectPin(7)}>
            <span style={{ background: '#059669', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '11px' }}>
              📊 전체 엑셀 다운로드
            </span>
            <span style={{ background: '#059669', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '11px' }}>
              📥 전체 엑셀 업로드
            </span>
            <span style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '11px' }}>
              + 컨테이너 추가
            </span>
            <PinBadge num={7} active={activePin === 7} />
          </div>
        </div>

        {/* 4. Yellow Formula & Function Guide Box (Pin 2) */}
        <div
          onClick={() => onSelectPin(2)}
          style={{
            margin: '8px 12px',
            padding: '8px 12px',
            background: activePin === 2 ? '#fef08a' : '#fffbeb',
            border: activePin === 2 ? '2px solid #ef4444' : '1px solid #fde68a',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>⚡</span> 중량(NET WT / GROSS WT) 및 CBM 엑셀식 수식 및 함수(ROUNDUP 등) 사용 안내
              <span style={{ color: '#b45309', fontWeight: 500, fontSize: '10px' }}>(대소문자 무관 / 실시간 자동 연산)</span>
            </span>
            <PinBadge num={2} active={activePin === 2} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', fontSize: '10.5px' }}>
            <div style={{ background: '#ffffff', padding: '6px 8px', borderRadius: '4px', border: '1px solid #fde68a' }}>
              <div style={{ fontWeight: 800, color: '#1e40af' }}>🔼 ROUNDUP(값, 자릿수) - 올림</div>
              <div style={{ color: '#475569', marginTop: '2px', fontFamily: 'monospace' }}>=ROUNDUP(1200 * 1.15, 0) ➔ 1,380</div>
            </div>
            <div style={{ background: '#ffffff', padding: '6px 8px', borderRadius: '4px', border: '1px solid #fde68a' }}>
              <div style={{ fontWeight: 800, color: '#0369a1' }}>🔽 ROUNDDOWN(값, 자릿수) - 내림</div>
              <div style={{ color: '#475569', marginTop: '2px', fontFamily: 'monospace' }}>=ROUNDDOWN(1437.29, 0) ➔ 1,437</div>
            </div>
            <div style={{ background: '#ffffff', padding: '6px 8px', borderRadius: '4px', border: '1px solid #fde68a' }}>
              <div style={{ fontWeight: 800, color: '#7c3aed' }}>⚖️ ROUND(값, 자릿수) - 반올림</div>
              <div style={{ color: '#475569', marginTop: '2px', fontFamily: 'monospace' }}>=ROUND(1437.5, 0) ➔ 1,438</div>
            </div>
            <div style={{ background: '#ffffff', padding: '6px 8px', borderRadius: '4px', border: '1px solid #fde68a' }}>
              <div style={{ fontWeight: 800, color: '#b45309' }}>🧮 CBM 및 사칙연산 계산</div>
              <div style={{ color: '#475569', marginTop: '2px', fontFamily: 'monospace' }}>= 1.1 * 1.1 * 1.6 ➔ 1.936 CBM</div>
            </div>
          </div>
        </div>

        {/* 5. Container Bar (Pin 3 & Pin 4) */}
        <div style={{ padding: '6px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Pin 3: Container No & Seal No */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => onSelectPin(3)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>Container No</span>
              <input readOnly value="MSCU1234567" style={{ width: '105px', height: '24px', fontSize: '11.5px', fontWeight: 700, padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569' }}>Seal No</span>
              <input readOnly value="ML-KR98765" style={{ width: '95px', height: '24px', fontSize: '11.5px', fontWeight: 700, padding: '0 6px', border: '1px solid #cbd5e1', borderRadius: '3px', background: '#fff' }} />
            </div>
            <PinBadge num={3} active={activePin === 3} />
          </div>

          {/* Pin 4: Pallet Operation Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => onSelectPin(4)}>
            <span style={{ background: '#0284c7', color: '#fff', padding: '3px 7px', borderRadius: '3px', fontSize: '11px', fontWeight: 700 }}>
              🔗 PALLET 합치기
            </span>
            <span style={{ background: '#6366f1', color: '#fff', padding: '3px 7px', borderRadius: '3px', fontSize: '11px', fontWeight: 700 }}>
              ✂️ PALLET 분할
            </span>
            <span style={{ background: '#475569', color: '#fff', padding: '3px 7px', borderRadius: '3px', fontSize: '11px', fontWeight: 700 }}>
              ↩️ PALLET 원복
            </span>
            <span style={{ background: '#10b981', color: '#fff', padding: '3px 6px', borderRadius: '3px', fontSize: '10.5px', fontWeight: 700 }}>
              📊 엑셀 다운
            </span>
            <span style={{ background: '#059669', color: '#fff', padding: '3px 6px', borderRadius: '3px', fontSize: '10.5px', fontWeight: 700 }}>
              📥 엑셀 업로드
            </span>
            <span style={{ background: '#2563eb', color: '#fff', padding: '3px 6px', borderRadius: '3px', fontSize: '10.5px', fontWeight: 700 }}>
              + 직접 품목 추가
            </span>
            <PinBadge num={4} active={activePin === 4} />
          </div>
        </div>

        {/* 6. Packing List Table (Pin 5 & Pin 6) */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                <th style={{ padding: '6px', textAlign: 'center', width: '24px' }}>☐</th>
                <th style={{ padding: '6px', textAlign: 'center', width: '55px' }}>Pallet No</th>
                <th style={{ padding: '6px', textAlign: 'left' }}>Description of Goods (품명 및 사양)</th>
                <th style={{ padding: '6px', textAlign: 'left', width: '140px' }}>Supplier (유통사)</th>
                <th style={{ padding: '6px', textAlign: 'center', width: '50px' }}>수량</th>
                <th style={{ padding: '6px', textAlign: 'center', width: '45px' }}>PKG수</th>
                <th style={{ padding: '6px', textAlign: 'center', width: '100px' }}>규격 (WxLxH)</th>
                <th style={{ padding: '6px', textAlign: 'center', width: '80px' }}>다단적재/회전</th>
                <th style={{ padding: '6px', textAlign: 'right', width: '65px' }}>NET WT</th>
                <th style={{ padding: '6px', textAlign: 'right', width: '65px' }}>GROSS WT</th>
                <th style={{ padding: '6px', textAlign: 'right', width: '85px' }}>CBM</th>
                <th style={{ padding: '6px', textAlign: 'center', width: '60px' }}>동작</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map(pNum => (
                <tr key={pNum} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '6px', textAlign: 'center' }}>☐</td>
                  <td style={{ padding: '6px', textAlign: 'center', fontWeight: 700 }}>
                    <span style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '1px 5px', borderRadius: '3px' }}>
                      {pNum} 🔼
                    </span>
                  </td>
                  <td style={{ padding: '6px', fontWeight: 650, color: '#1e293b' }}>
                    [P0043] Fibre Glass Cloth(1150mm x 200M)
                  </td>
                  <td style={{ padding: '6px', color: '#1e40af', fontWeight: 700 }}>
                    주식회사 메디치인터내셔널 ✏️
                  </td>
                  <td style={{ padding: '6px', textAlign: 'center', fontWeight: 700 }}>1,000</td>
                  <td style={{ padding: '6px', textAlign: 'center' }}>1</td>
                  <td style={{ padding: '6px', textAlign: 'center', color: '#64748b' }}>
                    1150 x 1250 x 1280
                  </td>
                  {/* Pin 5: 다단적재 & 회전 */}
                  <td style={{ padding: '6px', textAlign: 'center', cursor: 'pointer' }} onClick={() => onSelectPin(5)}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <span style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>🔼</span>
                      <span style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>🔄</span>
                      {pNum === 1 && <PinBadge num={5} active={activePin === 5} />}
                    </div>
                  </td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>1,000</td>
                  <td style={{ padding: '6px', textAlign: 'right' }}>1,020</td>
                  {/* Pin 6: CBM 수식 표기 */}
                  <td style={{ padding: '6px', textAlign: 'right', cursor: 'pointer' }} onClick={() => onSelectPin(6)}>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                      <span style={{ fontWeight: 700, color: '#0f172a' }}>1.900</span>
                      <span style={{ fontSize: '9px', color: '#0369a1', fontFamily: 'monospace' }}>fx:=ROUNDUP(1.15*...</span>
                    </div>
                    {pNum === 1 && <PinBadge num={6} active={activePin === 6} />}
                  </td>
                  <td style={{ padding: '6px', textAlign: 'center', color: '#64748b' }}>
                    ✂️ 📋 🗑️
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                <td colSpan={4} style={{ padding: '8px 10px', color: '#1e293b' }}>
                  합계: 총 5개 항목 (컨테이너 1)
                </td>
                <td style={{ padding: '8px 6px', textAlign: 'center', color: '#2563eb' }}>5,000</td>
                <td style={{ padding: '8px 6px', textAlign: 'center' }}>5</td>
                <td style={{ padding: '8px 6px' }}></td>
                <td style={{ padding: '8px 6px' }}></td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>5,000.0</td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>5,100.0</td>
                <td style={{ padding: '8px 6px', textAlign: 'right', color: '#2563eb' }}>9.500</td>
                <td style={{ padding: '8px 6px' }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 7. Step 3. 3D적재 시뮬레이션 연동 (Pin 8) */}
      <div
        onClick={() => onSelectPin(8)}
        style={{
          background: '#ffffff',
          borderRadius: '6px',
          border: activePin === 8 ? '2px solid #ef4444' : '1px solid #cbd5e1',
          padding: '12px 14px',
          cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '12.5px' }}>
              🚚 Step 3. 3D적재 시뮬레이션 연동
            </span>
            <PinBadge num={8} active={activePin === 8} />
          </div>
          <span style={{ background: '#0284c7', color: '#fff', padding: '4px 12px', borderRadius: '4px', fontWeight: 750, fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span>🚚 3D적재 시뮬레이션 연동 및 적재 검토 실행</span>
          </span>
        </div>
        <div style={{ fontSize: '11px', color: '#475569', lineHeight: '1.45' }}>
          Step 2에서 배정 완료된 패킹리스트 아이템들을 3D 적재 시뮬레이션 프로그램으로 연동하여 최적의 적재율을 검증하고, 배치 결과를 패킹리스트에 가져올 수 있습니다.
        </div>
      </div>

      {/* 8. 패킹플랜 ➔ 도착보고 상관관계 시각화 카드 (Pin 9) */}
      <div
        onClick={() => onSelectPin(9)}
        style={{
          background: '#eff6ff',
          borderRadius: '6px',
          border: activePin === 9 ? '2px solid #2563eb' : '1.5px solid #bfdbfe',
          padding: '12px 14px',
          cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 800, color: '#1e40af', fontSize: '13px' }}>
              🔗 [패킹플랜 ➔ 도착보고 상관관계 & 실시간 파생 흐름]
            </span>
            <span style={{ background: '#2563eb', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 800 }}>
              자동 그룹핑 동기화
            </span>
          </div>
          <PinBadge num={9} active={activePin === 9} />
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>
              🏢 공급사(유통사): 주식회사 메디치인터내셔널
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              패킹리스트 연동 데이터: <strong>5 Pallets (5,000 PCS, N/W 5,000kg, G/W 5,100kg, 9.5 CBM)</strong>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: '#1e3a8a', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
              🔄 패킹리스트 동기화
            </span>
            <span style={{ background: '#8b5cf6', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
              📋 도착보고 미리보기 & PDF
            </span>
            <span style={{ background: '#0284c7', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
              🏷️ 쉬핑마크 미리보기 & PDF
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/* 4. 통관서류 & 선적현황 탭 Mockup */
const OrderTabCustomsMockup: React.FC<{ activePin: number | null; onSelectPin: (p: number) => void }> = ({ activePin, onSelectPin }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
      {/* Header & Sub-Tab indicator */}
      <div style={{ background: '#ffffff', borderRadius: '6px', padding: '10px 14px', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e293b' }}>📦 PO-2026-UNG-01</span>
          <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: 800, fontSize: '11px' }}>통관진행</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['1. 수주정보', '2. 소싱/발주', '3. 소싱/선적', '4. 통관서류', '5. 원가/이익'].map((t, idx) => (
            <span
              key={idx}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                background: idx === 3 ? '#3b82f6' : '#f1f5f9',
                color: idx === 3 ? '#ffffff' : '#64748b',
                fontWeight: 750,
                fontSize: '11px',
                border: idx === 3 ? '1px solid #2563eb' : '1px solid #e2e8f0'
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Pin 1: BL 기준환율 자동조회 */}
      <div
        onClick={() => onSelectPin(1)}
        style={{
          background: '#ffffff',
          borderRadius: '6px',
          padding: '12px 14px',
          border: activePin === 1 ? '2px solid #2563eb' : '1px solid #cbd5e1',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 800, color: '#1e293b' }}>선적일자(ETD):</span>
          <span style={{ background: '#f8fafc', padding: '3px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontFamily: 'monospace', fontWeight: 700 }}>
            2026-10-15
          </span>
          <span style={{ color: '#0369a1', fontWeight: 700, marginLeft: '6px' }}>
            ➔ 적용환율: ₩1,361.30 / USD
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ background: '#0284c7', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontWeight: 750, fontSize: '11px' }}>
            ⚡ BL일자 기준환율 자동조회 (SMBS)
          </span>
          <PinBadge num={1} active={activePin === 1} />
        </div>
      </div>

      {/* Pin 2: B/L 정보 입력란 */}
      <div
        onClick={() => onSelectPin(2)}
        style={{
          background: '#ffffff',
          borderRadius: '6px',
          padding: '12px 14px',
          border: activePin === 2 ? '2px solid #2563eb' : '1px solid #cbd5e1',
          cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '12.5px' }}>B/L 선하증권 및 운송 선사 정보</span>
          <PinBadge num={2} active={activePin === 2} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '6px 8px' }}>
            <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>B/L Number</span>
            <strong style={{ fontSize: '12px', color: '#1e3a8a' }}>HDMU12345678</strong>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '6px 8px' }}>
            <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>Vessel / Voyage</span>
            <strong style={{ fontSize: '12px' }}>HYUNDAI FORWARD 001W</strong>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '6px 8px' }}>
            <span style={{ fontSize: '10.5px', color: '#64748b', display: 'block' }}>Forwarder (물류사)</span>
            <strong style={{ fontSize: '12px' }}>한진물류 (부산사무소)</strong>
          </div>
        </div>
      </div>

      {/* Pin 3: 상업송장(C/I) 및 포장명세서(P/L) */}
      <div
        onClick={() => onSelectPin(3)}
        style={{
          background: '#ffffff',
          borderRadius: '6px',
          padding: '12px 14px',
          border: activePin === 3 ? '2px solid #2563eb' : '1px solid #cbd5e1',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer'
        }}
      >
        <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '12.5px' }}>수출 통관 및 바이어 제출 서류</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ background: '#3b82f6', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '11px' }}>
            📄 C/I (상업송장) 출력
          </span>
          <span style={{ background: '#3b82f6', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '11px' }}>
            📦 P/L (포장명세서) 출력
          </span>
          <PinBadge num={3} active={activePin === 3} />
        </div>
      </div>
    </div>
  );
};

/* 5. 원가/이익 정산 탭 Mockup */
const OrderTabSettlementMockup: React.FC<{ activePin: number | null; onSelectPin: (p: number) => void }> = ({ activePin, onSelectPin }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
      {/* Header & Sub-Tab indicator */}
      <div style={{ background: '#ffffff', borderRadius: '6px', padding: '10px 14px', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#1e293b' }}>📦 PO-2026-UNG-01</span>
          <span style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '2px 6px', borderRadius: '4px', fontWeight: 800, fontSize: '11px' }}>정산완료</span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {['1. 수주정보', '2. 소싱/발주', '3. 소싱/선적', '4. 통관서류', '5. 원가/이익'].map((t, idx) => (
            <span
              key={idx}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                background: idx === 4 ? '#3b82f6' : '#f1f5f9',
                color: idx === 4 ? '#ffffff' : '#64748b',
                fontWeight: 750,
                fontSize: '11px',
                border: idx === 4 ? '1px solid #2563eb' : '1px solid #e2e8f0'
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Settlement 4-Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
        {/* Pin 1: 외화 매출액 및 원화 환산 */}
        <div
          onClick={() => onSelectPin(1)}
          style={{
            background: '#ffffff',
            borderRadius: '6px',
            padding: '12px',
            border: activePin === 1 ? '2px solid #2563eb' : '1px solid #cbd5e1',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 800, color: '#1e40af', fontSize: '12px' }}>💰 1. 총 매출액 (인보이스 기준)</span>
            <PinBadge num={1} active={activePin === 1} />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
            USD $45,000.00
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            원화 환산: <strong>₩61,258,500</strong> (@ ₩1,361.30)
          </div>
        </div>

        {/* Pin 2: 공급사 매입 원가 */}
        <div
          onClick={() => onSelectPin(2)}
          style={{
            background: '#ffffff',
            borderRadius: '6px',
            padding: '12px',
            border: activePin === 2 ? '2px solid #2563eb' : '1px solid #cbd5e1',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 800, color: '#dc2626', fontSize: '12px' }}>🏭 2. 총 매입원가 (공급사)</span>
            <PinBadge num={2} active={activePin === 2} />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
            ₩52,650,000
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            대한볼트 (₩42,000,000) + 한국와셔 (₩10,650,000)
          </div>
        </div>

        {/* Pin 3: 부대비용 (운임, 관세사비) */}
        <div
          onClick={() => onSelectPin(3)}
          style={{
            background: '#ffffff',
            borderRadius: '6px',
            padding: '12px',
            border: activePin === 3 ? '2px solid #2563eb' : '1px solid #cbd5e1',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 800, color: '#d97706', fontSize: '12px' }}>🚢 3. 운임 및 통관 부대비용</span>
            <PinBadge num={3} active={activePin === 3} />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
            ₩2,450,000
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            해상운임: $1,200 (₩1,633,560) + 관세사: ₩150,000 외
          </div>
        </div>

        {/* Pin 4: 최종 순이익 및 마진율 */}
        <div
          onClick={() => onSelectPin(4)}
          style={{
            background: '#f0fdf4',
            borderRadius: '6px',
            padding: '12px',
            border: activePin === 4 ? '2px solid #16a34a' : '1.5px solid #86efac',
            cursor: 'pointer'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontWeight: 800, color: '#166534', fontSize: '12px' }}>📈 4. 최종 공헌이익 & 마진율</span>
            <PinBadge num={4} active={activePin === 4} />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 900, color: '#15803d' }}>
            ₩6,158,500 <span style={{ fontSize: '12px', fontWeight: 700 }}>(10.05%)</span>
          </div>
          <div style={{ fontSize: '11px', color: '#166534', marginTop: '2px' }}>
            매출액 - (매입비 + 부대비용) 차감 후 순이익 확정
          </div>
        </div>
      </div>
    </div>
  );
};

const OrderDetailMockup: React.FC<{ activePin: number | null; onSelectPin: (p: number) => void }> = ({ activePin, onSelectPin }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
      {/* 1. Header & Tab Navigation */}
      <div style={{ background: '#ffffff', borderRadius: '6px', padding: '10px 14px', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 800, fontSize: '14px', color: '#1e293b' }}>📦 주문번호: PO-2026-UNG-01</span>
          <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontWeight: 800, fontSize: '11px' }}>진행중</span>
        </div>
        {/* Tab Mockup */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {['1. 수주정보', '2. 소싱/발주', '3. 소싱/선적', '4. 통관서류', '5. 원가/이익'].map((t, idx) => (
            <span
              key={idx}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                background: idx === 2 ? '#3b82f6' : '#f1f5f9',
                color: idx === 2 ? '#ffffff' : '#64748b',
                fontWeight: 700,
                fontSize: '11.5px',
                border: idx === 2 ? '1px solid #2563eb' : '1px solid #e2e8f0'
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* 2. Top Verification & Action Bar */}
      <div style={{
        background: '#ffffff',
        borderRadius: '6px',
        padding: '10px 14px',
        border: '1px solid #cbd5e1',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: 750, color: '#334155' }}>선적 차수: <strong>1차 선적 (전체 선적)</strong></span>
          <span style={{
            background: activePin === 1 ? '#fef08a' : '#eff6ff',
            color: '#1d4ed8',
            border: '1px solid #bfdbfe',
            padding: '3px 8px',
            borderRadius: '4px',
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer'
          }}
          onClick={() => onSelectPin(1)}
          >
            <span>⚖️ [선적수량 vs 패킹수량 대조 검증]</span>
            <PinBadge num={1} active={activePin === 1} />
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>납기일: <strong>2026-10-31</strong></span>
          <span style={{
            background: activePin === 2 ? '#fef08a' : '#f1f5f9',
            border: '1px solid #cbd5e1',
            padding: '3px 6px',
            borderRadius: '4px',
            fontWeight: 750,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            cursor: 'pointer'
          }}
          onClick={() => onSelectPin(2)}
          >
            <span>☑ 추후통보</span>
            <PinBadge num={2} active={activePin === 2} />
          </span>
        </div>
      </div>

      {/* 3. Supplier Card Mockup with Preview & PDF buttons */}
      <div style={{
        background: '#ffffff',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        overflow: 'hidden',
        boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
      }}>
        {/* Card Header */}
        <div style={{
          background: '#f8fafc',
          padding: '8px 12px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '13px' }}>🚚 대한볼트산업 도착보고서 (PO-2026-UNG-01)</span>
            <span style={{ background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '4px', fontSize: '10.5px', fontWeight: 700 }}>✓ 클라우드 저장됨</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* 도착보고 버튼 그룹 */}
            <div style={{
              display: 'inline-flex',
              borderRadius: '4px',
              border: activePin === 3 ? '2px solid #ef4444' : '1px solid #7c3aed',
              overflow: 'hidden',
              cursor: 'pointer'
            }}
            onClick={() => onSelectPin(3)}
            >
              <span style={{ background: '#8b5cf6', color: '#fff', padding: '4px 8px', fontWeight: 700, fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                📋 도착보고 미리보기
              </span>
              <span style={{ background: '#7c3aed', color: '#fff', padding: '4px 6px', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                📥 PDF 저장 <PinBadge num={3} active={activePin === 3} />
              </span>
            </div>

            {/* 쉬핑마크 버튼 그룹 */}
            <div style={{
              display: 'inline-flex',
              borderRadius: '4px',
              border: activePin === 4 ? '2px solid #ef4444' : '1px solid #0284c7',
              overflow: 'hidden',
              cursor: 'pointer'
            }}
            onClick={() => onSelectPin(4)}
            >
              <span style={{ background: '#0284c7', color: '#fff', padding: '4px 8px', fontWeight: 700, fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                🏷️ 쉬핑마크 미리보기
              </span>
              <span style={{ background: '#0369a1', color: '#fff', padding: '4px 6px', fontWeight: 700, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                📥 PDF 저장 <PinBadge num={4} active={activePin === 4} />
              </span>
            </div>

            <span style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '4px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
              ✉️ 메일 발송
            </span>
            <span style={{ background: '#FEE500', color: '#191919', padding: '4px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
              카톡 발송
            </span>
          </div>
        </div>

        {/* Table Body Preview */}
        <div style={{ padding: '8px 12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                <th style={{ padding: '6px', textAlign: 'left' }}>Marks (쉬핑마크)</th>
                <th style={{ padding: '6px', textAlign: 'left' }}>Description of Goods</th>
                <th style={{ padding: '6px', textAlign: 'center' }}>Q'TY (PCS)</th>
                <th style={{ padding: '6px', textAlign: 'center' }}>포장형태</th>
                <th style={{ padding: '6px', textAlign: 'right' }}>N/W (kg)</th>
                <th style={{ padding: '6px', textAlign: 'right' }}>G/W (kg)</th>
                <th style={{ padding: '6px', textAlign: 'center' }}>적재설정</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '6px' }}><strong>YSACC-01</strong><br /><span style={{ fontSize: '10px', color: '#64748b' }}>PALLET NO: 1/5</span></td>
                <td style={{ padding: '6px' }}>HEX HEAD BOLT & NUT SET M16 x 80mm</td>
                <td style={{ padding: '6px', textAlign: 'center', fontWeight: 700 }}>5,000</td>
                <td style={{ padding: '6px', textAlign: 'center' }}>PLT</td>
                <td style={{ padding: '6px', textAlign: 'right' }}>1,250</td>
                <td style={{ padding: '6px', textAlign: 'right' }}>1,320</td>
                <td style={{ padding: '6px', textAlign: 'center', cursor: 'pointer' }} onClick={() => onSelectPin(5)}>
                  <span style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 4px', borderRadius: '3px', fontSize: '10px', marginRight: '3px' }}>
                    🔼 적재
                  </span>
                  <span style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '2px 4px', borderRadius: '3px', fontSize: '10px' }}>
                    🔄 회전
                  </span>
                  <PinBadge num={5} active={activePin === 5} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Customs & Exchange Rate Section */}
      <div style={{
        background: '#ffffff',
        borderRadius: '6px',
        padding: '10px 14px',
        border: '1px solid #cbd5e1',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'pointer'
      }}
      onClick={() => onSelectPin(6)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 800, color: '#1e293b' }}>⚡ BL 선적일자 기준환율:</span>
          <span style={{ background: '#f8fafc', padding: '2px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontFamily: 'monospace', fontWeight: 700 }}>
            ETD: 2026-10-15 ➔ ₩1,361.3 / USD
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ background: '#0284c7', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontWeight: 750, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span>⚡ BL일자 기준환율 자동조회 (SMBS)</span>
            <PinBadge num={6} active={activePin === 6} />
          </span>
        </div>
      </div>
    </div>
  );
};

const PiFormMockup: React.FC<{ activePin: number | null; onSelectPin: (p: number) => void }> = ({ activePin, onSelectPin }) => {
  return (
    <div style={{ background: '#ffffff', borderRadius: '6px', padding: '14px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
        <span style={{ fontWeight: 800, fontSize: '14px', color: '#1e3a8a' }}>PROFORMA INVOICE 작성 화면</span>
        <span style={{ background: '#2563eb', color: '#fff', padding: '3px 10px', borderRadius: '4px', fontWeight: 750, fontSize: '11.5px', cursor: 'pointer' }} onClick={() => onSelectPin(3)}>
          미리보기 & PDF 다운로드 <PinBadge num={3} active={activePin === 3} />
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
        <div style={{ cursor: 'pointer' }} onClick={() => onSelectPin(1)}>
          <span style={{ color: '#64748b', fontSize: '11px' }}>1. 바이어 선택 *</span>
          <div style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#f8fafc', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
            <span>United Neama Group (UNG)</span>
            <PinBadge num={1} active={activePin === 1} />
          </div>
        </div>
        <div style={{ cursor: 'pointer' }} onClick={() => onSelectPin(2)}>
          <span style={{ color: '#64748b', fontSize: '11px' }}>2. 인코텀즈 & 통화 *</span>
          <div style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#f8fafc', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
            <span>FOB BUSAN / USD ($)</span>
            <PinBadge num={2} active={activePin === 2} />
          </div>
        </div>
        <div>
          <span style={{ color: '#64748b', fontSize: '11px' }}>3. 견적서 번호 (PI No)</span>
          <div style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', background: '#f1f5f9', fontWeight: 700, color: '#0369a1' }}>
            PI-YS-2026-UNG-01
          </div>
        </div>
      </div>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px' }}>
        <span style={{ fontWeight: 800, color: '#334155' }}>견적 품목 테이블</span>
        <div style={{ marginTop: '6px', padding: '6px 8px', background: '#f8fafc', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
          <span>1) HEX BOLT SET M16x80 (10,000 PCS) @ $0.45</span>
          <span style={{ fontWeight: 800, color: '#0f172a' }}>TOTAL: $4,500.00</span>
        </div>
      </div>
    </div>
  );
};

const DashboardMockup: React.FC<{ activePin: number | null; onSelectPin: (p: number) => void }> = ({ activePin, onSelectPin }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
      <div style={{ background: '#ffffff', borderRadius: '6px', padding: '10px 14px', border: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ cursor: 'pointer' }} onClick={() => onSelectPin(1)}>
          <span style={{ fontWeight: 800, color: '#1e293b' }}>💵 서울외국환중개 기준환율: </span>
          <span style={{ color: '#2563eb', fontWeight: 800, marginLeft: '6px' }}>USD ₩1,361.3 (▼-10.9)</span>
          <span style={{ marginLeft: '6px', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '3px', fontSize: '11px', fontWeight: 700 }}>
            📊 차트 보기 <PinBadge num={1} active={activePin === 1} />
          </span>
        </div>
        <div style={{ cursor: 'pointer' }} onClick={() => onSelectPin(2)}>
          <span style={{ background: '#3b82f6', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontWeight: 750, fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <span>+ 새 업무 등록</span>
            <PinBadge num={2} active={activePin === 2} />
          </span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{ background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #fecaca', cursor: 'pointer' }} onClick={() => onSelectPin(3)}>
          <span style={{ fontWeight: 800, color: '#dc2626' }}>Q1. 긴급하고 중요한 업무 (오늘 마감)</span>
          <div style={{ marginTop: '6px', padding: '6px', background: '#fef2f2', borderRadius: '4px', fontSize: '11.5px' }}>
            • UNG-01 선적 서류(B/L, C/I, P/L) 최종 검수 및 바이어 송부 <PinBadge num={3} active={activePin === 3} />
          </div>
        </div>
        <div style={{ background: '#ffffff', padding: '10px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
          <span style={{ fontWeight: 800, color: '#2563eb' }}>Q2. 중요한 프로젝트 업무 (일정 계획)</span>
          <div style={{ marginTop: '6px', padding: '6px', background: '#eff6ff', borderRadius: '4px', fontSize: '11.5px' }}>
            • 2026 하반기 해외 공급사 단가 재계약 건 검토
          </div>
        </div>
      </div>
    </div>
  );
};

const OrdersListMockup: React.FC<{ activePin: number | null; onSelectPin: (p: number) => void }> = ({ activePin, onSelectPin }) => {
  return (
    <div style={{ background: '#ffffff', borderRadius: '6px', padding: '12px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '6px', cursor: 'pointer' }} onClick={() => onSelectPin(1)}>
          <span style={{ background: '#2563eb', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>전체 (12)</span>
          <span style={{ background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>진행중 (8)</span>
          <span style={{ background: '#f1f5f9', color: '#475569', padding: '3px 8px', borderRadius: '4px', fontWeight: 700 }}>선적완료 (4)</span>
          <PinBadge num={1} active={activePin === 1} />
        </div>
        <div style={{ display: 'flex', gap: '6px', cursor: 'pointer' }} onClick={() => onSelectPin(2)}>
          <span style={{ background: '#10b981', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '11px' }}>
            📊 엑셀 다운로드
          </span>
          <span style={{ background: '#3b82f6', color: '#fff', padding: '4px 10px', borderRadius: '4px', fontWeight: 750, fontSize: '11px' }}>
            + 신규 주문 등록
          </span>
          <PinBadge num={2} active={activePin === 2} />
        </div>
      </div>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '4px', padding: '8px', cursor: 'pointer' }} onClick={() => onSelectPin(3)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ fontWeight: 800, color: '#1e3a8a' }}>PO-2026-UNG-01 (United Neama Group)</span>
          <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '1px 6px', borderRadius: '3px', fontSize: '10.5px', fontWeight: 800 }}>
            분할선적 (1/2차 진행중)
          </span>
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
          <span>인코텀즈: FOB BUSAN | 납기: 2026-10-31 | 총액: $45,000.00</span>
          <span style={{ color: '#2563eb', fontWeight: 700 }}>상세보기 ➔ <PinBadge num={3} active={activePin === 3} /></span>
        </div>
      </div>
    </div>
  );
};

const GenericPortalMockup: React.FC<{ mockup: ScreenMockupConfig; activePin: number | null; onSelectPin: (p: number) => void }> = ({ mockup, activePin, onSelectPin }) => {
  return (
    <div style={{ background: '#ffffff', borderRadius: '6px', padding: '14px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
        <span style={{ fontWeight: 800, fontSize: '14px', color: '#1e293b' }}>{mockup.screenName} 조작 화면</span>
        <span style={{ background: '#3b82f6', color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
          포탈 표준 레이아웃
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
        {mockup.callouts.map(callout => (
          <div
            key={callout.pin}
            onClick={() => onSelectPin(callout.pin)}
            style={{
              padding: '10px',
              borderRadius: '6px',
              border: activePin === callout.pin ? '2px solid #2563eb' : '1px solid #cbd5e1',
              background: activePin === callout.pin ? '#eff6ff' : '#f8fafc',
              cursor: 'pointer'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '12px' }}>{callout.title}</span>
              <PinBadge num={callout.pin} active={activePin === callout.pin} />
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>{callout.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* Pin badge helper */
const PinBadge: React.FC<{ num: number; active: boolean }> = ({ num, active }) => (
  <span style={{
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: active ? '#ef4444' : '#2563eb',
    color: '#ffffff',
    fontSize: '10.5px',
    fontWeight: 900,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: '3px',
    boxShadow: active ? '0 0 0 2px #fecaca' : 'none',
    transition: 'all 0.15s ease'
  }}>
    {num}
  </span>
);
