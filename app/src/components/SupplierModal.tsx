import React, { useState, useEffect, useRef } from 'react';
import { doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Supplier, SupplierContact } from '../types/supplier';

interface Props {
  initialSupplier?: Supplier;
  onClose: () => void;
  onSave?: (supplier: Supplier) => void;
  defaultCategory?: '공급사' | '포워딩사';
}

export const SupplierModal: React.FC<Props> = ({ initialSupplier, onClose, onSave, defaultCategory }) => {
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
    category: defaultCategory || '공급사', bankKrw: '', bankUsd: '', contacts: []
  });

  // 기존 bankKrw/bankUsd 역파싱하여 개별 상태에 채워넣기
  useEffect(() => {
    if (initialSupplier) {
      setFormData({
        ...initialSupplier,
        contacts: initialSupplier.contacts || []
      });

      // 1. 원화 통장 역파싱
      if (initialSupplier.bankKrw) {
        const text = initialSupplier.bankKrw.trim();
        const parts = text.split(/\s+/);
        if (parts.length >= 3) {
          setKrwBankName(parts[0]);
          setKrwBankAccount(parts[1]);
          setKrwBankHolder(parts.slice(2).join(' ').replace(/[\(\)]/g, ''));
        } else {
          setKrwBankAccount(text);
        }
      }

      // 2. 외화 통장 역파싱
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
    if (initialSupplier && initialSupplier.supplierCode && initialSupplier.supplierCode.trim() !== '' && initialSupplier.supplierCode.trim() !== '-') return;

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
    setIsDirty(true);
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.supplierCode?.trim()) { alert('공급업체코드는 필수 입력사항입니다.'); return; }
    if (!formData.name?.trim()) { alert('공급업체명은 필수 입력사항입니다.'); return; }

    setIsSaving(true);
    try {
      const docId = initialSupplier?.id || formData.supplierCode;
      
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
      await setDoc(doc(db, 'companies', COMPANY_ID, 'suppliers', docId), sanitizedData);
      alert('✅ 성공적으로 저장되었습니다.');
      if (onSave) {
        onSave({ id: docId, ...finalData } as Supplier);
      } else {
        onClose();
      }
    } catch (err: any) {
      alert('❌ 저장 실패: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const [isDirty, setIsDirty] = useState(false);

  const handleClose = () => {
    if (isDirty) {
      const confirmClose = window.confirm("⚠️ 작성 중인 내용이 저장되지 않았습니다. 정말로 창을 닫으시겠습니까?");
      if (!confirmClose) return;
    }
    onClose();
  };

  const [position, setPosition] = useState({ x: 150, y: 120 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const nextX = Math.max(10, Math.min(window.innerWidth - 300, e.clientX - dragStartRef.current.x));
    const nextY = Math.max(10, Math.min(window.innerHeight - 150, e.clientY - dragStartRef.current.y));
    setPosition({ x: nextX, y: nextY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div style={{
      position: 'fixed',
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: '96%',
      maxWidth: '1100px',
      zIndex: 3000,
      userSelect: isDragging ? 'none' : 'auto'
    }}>
      <div style={{ background: '#fff', borderRadius: '4px', width: '100%', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(15,23,42,0.3)', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
        
        {/* Header */}
        <div 
          onMouseDown={handleMouseDown}
          style={{ padding: '16px 24px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', cursor: 'move', userSelect: 'none' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>🏭</span>
              {initialSupplier ? '공급업체 정보 수정 (Edit Supplier Master)' : '신규 공급업체 등록 (Register Supplier Master)'}
            </div>
          </div>
          <button onClick={handleClose} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '20px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body Container (Ultra Compact, no scrollbar ideally) */}
        <div style={{ padding: '12px 16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', background: '#f8fafc' }}>
          
          {/* SECTION 1: 공급업체 기본 정보 */}
          <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px 12px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
              <span style={{ color: '#0891b2' }}>🏭</span> 공급업체 기본 정보 (Supplier Profile)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              <Input label="공급업체코드 (필수) ★" value={formData.supplierCode} onChange={(v: any) => handleChange('supplierCode', v)} disabled={true} placeholder="자동 발번 중..." labelColor="#0891b2" />
              <Input label="공급업체명 (필수) ★" value={formData.name} onChange={(v: any) => handleChange('name', v)} placeholder="예: 국도화학 주식회사" labelColor="#0891b2" />
              <Input label="사업자등록번호" value={formData.bizNumber} onChange={(v: any) => handleChange('bizNumber', v)} placeholder="000-00-00000" />
              <Input label="대표자명" value={formData.representative} onChange={(v: any) => handleChange('representative', v)} placeholder="대표이사 성명" />
              
              <Select label="업체 구분" value={formData.category || '공급사'} onChange={(v: any) => handleChange('category', v)} options={['공급사', '포워딩사']} />
              <Input label="대표전화번호" value={formData.phone} onChange={(v: any) => handleChange('phone', v)} placeholder="02-XXX-XXXX" />
              <div style={{ gridColumn: 'span 2' }}>
                <Input label="본사 주소 (Address)" value={formData.address} onChange={(v: any) => handleChange('address', v)} placeholder="도로명 주소 또는 본사 영문 주소" />
              </div>
            </div>
          </div>

          {/* SECTION 2: 통장 정보 (원화/외화 가로배치, 2열 그리드로 공간확보) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            
            {/* 원화통장 정보 */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                <span style={{ color: '#0284c7' }}>🇰🇷</span> 원화통장 정보 (KRW Bank Account)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Input label="원화 은행명" value={krwBankName} onChange={setKrwBankName} placeholder="예: 국민은행" />
                <Input label="원화 계좌번호" value={krwBankAccount} onChange={setKrwBankAccount} placeholder="예: 123-45-67890" />
                <div style={{ gridColumn: 'span 2' }}>
                  <Input label="원화 예금주" value={krwBankHolder} onChange={setKrwBankHolder} placeholder="예: (주)와이에스" />
                </div>
              </div>
            </div>

            {/* 외화통장 정보 */}
            <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px 12px' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                <span style={{ color: '#0369a1' }}>🇺🇸</span> 외화통장 정보 (Foreign Currency Account)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <Input label="외화 은행명" value={usdBankName} onChange={setUsdBankName} placeholder="예: 신한은행" />
                <Input label="외화 계좌번호" value={usdBankAccount} onChange={setUsdBankAccount} placeholder="예: 987-654-321" />
                <Input label="외화 예금주" value={usdBankHolder} onChange={setUsdBankHolder} placeholder="예: YS CO., LTD" />
                <Input label="SWIFT Code" value={usdSwift} onChange={setUsdSwift} placeholder="SWIFT CODE" />
              </div>
            </div>
          </div>

          {/* SECTION 3: 다중 담당자 입체 관리 */}
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '10px 12px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #cbd5e1', paddingBottom: '4px' }}>
              <span style={{ color: '#3b82f6' }}>👥</span> 공급업체 담당자 명부 관리 (Multiple Contacts)
            </div>

            {/* 인라인 등록 폼 (한줄 가로 정렬 및 박스 사이징 최적화) */}
            <div style={{ display: 'flex', gap: '6px', background: '#f8fafc', padding: '8px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', marginBottom: '8px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>담당자명 *</label>
                <input type="text" value={newContactName} onChange={e => setNewContactName(e.target.value)} placeholder="예: 홍길동" style={{ boxSizing: 'border-box', width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>직책/부서</label>
                <input type="text" value={newContactPosition} onChange={e => setNewContactPosition(e.target.value)} placeholder="예: 구매 과장" style={{ boxSizing: 'border-box', width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>연락처 (Mobile)</label>
                <input type="text" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} placeholder="예: 010-XXXX-XXXX" style={{ boxSizing: 'border-box', width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>이메일 주소</label>
                <input type="email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} placeholder="예: manager@supplier.com" style={{ boxSizing: 'border-box', width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
              </div>
              <div style={{ flex: 2.2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <label style={{ fontSize: '10px', fontWeight: 750, color: '#475569', textTransform: 'uppercase' }}>비고 (역할 등)</label>
                <input type="text" value={newContactRemarks} onChange={e => setNewContactRemarks(e.target.value)} placeholder="예: 발주 문의 창구" style={{ boxSizing: 'border-box', width: '100%', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px', outline: 'none' }} />
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
                style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 12px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', height: '26px' }}
              >
                + 추가
              </button>
            </div>

            {/* 테이블 명부 */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '5px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    <th style={{ padding: '5px 8px', width: '45px', textAlign: 'center' }}>대표</th>
                    <th style={{ padding: '5px 8px', width: '140px' }}>이름 (직책)</th>
                    <th style={{ padding: '5px 8px', width: '230px' }}>연락망 (연락처 / 이메일)</th>
                    <th style={{ padding: '5px 8px' }}>역할 / 특이사항</th>
                    <th style={{ padding: '5px 8px', width: '50px', textAlign: 'center' }}>삭제</th>
                  </tr>
                </thead>
                <tbody>
                  {(!formData.contacts || formData.contacts.length === 0) ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)' }}>등록된 공급사 담당자가 없습니다. 상단에서 추가해 주세요.</td>
                    </tr>
                  ) : (
                    formData.contacts.map((c, idx) => (
                      <tr key={c.id || idx} style={{ borderBottom: '1px solid #f1f5f9', background: c.isPrimary ? '#faf5ff' : 'transparent' }}>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
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
                        <td style={{ padding: '5px 8px', fontWeight: 700, color: c.isPrimary ? '#7e22ce' : 'var(--text-primary)' }}>
                          {c.name} {c.position && <span style={{ fontSize: '9.5px', color: 'var(--text-secondary)', fontWeight: 400 }}>({c.position})</span>}
                          {c.isPrimary && <span style={{ fontSize: '8px', background: '#f3e8ff', color: '#a855f7', border: '1px solid #d8b4fe', padding: '0px 3px', borderRadius: '2px', marginLeft: '4px' }}>대표</span>}
                        </td>
                        <td style={{ padding: '5px 8px' }}>
                          <span style={{ marginRight: '8px', fontWeight: 500 }}>📞 {c.phone || '-'}</span>
                          <span style={{ color: 'var(--text-secondary)' }}>✉️ {c.email || '-'}</span>
                        </td>
                        <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>{c.remarks || '-'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
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
                            style={{ background: '#fef2f2', border: '1px solid #fee2e2', color: '#ef4444', borderRadius: '3px', padding: '1px 4px', cursor: 'pointer', fontSize: '9.5px' }}
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
        <div style={{ padding: '12px 24px', borderTop: '1px solid #cbd5e1', background: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: '8px', borderRadius: '0 0 4px 4px', height: '58px', boxSizing: 'border-box' }}>
          <button 
            onClick={handleClose} 
            style={{ padding: '0 18px', borderRadius: '4px', border: '1px solid #cbd5e1', background: '#f1f5f9', fontWeight: 700, color: '#475569', cursor: 'pointer', fontSize: '13px', transition: 'background 0.2s', height: '34px', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          >취소</button>
          <button 
            onClick={handleSave} 
            disabled={isSaving} 
            style={{ padding: '0 18px', borderRadius: '4px', border: 'none', background: '#3b82f6', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '13px', transition: 'background 0.2s', height: '34px', boxSizing: 'border-box' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '11px', fontWeight: 750, color: labelColor, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
        {label?.replace(' ★', '')}
        {isRequired && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
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
          padding: '0 10px',
          border: '1px solid #cbd5e1',
          borderRadius: '4px',
          fontSize: '13px',
          fontWeight: 600,
          background: disabled ? '#f8fafc' : '#fff',
          color: disabled ? '#94a3b8' : '#1e293b',
          outline: 'none',
          height: '34px',
          transition: 'all 0.1s'
        }}
        onFocus={e => { if(!disabled) { e.target.style.borderColor = '#3b82f6'; } }}
        onBlur={e => { e.target.style.borderColor = '#cbd5e1'; }}
      />
    </div>
  );
};

const Select = ({ label, value, onChange, options }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>{label}</label>
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        padding: '0 10px',
        border: '1px solid #cbd5e1',
        borderRadius: '4px',
        fontSize: '13px',
        fontWeight: 600,
        background: '#fff',
        color: '#1e293b',
        outline: 'none',
        height: '34px'
      }}
    >
      {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);
