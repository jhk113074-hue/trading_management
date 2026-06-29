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

  // 다중 담당자 임시 추가용 state
  const [newContactName, setNewContactName] = useState('');
  const [newContactPosition, setNewContactPosition] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactRemarks, setNewContactRemarks] = useState('');
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

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
      if (!initialCustomer.customerCode || initialCustomer.customerCode.trim() === '' || initialCustomer.customerCode.trim() === '-') {
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

      const cleanUndefined = (obj: any): any => {
        if (obj === null || obj === undefined) return obj;
        if (Array.isArray(obj)) return obj.map(cleanUndefined);
        if (typeof obj === 'object') {
          if (obj.constructor && (obj.constructor.name.includes('FieldValue') || obj.constructor.name === 'Date')) {
            return obj;
          }
          if (obj.constructor && obj.constructor.name !== 'Object') {
            return obj;
          }
          const clean: any = {};
          for (const key of Object.keys(obj)) {
            if (obj[key] !== undefined) {
              clean[key] = cleanUndefined(obj[key]);
            }
          }
          return clean;
        }
        return obj;
      };

      const sanitizedData = cleanUndefined(finalData);
      await setDoc(doc(db, 'companies', COMPANY_ID, 'customers', docId), sanitizedData);
      alert('✅ 성공적으로 저장되었습니다.');
      onClose();
    } catch (err: any) {
      alert('❌ 저장 실패: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 3000 }}>
      <div style={{ background: '#fff', borderRadius: '10px', width: '96%', maxWidth: '1100px', maxHeight: '96vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🌐</span>
              {initialCustomer ? '고객사 정보 수정 (Edit Customer Master)' : '신규 고객사 등록 (Register Customer Master)'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body Container (Ultra Compact, scrollable only if screen is tiny) */}
        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8fafc' }}>
          
          {/* SECTION 1: 회사 기본 규격 */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
              <span style={{ color: '#2563eb' }}>🏢</span> 회사 기본 정보 (Company Profile)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              <Input label="고객코드 (자동지정)" value={formData.customerCode} onChange={(v: any) => handleChange('customerCode', v)} disabled={true} placeholder="생성 중..." />
              <Input label="고객명_영문 (필수) ★" value={formData.name} onChange={(v: any) => handleChange('name', v)} placeholder="예: AL BASSAM FACTORIES" labelColor="#2563eb" />
              <Input label="고객약자 (Abbreviation)" value={formData.nameKo} onChange={(v: any) => handleChange('nameKo', v)} placeholder="예: AL-BASSAM" />
              <Input label="대표자 (Representative)" value={formData.representative} onChange={(v: any) => handleChange('representative', v)} placeholder="CEO / President Name" />
              
              <Input label="국가명" value={formData.countryName} onChange={(v: any) => handleChange('countryName', v)} placeholder="예: UAE" />
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

          {/* SECTION 2: 무역 선적 & 세무 금융 정보 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            
            {/* 무역/선적 스펙 */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                <span style={{ color: '#1d4ed8' }}>🚢</span> 무역 거래 및 선적 조건
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Select label="기본 인도조건 (Incoterms)" value={formData.preferredIncoterms} onChange={(v: any) => handleChange('preferredIncoterms', v)} options={['FOB', 'EXW', 'CIF', 'CFR', 'FCA', 'CPT', 'CIP', 'DAP', 'DDP']} />
                <Input label="도착항 (Destination Port)" value={formData.shippingPort} onChange={(v: any) => handleChange('shippingPort', v)} placeholder="예: JEBEL ALI PORT" />
                <div style={{ gridColumn: 'span 2' }}>
                  <Input label="결제조건 (Payment Terms)" value={formData.paymentTerms} onChange={(v: any) => handleChange('paymentTerms', v)} placeholder="예: 100% LC at sight / NET 30 Days" />
                </div>
              </div>
            </div>

            {/* 세무/금융 금융계좌 (2줄로 나누어 공간 최적 확보) */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                <span style={{ color: '#475569' }}>💳</span> 세무 등록 및 외환 계좌 정보
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Input label="TAX-ID / VAT" value={formData.taxId} onChange={(v: any) => handleChange('taxId', v)} placeholder="VAT Number" />
                <Input label="은행명" value={formData.bankName} onChange={(v: any) => handleChange('bankName', v)} placeholder="Bank Name" />
                <Input label="계좌번호" value={formData.bankAccount} onChange={(v: any) => handleChange('bankAccount', v)} placeholder="Account No" />
                <Input label="예금주" value={formData.bankHolder} onChange={(v: any) => handleChange('bankHolder', v)} placeholder="Holder" />
                <Input label="SWIFT Code" value={formData.swiftCode} onChange={(v: any) => handleChange('swiftCode', v)} placeholder="SWIFT" />
                <Input label="IBAN Number" value={formData.iban} onChange={(v: any) => handleChange('iban', v)} placeholder="IBAN" />
              </div>
            </div>
          </div>

          {/* SECTION 3: 다중 담당자 입체 관리 */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
              <span style={{ color: '#7e22ce' }}>👥</span> 바이어 담당자 명부 관리 (Multiple Contacts)
            </div>

            {/* 인라인 등록 폼 */}
            <div style={{ display: 'flex', gap: '6px', background: '#faf5ff', padding: '8px 10px', borderRadius: '5px', border: '1px solid #f3e8ff', marginBottom: '8px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: '#6b7280' }}>담당자명 *</label>
                <input type="text" value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="예: John Smith" style={{ boxSizing: 'border-box', width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: '#6b7280' }}>직책/부서</label>
                <input type="text" value={newContactPosition} onChange={e => setNewContactPosition(e.target.value)} placeholder="예: Sourcing Mgr" style={{ boxSizing: 'border-box', width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: '#6b7280' }}>연락처 (Mobile)</label>
                <input type="text" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="예: +971-50-XXX" style={{ boxSizing: 'border-box', width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: '#6b7280' }}>이메일 주소</label>
                <input type="email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} placeholder="예: john@buyer.com" style={{ boxSizing: 'border-box', width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ flex: 2.2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '9px', fontWeight: 700, color: '#6b7280' }}>비고 (역할 등)</label>
                <input type="text" value={newContactRemarks} onChange={e => setNewContactRemarks(e.target.value)} placeholder="예: 주 통신 채널" style={{ boxSizing: 'border-box', width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
              </div>
              {editingContactId ? (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newContactName.trim()) { alert('담당자 이름은 필수입니다.'); return; }
                      setFormData(prev => ({
                        ...prev,
                        contacts: (prev.contacts || []).map(c => c.id === editingContactId ? {
                          ...c,
                          name: newContactName.trim(),
                          position: newContactPosition.trim() || undefined,
                          phone: newContactPhone.trim() || undefined,
                          email: newContactEmail.trim() || undefined,
                          remarks: newContactRemarks.trim() || undefined
                        } : c)
                      }));
                      setEditingContactId(null);
                      setNewContactName(''); setNewContactPosition(''); setNewContactPhone(''); setNewContactEmail(''); setNewContactRemarks('');
                    }}
                    style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', height: '26px', whiteSpace: 'nowrap' }}
                  >
                    수정완료
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingContactId(null);
                      setNewContactName(''); setNewContactPosition(''); setNewContactPhone(''); setNewContactEmail(''); setNewContactRemarks('');
                    }}
                    style={{ background: '#64748b', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 10px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', height: '26px', whiteSpace: 'nowrap' }}
                  >
                    취소
                  </button>
                </div>
              ) : (
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
                  style={{ background: '#7e22ce', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 12px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', height: '26px' }}
                >
                  + 추가
                </button>
              )}
            </div>

            {/* 테이블 명부 */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '5px 8px', width: '45px', textAlign: 'center' }}>대표</th>
                    <th style={{ padding: '5px 8px', width: '140px' }}>이름 (직책)</th>
                    <th style={{ padding: '5px 8px', width: '230px' }}>연락망 (연락처 / 이메일)</th>
                    <th style={{ padding: '5px 8px' }}>역할 / 특이사항</th>
                    <th style={{ padding: '5px 8px', width: '100px', textAlign: 'center' }}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {(formData.contacts || []).map((c: any) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                        <input type="radio" checked={c.isPrimary} onChange={() => setFormData(prev => ({ ...prev, contacts: prev.contacts?.map((ct: any) => ({ ...ct, isPrimary: ct.id === c.id })) }))} />
                      </td>
                      <td style={{ padding: '5px 8px' }}>{c.name}<br /><span style={{ color: '#64748b' }}>{c.position}</span></td>
                      <td style={{ padding: '5px 8px' }}>{c.phone}<br /><span style={{ color: '#64748b' }}>{c.email}</span></td>
                      <td style={{ padding: '5px 8px' }}>{c.remarks}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                        <button type="button" onClick={() => { setEditingContactId(c.id); setNewContactName(c.name); setNewContactPosition(c.position || ''); setNewContactPhone(c.phone || ''); setNewContactEmail(c.email || ''); setNewContactRemarks(c.remarks || ''); }} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', marginRight: '8px' }}>수정</button>
                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, contacts: prev.contacts?.filter((ct: any) => ct.id !== c.id) }))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 특이사항 / 비고 */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px 12px' }}>
            <Input label="바이어 특이사항 / 종합 비고 (General Remarks)" value={formData.remarks} onChange={(v: any) => handleChange('remarks', v)} placeholder="예: 바이어 신용 등급 및 특이 조항 등" />
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={onClose} style={{ padding: '6px 12px', borderRadius: '5px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, color: '#64748b', cursor: 'pointer', fontSize: '11.5px' }}>취소</button>
          <button onClick={handleSave} disabled={isSaving} style={{ padding: '6px 14px', borderRadius: '5px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '11.5px', boxShadow: '0 2px 4px rgba(37,99,235,0.15)' }}>
            {isSaving ? '저장 중...' : '✔ 고객 정보 저장'}
          </button>
        </div>

      </div>
    </div>
  );
};

const Input = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '', step, labelColor = '#475569' }: any) => {
  const isRequired = label?.includes('★');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <label style={{ fontSize: '8.5px', fontWeight: 700, color: labelColor, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
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
          boxSizing: 'border-box',
          width: '100%',
          padding: '5px 8px',
          border: disabled ? '1px solid #f1f5f9' : (isRequired ? '1.5px solid #94a3b8' : '1px solid #cbd5e1'),
          borderRadius: '4px',
          fontSize: '11.5px',
          background: disabled ? '#f8fafc' : '#fff',
          color: disabled ? '#94a3b8' : '#0f172a',
          outline: 'none',
          transition: 'all 0.1s'
        }}
        onFocus={e => { if(!disabled) { e.target.style.borderColor = '#2563eb'; } }}
        onBlur={e => { e.target.style.borderColor = isRequired ? '#94a3b8' : '#cbd5e1'; }}
      />
    </div>
  );
};

const Select = ({ label, value, onChange, options }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
    <label style={{ fontSize: '8.5px', fontWeight: 700, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</label>
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        padding: '5px 8px',
        border: '1px solid #cbd5e1',
        borderRadius: '4px',
        fontSize: '11.5px',
        background: '#fff',
        color: '#0f172a',
        outline: 'none'
      }}
    >
      {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);
