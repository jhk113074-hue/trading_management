import React, { useState, useEffect } from 'react';
import { doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Customer, CustomerContact } from '../types/customer';

interface Props {
  initialCustomer?: Customer;
  onClose: () => void;
}

export const CustomerModal: React.FC<Props> = ({ initialCustomer, onClose }) => {
  const [isSaving, setIsSaving] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'basic' | 'finance' | 'contacts'>('basic');

  // 다중 담당자 임시 추가용 state
  const [newContactName, setNewContactName] = useState('');
  const [newContactPosition, setNewContactPosition] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactRemarks, setNewContactRemarks] = useState('');

  const [formData, setFormData] = useState<Partial<Customer>>({
    customerCode: '', name: '', nameKo: '', countryName: '', city: '',
    representative: '', taxId: '', addressEn: '', phone: '', email: '', website: '',
    preferredIncoterms: 'FOB', shippingPort: '', paymentTerms: '',
    bankName: '', bankAccount: '', swiftCode: '', iban: '', bankHolder: '',
    contacts: [], remarks: ''
  });

  useEffect(() => {
    if (initialCustomer) {
      setFormData({
        ...initialCustomer,
        contacts: initialCustomer.contacts || []
      });
    } else {
      const fetchNextCode = async () => {
        try {
          const snap = await getDocs(collection(db, 'companies', COMPANY_ID, 'customers'));
          let maxNum = 0;
          snap.forEach(d => {
            const code = d.data().customerCode || '';
            if (code.startsWith('CU')) {
              const num = parseInt(code.substring(2), 10);
              if (!isNaN(num) && num > maxNum) maxNum = num;
            }
          });
          const nextCode = 'CU' + String(maxNum + 1).padStart(5, '0');
          setFormData(prev => ({ ...prev, customerCode: nextCode }));
        } catch (e) {
          console.error("Error generating customer code:", e);
        }
      };
      fetchNextCode();
    }
  }, [initialCustomer]);

  const handleChange = (field: keyof Customer, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.customerCode?.trim()) { alert('고객코드는 필수 입력사항입니다.'); return; }
    if (!formData.name?.trim()) { alert('고객명(영문)은 필수 입력사항입니다.'); return; }

    setIsSaving(true);
    try {
      const docId = initialCustomer?.id || formData.customerCode;
      
      // 하위 호환성을 위한 Double Writing 매핑 (대표 담당자 정보를 최상위 단일 필드에 이중 대입)
      let legacyFields = {
        contactPerson: '',
        contactPhone: '',
        contactEmail: ''
      };

      if (formData.contacts && formData.contacts.length > 0) {
        const primary = formData.contacts.find(c => c.isPrimary) || formData.contacts[0];
        legacyFields = {
          contactPerson: primary.name,
          contactPhone: primary.phone || '',
          contactEmail: primary.email || ''
        };
      }

      const finalData: Partial<Customer> = {
        ...formData,
        ...legacyFields,
        updatedAt: serverTimestamp(),
      };

      if (!initialCustomer) {
        finalData.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, 'companies', COMPANY_ID, 'customers', docId), finalData);
      alert('✅ 성공적으로 저장되었습니다.');
      onClose();
    } catch (err: any) {
      alert('❌ 저장 실패: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000 }}>
      <div style={{ background: '#fff', borderRadius: '16px', width: '95%', maxWidth: '800px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafb' }}>
          <div>
            <div style={{ fontSize: '19px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🌐</span>
              {initialCustomer ? 'Edit Customer Spec' : 'Register New Customer'}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
              글로벌 바이어 거래처 마스터 규격 및 소싱 담당망 입체 관리
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>✕</button>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', gap: '6px', background: '#f8fafc', padding: '6px 12px', borderBottom: '1px solid #f1f5f9' }}>
          {[
            { id: 'basic', label: '📋 1. 고객사 및 무역/금융 정보' },
            { id: 'contacts', label: '👥 2. 바이어 담당자 명부 (' + (formData.contacts?.length || 0) + ')' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              style={{
                padding: '8px 16px', fontSize: '12.5px', fontWeight: 700, borderRadius: '8px', cursor: 'pointer', border: 'none',
                background: activeSubTab === tab.id ? '#3b82f6' : 'transparent',
                color: activeSubTab === tab.id ? '#fff' : '#64748b',
                transition: 'all 0.15s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body Container */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, background: '#fff' }}>
          
          {/* TAB 1: Basic Corporate Info */}
          {activeSubTab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                <Input label="고객코드 (자동지정)" value={formData.customerCode} onChange={(v: any) => handleChange('customerCode', v)} disabled={true} placeholder="생성 중..." />
                <Input label="고객명_영문 (필수) ★" value={formData.name} onChange={(v: any) => handleChange('name', v)} placeholder="예: AL BASSAM FACTORIES" labelColor="#2563eb" />
                <Input label="고객약자 (Abbreviation)" value={formData.nameKo} onChange={(v: any) => handleChange('nameKo', v)} placeholder="예: AL-BASSAM" />
                <Input label="대표자 (Representative)" value={formData.representative} onChange={(v: any) => handleChange('representative', v)} placeholder="CEO / President Name" />
                <Input label="국가명" value={formData.countryName} onChange={(v: any) => handleChange('countryName', v)} placeholder="예: UAE, Kuwait" />
                <Input label="도시 (City)" value={formData.city} onChange={(v: any) => handleChange('city', v)} placeholder="예: Dubai" />
                <Input label="회사 유선전화" value={formData.phone} onChange={(v: any) => handleChange('phone', v)} placeholder="+971-4-XXX-XXXX" />
                <Input label="대표 이메일" value={formData.email} onChange={(v: any) => handleChange('email', v)} type="email" placeholder="info@company.com" />
                <div style={{ gridColumn: 'span 2' }}>
                  <Input label="공식 웹사이트 (Website)" value={formData.website} onChange={(v: any) => handleChange('website', v)} placeholder="https://www.company.com" />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <Input label="영문 주소 (Corporate Address)" value={formData.addressEn} onChange={(v: any) => handleChange('addressEn', v)} placeholder="Full street address, ZIP Code" />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Shipping / Finance Info (integrated into Tab 1) */}
          {activeSubTab === 'basic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {/* 무역/선적 조건 카드 */}
              <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#1d4ed8', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>🚢</span> 무역 거래 및 물류 조건
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                  <Select label="기본 인도조건 (Incoterms)" value={formData.preferredIncoterms} onChange={(v: any) => handleChange('preferredIncoterms', v)} options={['FOB', 'EXW', 'CIF', 'CFR', 'FCA', 'CPT', 'CIP', 'DAP', 'DDP']} />
                  <Input label="Destination Port (목적항)" value={formData.shippingPort} onChange={(v: any) => handleChange('shippingPort', v)} placeholder="예: JEBEL ALI PORT, KUWAIT PORT" />
                  <div style={{ gridColumn: 'span 2' }}>
                    <Input label="Payment Terms (결제조건)" value={formData.paymentTerms} onChange={(v: any) => handleChange('paymentTerms', v)} placeholder="예: 100% LC at sight / NET 30 Days" />
                  </div>
                </div>
              </div>

              {/* 세무 및 금융 계좌 카드 */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#475569', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>💰</span> 세무 등록 및 송금 계좌 정보
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                  <Input label="TAX-ID / VAT Number" value={formData.taxId} onChange={(v: any) => handleChange('taxId', v)} placeholder="예: VAT123456789" />
                  <Input label="수취 은행명 (Bank Name)" value={formData.bankName} onChange={(v: any) => handleChange('bankName', v)} placeholder="예: HSBC Dubai" />
                  <Input label="송금 계좌번호 (Account Number)" value={formData.bankAccount} onChange={(v: any) => handleChange('bankAccount', v)} placeholder="예: 001-XXXXXX-001" />
                  <Input label="예금주 (Account Holder)" value={formData.bankHolder} onChange={(v: any) => handleChange('bankHolder', v)} placeholder="예: AL BASSAM LTD" />
                  <Input label="SWIFT Code" value={formData.swiftCode} onChange={(v: any) => handleChange('swiftCode', v)} placeholder="예: HSBCUAEAXXX" />
                  <Input label="IBAN Number" value={formData.iban} onChange={(v: any) => handleChange('iban', v)} placeholder="예: AE93XXXXXXXXXXXXXXXX" />
                </div>
              </div>

              {/* 기타 비고 */}
              <Input label="바이어 특이사항 / 비고 (Remarks)" value={formData.remarks} onChange={(v: any) => handleChange('remarks', v)} placeholder="바이어 신용도, 특이 요구조건 등" />
            </div>
          )}

          {/* TAB 3: Multiple Contacts */}
          {activeSubTab === 'contacts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* 담당자 신규 등록 폼 */}
              <div style={{ background: '#faf5ff', border: '1px solid #f3e8ff', borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#7e22ce', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>➕</span> 신규 담당자 인라인 등록
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280' }}>담당자명 *</label>
                    <input type="text" value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="예: John Smith" style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280' }}>직책/부서</label>
                    <input type="text" value={newContactPosition} onChange={e => setNewContactPosition(e.target.value)} placeholder="예: Sourcing Manager" style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280' }}>연락처 (Mobile/Phone)</label>
                    <input type="text" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="예: +971-50-XXX" style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280' }}>이메일 주소</label>
                    <input type="email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} placeholder="예: john@buyer.com" style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280' }}>비고 (역할 등)</label>
                    <input type="text" value={newContactRemarks} onChange={e => setNewContactRemarks(e.target.value)} placeholder="예: 낮시간 통화선호" style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px' }} />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!newContactName.trim()) { alert('담당자 이름은 필수입니다.'); return; }
                    const newContact: CustomerContact = {
                      id: 'contact_' + Math.random().toString(36).substr(2, 9),
                      name: newContactName.trim(),
                      position: newContactPosition.trim() || undefined,
                      phone: newContactPhone.trim() || undefined,
                      email: newContactEmail.trim() || undefined,
                      isPrimary: (formData.contacts || []).length === 0,
                      remarks: newContactRemarks.trim() || undefined
                    };
                    setFormData(prev => ({
                      ...prev,
                      contacts: [...(prev.contacts || []), newContact]
                    }));
                    setNewContactName(''); setNewContactPosition(''); setNewContactPhone(''); setNewContactEmail(''); setNewContactRemarks('');
                  }}
                  style={{ background: '#7e22ce', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center' }}
                >
                  ➕ 담당자 명부에 추가
                </button>
              </div>

              {/* 담당자 목록 테이블 */}
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                      <th style={{ padding: '10px', width: '60px', textAlign: 'center' }}>대표</th>
                      <th style={{ padding: '10px' }}>이름 (직책)</th>
                      <th style={{ padding: '10px' }}>연락망 (연락처/이메일)</th>
                      <th style={{ padding: '10px' }}>역할/비고</th>
                      <th style={{ padding: '10px', width: '70px', textAlign: 'center' }}>삭제</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!formData.contacts || formData.contacts.length === 0) ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>등록된 소싱 담당자가 없습니다. 상단 폼에서 담당자를 추가해 주세요.</td>
                      </tr>
                    ) : (
                      formData.contacts.map((c, idx) => (
                        <tr key={c.id || idx} style={{ borderBottom: '1px solid #f1f5f9', background: c.isPrimary ? '#faf5ff' : 'transparent' }}>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <input
                              type="radio"
                              name="primary_contact"
                              checked={c.isPrimary}
                              onChange={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  contacts: (prev.contacts || []).map((item, i) => ({
                                    ...item,
                                    isPrimary: i === idx
                                  }))
                                }));
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '10px', fontWeight: 700, color: c.isPrimary ? '#7e22ce' : '#1e293b' }}>
                            {c.name} {c.position && <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 400 }}>({c.position})</span>}
                            {c.isPrimary && <span style={{ fontSize: '9px', background: '#f3e8ff', color: '#a855f7', border: '1px solid #d8b4fe', padding: '1px 5px', borderRadius: '4px', marginLeft: '6px' }}>대표</span>}
                          </td>
                          <td style={{ padding: '10px' }}>
                            <div style={{ color: '#334155' }}>📞 {c.phone || '-'}</div>
                            <div style={{ color: '#64748b', fontSize: '11px' }}>✉️ {c.email || '-'}</div>
                          </td>
                          <td style={{ padding: '10px', color: '#64748b' }}>{c.remarks || '-'}</td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData(prev => {
                                  const next = (prev.contacts || []).filter((_, i) => i !== idx);
                                  if (c.isPrimary && next.length > 0) {
                                    next[0].isPrimary = true;
                                  }
                                  return { ...prev, contacts: next };
                                });
                              }}
                              style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444', borderRadius: '4px', padding: '3px 7px', cursor: 'pointer', fontSize: '11px' }}
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
          )}

        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#fafafb', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, color: '#64748b', cursor: 'pointer', fontSize: '13px' }}>취소</button>
          <button onClick={handleSave} disabled={isSaving} style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px', boxShadow: '0 4px 6px -1px rgba(37,99,235,0.2)' }}>
            {isSaving ? '저장 중...' : '✔ 최종 저장'}
          </button>
        </div>

      </div>
    </div>
  );
};

const Input = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '', step, labelColor = '#475569' }: any) => {
  const isRequired = label?.includes('★');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '10px', fontWeight: 700, color: labelColor, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label?.replace(' ★', '')}
        {isRequired && <span style={{ color: '#ef4444', marginLeft: '2px' }}>★</span>}
      </label>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        step={step}
        style={{
          padding: '8px 11px',
          border: disabled ? '1px solid #f1f5f9' : (isRequired ? '1.5px solid #94a3b8' : '1px solid #cbd5e1'),
          borderRadius: '6px',
          fontSize: '12.5px',
          background: disabled ? '#f8fafc' : '#fff',
          color: disabled ? '#94a3b8' : '#0f172a',
          outline: 'none',
          transition: 'all 0.15s'
        }}
        onFocus={e => { if(!disabled) { e.target.style.borderColor = '#2563eb'; e.target.style.boxShadow = '0 0 0 3px rgba(37,99,235,0.06)'; } }}
        onBlur={e => { e.target.style.borderColor = isRequired ? '#94a3b8' : '#cbd5e1'; e.target.style.boxShadow = 'none'; }}
      />
    </div>
  );
};

const Select = ({ label, value, onChange, options }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <label style={{ fontSize: '10px', fontWeight: 700, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</label>
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '8px 11px',
        border: '1px solid #cbd5e1',
        borderRadius: '6px',
        fontSize: '12.5px',
        background: '#fff',
        color: '#0f172a',
        outline: 'none'
      }}
    >
      {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);
