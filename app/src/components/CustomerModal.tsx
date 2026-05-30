import React, { useState, useEffect } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import type { Customer } from '../types/customer';

interface Props {
  initialCustomer?: Customer;
  onClose: () => void;
}

export const CustomerModal: React.FC<Props> = ({ initialCustomer, onClose }) => {
  const [activeTab, setActiveTab] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<Partial<Customer>>({
    customerCode: '', name: '', nameKo: '', customerType: 'Buyer', countryCode: '', countryName: '', city: '', representative: '', industryType: '',
    phone: '', fax: '', email: '', website: '',
    addressEn: '', zipCode: '', shippingAddressEn: '', shippingZipCode: '',
    contactPerson: '', contactPhone: '', contactEmail: '',
    tradeStartDate: '', tradeStatus: 'Active', tradeGrade: 'A', paymentTerms: '', creditLimit: 0, currency: 'USD', tradeTeam: '',
    taxId: '', businessLicense: '', entityType: 'Corporation',
    bankName: '', bankAccount: '', swiftCode: '', iban: '', bankHolder: '',
    shippingPort: '', preferredIncoterms: 'FOB', customsBroker: '', customsInfo: '', hsCodeManaged: 'N',
    registrar: '', remarks: ''
  });

  useEffect(() => {
    if (initialCustomer) {
      setFormData(initialCustomer);
    } else {
      setFormData(prev => ({ ...prev, tradeStartDate: new Date().toISOString().split('T')[0] }));
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
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.4)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: '14px', width: '95%', maxWidth: '980px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
        
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
          <div style={{ display: 'flex', gap: '4px', background: '#f3f4f6', border: '1px solid #e8ecf0', padding: '4px', borderRadius: '8px', marginBottom: '22px' }}>
            {[
              { id: 1, label: '📑 1. 기본 정보' },
              { id: 2, label: '📞 2. 연락처 & 주소' },
              { id: 3, label: '💼 3. 거래 & 세무' },
              { id: 4, label: '🏦 4. 금융 & 물류' },
              { id: 5, label: '📝 5. 기타 & 비고' }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, padding: '9px', fontSize: '12px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer', border: 'none',
                  background: activeTab === tab.id ? '#2563eb' : 'transparent',
                  color: activeTab === tab.id ? '#fff' : '#6b7280'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {activeTab === 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                <Input label="고객코드 (필수) ★" value={formData.customerCode} onChange={(v: any) => handleChange('customerCode', v)} disabled={!!initialCustomer} placeholder="예: CUST-001" />
                <Input label="고객명_영문 (필수) ★" value={formData.name} onChange={(v: any) => handleChange('name', v)} placeholder="예: AL SHIRAWAI CO." />
                <Input label="고객약자 (Abbreviation)" value={formData.nameKo} onChange={(v: any) => handleChange('nameKo', v)} placeholder="예: ABC" />
                <Select label="고객 유형" value={formData.customerType} onChange={(v: any) => handleChange('customerType', v)} options={['Buyer', 'Agent', 'Distributor', 'Partner']} />
                <Input label="국가코드 (2자리)" value={formData.countryCode} onChange={(v: any) => handleChange('countryCode', v)} placeholder="예: AE" />
                <Input label="국가명" value={formData.countryName} onChange={(v: any) => handleChange('countryName', v)} placeholder="예: UAE" />
                <Input label="도시" value={formData.city} onChange={(v: any) => handleChange('city', v)} placeholder="예: DUBAI" />
                <Input label="대표자명" value={formData.representative} onChange={(v: any) => handleChange('representative', v)} placeholder="대표이사 성명" />
                <Input label="업종분류" value={formData.industryType} onChange={(v: any) => handleChange('industryType', v)} placeholder="예: 복합소재, 무역업" />
              </div>
            )}

            {activeTab === 2 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                  <Input label="국제전화번호" value={formData.phone} onChange={(v: any) => handleChange('phone', v)} placeholder="+971-4-XXX-XXXX" />
                  <Input label="팩스번호" value={formData.fax} onChange={(v: any) => handleChange('fax', v)} placeholder="+971-4-XXX-XXXX" />
                  <Input label="이메일" value={formData.email} onChange={(v: any) => handleChange('email', v)} type="email" placeholder="info@buyer.com" />
                  <Input label="웹사이트 URL" value={formData.website} onChange={(v: any) => handleChange('website', v)} placeholder="https://" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginTop: '16px' }}>
                  <Input label="주소_영문" value={formData.addressEn} onChange={(v: any) => handleChange('addressEn', v)} placeholder="영문 주소" />
                  <Input label="우편번호" value={formData.zipCode} onChange={(v: any) => handleChange('zipCode', v)} placeholder="Zip Code" />
                  <Input label="배송지주소_영문" value={formData.shippingAddressEn} onChange={(v: any) => handleChange('shippingAddressEn', v)} placeholder="실제 배송 영문지" />
                  <Input label="배송지우편번호" value={formData.shippingZipCode} onChange={(v: any) => handleChange('shippingZipCode', v)} placeholder="Zip Code" />
                </div>
                <div style={{ fontWeight: 700, fontSize: '12px', color: '#0891b2', marginTop: '20px', marginBottom: '12px', borderLeft: '3px solid #0891b2', paddingLeft: '8px' }}>👥 담당자 정보</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                  <Input label="담당자명_영문" value={formData.contactPerson} onChange={(v: any) => handleChange('contactPerson', v)} placeholder="Manager Name" />
                  <Input label="담당자 연락처" value={formData.contactPhone} onChange={(v: any) => handleChange('contactPhone', v)} placeholder="Phone/Mobile" />
                  <Input label="담당자 이메일" value={formData.contactEmail} onChange={(v: any) => handleChange('contactEmail', v)} type="email" placeholder="manager@buyer.com" />
                </div>
              </>
            )}

            {activeTab === 3 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                  <Input label="거래시작일" value={formData.tradeStartDate} onChange={(v: any) => handleChange('tradeStartDate', v)} type="date" />
                  <Select label="거래 상태" value={formData.tradeStatus} onChange={(v: any) => handleChange('tradeStatus', v)} options={['Active', 'Inactive', 'Blocked']} />
                  <Select label="거래 등급" value={formData.tradeGrade} onChange={(v: any) => handleChange('tradeGrade', v)} options={['S', 'A', 'B', 'C']} />
                  <Select label="거래 통화" value={formData.currency} onChange={(v: any) => handleChange('currency', v)} options={['USD', 'EUR', 'AED', 'KRW']} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginTop: '16px' }}>
                  <Input label="결제 조건 (상세)" value={formData.paymentTerms} onChange={(v: any) => handleChange('paymentTerms', v)} placeholder="예: 100% LC 90days at sight" />
                  <Input label="신용한도 (USD)" value={formData.creditLimit} onChange={(v: any) => handleChange('creditLimit', parseFloat(v) || 0)} type="number" placeholder="0" />
                  <Input label="거래담당팀" value={formData.tradeTeam} onChange={(v: any) => handleChange('tradeTeam', v)} placeholder="예: 해외영업2팀" />
                  <Input label="세금ID_VAT번호" value={formData.taxId} onChange={(v: any) => handleChange('taxId', v)} placeholder="VAT Number" />
                  <Input label="사업자등록증 번호" value={formData.businessLicense} onChange={(v: any) => handleChange('businessLicense', v)} placeholder="Business License No" />
                  <Select label="법인/개인구분" value={formData.entityType} onChange={(v: any) => handleChange('entityType', v)} options={['Corporation', 'Individual']} />
                </div>
              </>
            )}

            {activeTab === 4 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                <Input label="은행명" value={formData.bankName} onChange={(v: any) => handleChange('bankName', v)} placeholder="예: HSBC Dubai" />
                <Input label="계좌번호" value={formData.bankAccount} onChange={(v: any) => handleChange('bankAccount', v)} placeholder="Bank Account Number" />
                <Input label="SWIFT코드" value={formData.swiftCode} onChange={(v: any) => handleChange('swiftCode', v)} placeholder="SWIFT Code" />
                <Input label="IBAN" value={formData.iban} onChange={(v: any) => handleChange('iban', v)} placeholder="IBAN Code" />
                <Input label="예금주명_영문" value={formData.bankHolder} onChange={(v: any) => handleChange('bankHolder', v)} placeholder="Account Holder Name" />
                <Input label="기본 배송지 / 인도처" value={formData.shippingPort} onChange={(v: any) => handleChange('shippingPort', v)} placeholder="예: JEBEL ALI PORT" />
                <Select label="배송방법_Incoterms" value={formData.preferredIncoterms} onChange={(v: any) => handleChange('preferredIncoterms', v)} options={['EXW', 'FAS', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']} />
                <Input label="통관담당자명" value={formData.customsBroker} onChange={(v: any) => handleChange('customsBroker', v)} placeholder="Customs Broker" />
                <Input label="통관/선적 특기사항" value={formData.customsInfo} onChange={(v: any) => handleChange('customsInfo', v)} placeholder="특이사항 입력" />
                <Select label="HS코드 관리여부" value={formData.hsCodeManaged} onChange={(v: any) => handleChange('hsCodeManaged', v)} options={['N', 'Y']} />
              </div>
            )}

            {activeTab === 5 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <Input label="등록담당자명" value={formData.registrar} onChange={(v: any) => handleChange('registrar', v)} placeholder="Manager Name" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>비고 / 프로필 요약</label>
                  <textarea rows={4} value={formData.remarks} onChange={(e: any) => handleChange('remarks', e.target.value)} placeholder="기타 고객사 이력 및 프로필 요약" style={{ padding: '9px 11px', border: '1px solid #e8ecf0', borderRadius: '6px' }} />
                </div>
              </div>
            )}
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
