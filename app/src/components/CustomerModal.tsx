import React, { useState, useEffect } from 'react';
import { doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Customer } from '../types/customer';

interface Props {
  initialCustomer?: Customer;
  onClose: () => void;
}

export const CustomerModal: React.FC<Props> = ({ initialCustomer, onClose }) => {
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<Partial<Customer>>({
    customerCode: '', name: '', nameKo: '', countryName: '',
    taxId: '', addressEn: '', phone: '', email: '',
    preferredIncoterms: 'FOB', shippingPort: '', paymentTerms: ''
  });

  useEffect(() => {
    if (initialCustomer) {
      setFormData(initialCustomer);
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
          const nextCode = `CU${String(maxNum + 1).padStart(5, '0')}`;
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
      
      const finalData: Partial<Customer> = {
        ...formData,
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
      <div style={{ background: '#fff', borderRadius: '14px', width: '90%', maxWidth: '700px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e8ecf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', borderRadius: '14px 14px 0 0' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>
              {initialCustomer ? 'Edit Customer' : 'Add New Customer'}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
              해외 거래처 등록 및 무역정보 연동
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '22px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <Input label="고객코드 (자동지정)" value={formData.customerCode} onChange={(v: any) => handleChange('customerCode', v)} disabled={true} placeholder="자동 생성 중..." />
            <Input label="고객명_영문 (필수) ★" value={formData.name} onChange={(v: any) => handleChange('name', v)} placeholder="예: AL SHIRAWAI CO." />
            <Input label="고객약자 (Abbreviation)" value={formData.nameKo} onChange={(v: any) => handleChange('nameKo', v)} placeholder="예: ABC" />
            <Input label="국가명" value={formData.countryName} onChange={(v: any) => handleChange('countryName', v)} placeholder="예: UAE" />
            <Input label="TAX-ID" value={formData.taxId} onChange={(v: any) => handleChange('taxId', v)} placeholder="VAT Number" />
            <Input label="국제전화번호" value={formData.phone} onChange={(v: any) => handleChange('phone', v)} placeholder="+971-4-XXX-XXXX" />
            <Input label="이메일 주소" value={formData.email} onChange={(v: any) => handleChange('email', v)} type="email" placeholder="info@buyer.com" />
            <Select label="기본 배송방법 (Incoterms)" value={formData.preferredIncoterms} onChange={(v: any) => handleChange('preferredIncoterms', v)} options={['FOB', 'EXW', 'FAS', 'FCA', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']} />
            <Input label="Destination Port (도착항)" value={formData.shippingPort} onChange={(v: any) => handleChange('shippingPort', v)} placeholder="예: JEBEL ALI PORT" />
            <Input label="Payment Terms (결제조건)" value={formData.paymentTerms} onChange={(v: any) => handleChange('paymentTerms', v)} placeholder="예: 100% LC 90days at sight" />

            {/* ── 담당자 정보 ── */}
            <Input label="담당자명 (Contact Person)" value={formData.contactPerson} onChange={(v: any) => handleChange('contactPerson', v)} placeholder="예: John Smith" />
            <Input label="담당자 연락처 (Contact Phone)" value={formData.contactPhone} onChange={(v: any) => handleChange('contactPhone', v)} placeholder="예: +971-50-XXX-XXXX" />
            <div style={{ gridColumn: 'span 2' }}>
              <Input label="담당자 이메일 (Contact Email)" value={formData.contactEmail} onChange={(v: any) => handleChange('contactEmail', v)} type="email" placeholder="예: john@buyer.com" />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <Input label="주소 (Address)" value={formData.addressEn} onChange={(v: any) => handleChange('addressEn', v)} placeholder="영문 주소" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e8ecf0', background: '#fafafa', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderRadius: '0 0 14px 14px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: '7px', border: '1px solid #e8ecf0', background: '#fff', fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>취소</button>
          <button onClick={handleSave} disabled={isSaving} style={{ padding: '9px 18px', borderRadius: '7px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            {isSaving ? '저장 중...' : '✔ 저장'}
          </button>
        </div>

      </div>
    </div>
  );
};

const Input = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '', step, labelColor = '#6b7280' }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <label style={{ fontSize: '11px', fontWeight: 600, color: labelColor }}>{label}</label>
    <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} step={step} style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px', background: disabled ? '#f9fafb' : '#fff' }} />
  </div>
);

const Select = ({ label, value, onChange, options }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>{label}</label>
    <select value={value ?? ''} onChange={e => onChange(e.target.value)} style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px' }}>
      {options.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  </div>
);
