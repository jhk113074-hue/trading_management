import React, { useState, useEffect } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Supplier } from '../types/supplier';

interface Props {
  initialSupplier?: Supplier;
  onClose: () => void;
}

export const SupplierModal: React.FC<Props> = ({ initialSupplier, onClose }) => {
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<Partial<Supplier>>({
    supplierCode: '', name: '', bizNumber: '', representative: '',
    phone: '', purchaseEmail: '', address: '', managerName: '', managerPhone: ''
  });

  useEffect(() => {
    if (initialSupplier) {
      setFormData(initialSupplier);
    }
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
      
      const finalData: Partial<Supplier> = {
        ...formData,
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
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '14px', width: '95%', maxWidth: '650px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e8ecf0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', borderRadius: '14px 14px 0 0' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>
              {initialSupplier ? 'Edit Supplier Details' : 'Add New Supplier'}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
              공급업체(원자재/제조사) 신규 등록 및 정보 스펙 기입
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: '22px', cursor: 'pointer' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <form onSubmit={e => e.preventDefault()}>
            
            <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0891b2', marginBottom: '12px', borderLeft: '3px solid #0891b2', paddingLeft: '8px' }}>🏭 공급업체 기본정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '24px' }}>
              <Input label="공급업체코드 (필수) ★" value={formData.supplierCode} onChange={(v: any) => handleChange('supplierCode', v)} disabled={!!initialSupplier} placeholder="예: SUP-001" />
              <Input label="공급업체명 (필수) ★" value={formData.name} onChange={(v: any) => handleChange('name', v)} placeholder="예: 국도화학 주식회사" />
              <Input label="사업자등록번호" value={formData.bizNumber} onChange={(v: any) => handleChange('bizNumber', v)} placeholder="000-00-00000" />
              <Input label="대표자명" value={formData.representative} onChange={(v: any) => handleChange('representative', v)} placeholder="대표이사 성명" />
            </div>

            <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0891b2', marginBottom: '12px', borderLeft: '3px solid #0891b2', paddingLeft: '8px' }}>📞 연락처정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '24px' }}>
              <Input label="대표전화번호" value={formData.phone} onChange={(v: any) => handleChange('phone', v)} placeholder="02-XXX-XXXX" />
              <Input label="구매담당 이메일" value={formData.purchaseEmail} onChange={(v: any) => handleChange('purchaseEmail', v)} type="email" placeholder="purchase@supplier.com" />
            </div>

            <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0891b2', marginBottom: '12px', borderLeft: '3px solid #0891b2', paddingLeft: '8px' }}>📍 주소정보</div>
            <div style={{ marginBottom: '24px' }}>
              <Input label="본사주소" value={formData.address} onChange={(v: any) => handleChange('address', v)} placeholder="도로명 주소 또는 영문 주소" />
            </div>

            <div style={{ fontWeight: 700, fontSize: '12.5px', color: '#0891b2', marginBottom: '12px', borderLeft: '3px solid #0891b2', paddingLeft: '8px' }}>👥 담당자정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
              <Input label="구매담당자명" value={formData.managerName} onChange={(v: any) => handleChange('managerName', v)} placeholder="담당 대리/과장 성명" />
              <Input label="구매담당자 연락처" value={formData.managerPhone} onChange={(v: any) => handleChange('managerPhone', v)} placeholder="휴대폰 또는 직통번호" />
            </div>

          </form>
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

const Input = ({ label, value, onChange, type = 'text', disabled = false, placeholder = '' }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>{label}</label>
    <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px', fontSize: '13px', background: disabled ? '#f9fafb' : '#fff' }} />
  </div>
);
