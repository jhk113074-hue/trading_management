import React, { useState, useEffect } from 'react';
import { doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Supplier, SupplierContact } from '../types/supplier';

interface Props {
  initialSupplier?: Supplier;
  onClose: () => void;
}

export const SupplierModal: React.FC<Props> = ({ initialSupplier, onClose }) => {
  const [isSaving, setIsSaving] = useState(false);

  // 다중 담당자 임시 추가용 state
  const [newContactName, setNewContactName] = useState('');
  const [newContactPosition, setNewContactPosition] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactRemarks, setNewContactRemarks] = useState('');

  // 세분화된 은행 상태
  const [krwBankName, setKrwBankName] = useState('');
  const [krwBankAccount, setKrwBankAccount] = useState('');
  const [krwBankHolder, setKrwBankHolder] = useState('');

  const [usdBankName, setUsdBankName] = useState('');
  const [usdBankAccount, setUsdBankAccount] = useState('');
  const [usdBankHolder, setUsdBankHolder] = useState('');
  const [usdSwift, setUsdSwift] = useState('');

  const [formData, setFormData] = useState<Partial<Supplier>>({
    supplierCode: '', name: '', bizNumber: '', representative: '',
    phone: '', purchaseEmail: '', address: '', managerName: '', managerPhone: '',
    category: '공급사', bankKrw: '', bankUsd: '', contacts: []
  });

  // 기존 bankKrw/bankUsd 역파싱하여 개별 상태에 채워넣기
  useEffect(() => {
    if (initialSupplier) {
      setFormData({
        ...initialSupplier,
        contacts: initialSupplier.contacts || []
      });

      // 1. 원화 통장 역파싱 시도
      // 예: "국민은행 123-45-6789 (주)와이에스" -> [국민은행, 123-45-6789, (주)와이에스]
      if (initialSupplier.bankKrw) {
        const text = initialSupplier.bankKrw.trim();
        const parts = text.split(/\s+/);
        if (parts.length >= 3) {
          setKrwBankName(parts[0]);
          setKrwBankAccount(parts[1]);
          setKrwBankHolder(parts.slice(2).join(' ').replace(/[\(\)]/g, ''));
        } else {
          setKrwBankAccount(text); // 파싱 실패 시 전체 필드에 채우기
        }
      }

      // 2. 외화 통장 역파싱 시도
      // 예: "신한은행 987-654-321 (USD) SWIFT: SHINKR"
      if (initialSupplier.bankUsd) {
        const text = initialSupplier.bankUsd.trim();
        const swiftIndex = text.toUpperCase().indexOf('SWIFT:');
        let rawAccountAndHolder = text;
        if (swiftIndex !== -1) {
          setUsdSwift(text.substring(swiftIndex + 6).trim());
          rawAccountAndHolder = text.substring(0, swiftIndex).trim();
        }
        const parts = rawAccountAndHolder.split(/\s+/);
        if (parts.length >= 3) {
          setUsdBankName(parts[0]);
          setUsdBankAccount(parts[1]);
          setUsdBankHolder(parts.slice(2).join(' ').replace(/[\(\)]/g, ''));
        } else {
          setUsdBankAccount(text);
        }
      }
    }
  }, [initialSupplier]);

  useEffect(() => {
    if (initialSupplier) return;

    const generateCode = async () => {
      let maxNum = 0;
      try {
        const snap = await getDocs(collection(db, 'companies', COMPANY_ID, 'suppliers'));
        snap.docs.forEach(d => {
          const code = d.data().supplierCode || d.id;
          if (code && typeof code === 'string') {
            const match = code.match(/^(?:SUP-|S)(\d+)$/i);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxNum) maxNum = num;
            }
          }
        });
      } catch (err) {
        console.error('공급업체코드 자동발번 오류:', err);
      }
      
      const nextCode = 'S' + String(maxNum + 1).padStart(4, '0');
      setFormData(prev => ({ ...prev, supplierCode: nextCode }));
    };

    generateCode();
  }, [initialSupplier]);

  const handleChange = (field: keyof Supplier, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.supplierCode?.trim()) { alert('공급업체코드는 필수 입력사항입니다.'); return; }
    if (!formData.name?.trim()) { alert('공급업체명은 필수 입력사항입니다.'); return; }

    setIsSaving(true);
    try {
      const docId = initialSupplier?.id || formData.supplierCode;
      
      // 원화 및 외화통장 문자열 조합 (하위 호환)
      let finalBankKrw = '';
      if (krwBankName.trim() || krwBankAccount.trim()) {
        finalBankKrw = (krwBankName.trim() + ' ' + krwBankAccount.trim() + ' (' + (krwBankHolder.trim() || '예금주미정') + ')').trim();
      }

      let finalBankUsd = '';
      if (usdBankName.trim() || usdBankAccount.trim()) {
        finalBankUsd = (usdBankName.trim() + ' ' + usdBankAccount.trim() + ' (' + (usdBankHolder.trim() || '예금주미정') + ')').trim();
        if (usdSwift.trim()) {
          finalBankUsd += ' SWIFT: ' + usdSwift.trim();
        }
      }

      // 하위 호환성을 위한 담당자 매핑
      let legacyFields = {
        managerName: '',
        managerPhone: '',
        purchaseEmail: ''
      };

      if (formData.contacts && formData.contacts.length > 0) {
        const primary = formData.contacts.find(c => c.isPrimary) || formData.contacts[0];
        legacyFields = {
          managerName: primary.name,
          managerPhone: primary.phone || '',
          purchaseEmail: primary.email || ''
        };
      }

      const finalData: Partial<Supplier> = {
        ...formData,
        ...legacyFields,
        bankKrw: finalBankKrw,
        bankUsd: finalBankUsd,
        updatedAt: serverTimestamp(),
      };

      if (!initialSupplier) {
        finalData.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, 'companies', COMPANY_ID, 'suppliers', docId), finalData);
      alert('✅ 성공적으로 저장되었습니다.');
      onClose();
    } catch (err: any) {
      alert('❌ 저장 실패: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '12px', width: '96%', maxWidth: '1180px', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🏭</span>
              {initialSupplier ? '공급업체 정보 수정 (Edit Supplier Master)' : '신규 공급업체 등록 (Register Supplier Master)'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>✕</button>
        </div>

        {/* Body Container (All in One, scrollable) */}
        <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', background: '#f8fafc' }}>
          
          {/* SECTION 1: 공급업체 기본 정보 */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
              <span style={{ color: '#0891b2' }}>🏭</span> 공급업체 기본 정보 (Supplier Profile)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              <Input label="공급업체코드 (필수) ★" value={formData.supplierCode} onChange={(v: any) => handleChange('supplierCode', v)} disabled={true} placeholder="자동 발번 중..." labelColor="#0891b2" />
              <Input label="공급업체명 (필수) ★" value={formData.name} onChange={(v: any) => handleChange('name', v)} placeholder="예: 국도화학 주식회사" labelColor="#0891b2" />
              <Input label="사업자등록번호" value={formData.bizNumber} onChange={(v: any) => handleChange('bizNumber', v)} placeholder="000-00-00000" />
              <Input label="대표자명" value={formData.representative} onChange={(v: any) => handleChange('representative', v)} placeholder="대표이사 성명" />
              
              <Select label="업체 구분" value={formData.category || '공급사'} onChange={(v: any) => handleChange('category', v)} options={['공급사', '포워딩사']} />
              <Input label="대표전화번호" value={formData.phone} onChange={(v: any) => handleChange('phone', v)} placeholder="02-XXX-XXXX" />
              <div style={{ gridColumn: 'span 2' }}>
                <Input label="본사 주소 (Address)" value={formData.address} onChange={(v: any) => handleChange('address', v)} placeholder="도로명 주소 또는 영문 주소" />
              </div>
            </div>
          </div>

          {/* SECTION 2: 통장 정보 (원화/외화 별도 카드 세분화) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            
            {/* 원화통장 정보 */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                <span style={{ color: '#0284c7' }}>🇰🇷</span> 원화통장 정보 (KRW Bank Account)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <Input label="원화 은행명" value={krwBankName} onChange={setKrwBankName} placeholder="예: 국민은행" />
                <Input label="원화 계좌번호" value={krwBankAccount} onChange={setKrwBankAccount} placeholder="예: 123-45-67890" />
                <Input label="원화 예금주" value={krwBankHolder} onChange={setKrwBankHolder} placeholder="예: (주)와이에스" />
              </div>
            </div>

            {/* 외화통장 정보 */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
                <span style={{ color: '#0369a1' }}>🇺🇸</span> 외화통장 정보 (Foreign Currency Account)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                <Input label="외화 은행명" value={usdBankName} onChange={setUsdBankName} placeholder="예: 신한은행" />
                <Input label="외화 계좌번호" value={usdBankAccount} onChange={setUsdBankAccount} placeholder="예: 987-654-321" />
                <Input label="외화 예금주" value={usdBankHolder} onChange={setUsdBankHolder} placeholder="예: YS CO., LTD" />
                <Input label="SWIFT Code" value={usdSwift} onChange={setUsdSwift} placeholder="예: SHINKR" />
              </div>
            </div>
          </div>

          {/* SECTION 3: 다중 담당자 입체 관리 */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
              <span style={{ color: '#7e22ce' }}>👥</span> 공급업체 담당자 명부 관리 (Multiple Contacts)
            </div>

            {/* 인라인 등록 폼 (한줄에 전원 정렬) */}
            <div style={{ display: 'flex', gap: '8px', background: '#faf5ff', padding: '10px 12px', borderRadius: '6px', border: '1px solid #f3e8ff', marginBottom: '10px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#6b7280' }}>담당자명 *</label>
                <input type="text" value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="예: 홍길동" style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#6b7280' }}>직책/부서</label>
                <input type="text" value={newContactPosition} onChange={e => setNewContactPosition(e.target.value)} placeholder="예: 구매 과장" style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#6b7280' }}>연락처 (Mobile)</label>
                <input type="text" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="예: 010-XXXX-XXXX" style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#6b7280' }}>이메일 주소</label>
                <input type="email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} placeholder="예: manager@supplier.com" style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ flex: 2.2, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#6b7280' }}>비고 (역할 등)</label>
                <input type="text" value={newContactRemarks} onChange={e => setNewContactRemarks(e.target.value)} placeholder="예: 발주 문의 창구" style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '12px', outline: 'none' }} />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!newContactName.trim()) { alert('담당자 이름은 필수입니다.'); return; }
                  const newContact: SupplierContact = {
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
                style={{ background: '#7e22ce', color: '#fff', border: 'none', borderRadius: '5px', padding: '6px 14px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', height: '30px' }}
              >
                + 추가
              </button>
            </div>

            {/* 테이블 명부 */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: 700 }}>
                    <th style={{ padding: '6px 10px', width: '50px', textAlign: 'center' }}>대표</th>
                    <th style={{ padding: '6px 10px', width: '150px' }}>이름 (직책)</th>
                    <th style={{ padding: '6px 10px', width: '240px' }}>연락망 (연락처 / 이메일)</th>
                    <th style={{ padding: '6px 10px' }}>역할 / 특이사항</th>
                    <th style={{ padding: '6px 10px', width: '60px', textAlign: 'center' }}>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {(!formData.contacts || formData.contacts.length === 0) ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>등록된 공급사 담당자가 없습니다. 상단에서 추가해 주세요.</td>
                    </tr>
                  ) : (
                    formData.contacts.map((c, idx) => (
                      <tr key={c.id || idx} style={{ borderBottom: '1px solid #f1f5f9', background: c.isPrimary ? '#faf5ff' : 'transparent' }}>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <input
                            type="radio"
                            name="supplier_primary_contact"
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
                        <td style={{ padding: '6px 10px', fontWeight: 700, color: c.isPrimary ? '#7e22ce' : '#1e293b' }}>
                          {c.name} {c.position && <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 400 }}>({c.position})</span>}
                          {c.isPrimary && <span style={{ fontSize: '8px', background: '#f3e8ff', color: '#a855f7', border: '1px solid #d8b4fe', padding: '0px 4px', borderRadius: '3px', marginLeft: '4px' }}>대표</span>}
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{ marginRight: '10px', fontWeight: 500 }}>📞 {c.phone || '-'}</span>
                          <span style={{ color: '#64748b' }}>✉️ {c.email || '-'}</span>
                        </td>
                        <td style={{ padding: '6px 10px', color: '#64748b' }}>{c.remarks || '-'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
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
                            style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444', borderRadius: '3px', padding: '1px 5px', cursor: 'pointer', fontSize: '10px' }}
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

        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, color: '#64748b', cursor: 'pointer', fontSize: '12px' }}>취소</button>
          <button onClick={handleSave} disabled={isSaving} style={{ padding: '7px 16px', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '12px', boxShadow: '0 2px 4px rgba(37,99,235,0.15)' }}>
            {isSaving ? '저장 중...' : '✔ 공급사 정보 저장'}
          </button>
        </div>

      </div>
    </div>
  );
};

const Input = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '', step, labelColor = '#475569' }: any) => {
  const isRequired = label?.includes('★');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <label style={{ fontSize: '9px', fontWeight: 700, color: labelColor, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
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
          padding: '6px 9px',
          border: disabled ? '1px solid #f1f5f9' : (isRequired ? '1.5px solid #0891b2' : '1px solid #cbd5e1'),
          borderRadius: '5px',
          fontSize: '12px',
          background: disabled ? '#f8fafc' : '#fff',
          color: disabled ? '#94a3b8' : '#0f172a',
          outline: 'none',
          transition: 'all 0.1s'
        }}
        onFocus={e => { if(!disabled) { e.target.style.borderColor = '#0891b2'; } }}
        onBlur={e => { e.target.style.borderColor = isRequired ? '#0891b2' : '#cbd5e1'; }}
      />
    </div>
  );
};

const Select = ({ label, value, onChange, options }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
    <label style={{ fontSize: '9px', fontWeight: 700, color: '#475569', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</label>
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '6px 9px',
        border: '1px solid #cbd5e1',
        borderRadius: '5px',
        fontSize: '12px',
        background: '#fff',
        color: '#0f172a',
        outline: 'none'
      }}
    >
      {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);
