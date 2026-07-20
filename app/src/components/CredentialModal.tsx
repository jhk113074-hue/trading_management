import React, { useState, useEffect } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, COMPANY_ID } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { Credential } from '../types';

interface Props {
  initialCredential?: Credential;
  onClose: () => void;
}

export const CredentialModal: React.FC<Props> = ({ initialCredential, onClose }) => {
  const { userProfile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<Credential>>({
    siteName: '',
    homepageUrl: '',
    loginId: '',
    loginPw: '',
    remarks: ''
  });

  useEffect(() => {
    if (initialCredential) {
      setFormData(initialCredential);
    }
  }, [initialCredential]);

  const handleChange = (key: keyof Credential, val: any) => {
    setFormData(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    if (!formData.siteName?.trim()) {
      alert('사이트명을 입력해주세요.');
      return;
    }
    if (!formData.loginId?.trim()) {
      alert('ID를 입력해주세요.');
      return;
    }
    if (!formData.loginPw?.trim()) {
      alert('비밀번호(PW)를 입력해주세요.');
      return;
    }

    setIsSaving(true);
    try {
      // If updating, keep the ID, otherwise generate a unique path/ID
      const docId = initialCredential?.id || `cred_${Date.now()}`;
      
      const payload: any = {
        siteName: formData.siteName.trim(),
        homepageUrl: (formData.homepageUrl || '').trim(),
        loginId: formData.loginId.trim(),
        loginPw: formData.loginPw.trim(),
        remarks: (formData.remarks || '').trim(),
        updatedAt: serverTimestamp(),
        updatedBy: userProfile?.name || 'Unknown'
      };

      if (!initialCredential) {
        payload.createdAt = serverTimestamp();
      }

      await setDoc(doc(db, 'companies', COMPANY_ID, 'credentials', docId), payload, { merge: true });
      alert('✅ 저장되었습니다.');
      onClose();
    } catch (e: any) {
      alert('❌ 저장 실패: ' + e.message);
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#fff',
        width: '100%',
        maxWidth: '520px',
        borderRadius: '4px',
        border: '1px solid #cbd5e1',
        boxShadow: '0 20px 40px rgba(15,23,42,0.2)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '90vh'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #cbd5e1',
          background: '#fafafa',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderRadius: '4px 4px 0 0'
        }}>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', margin: 0 }}>
            {initialCredential ? '비밀번호 정보 수정' : '신규 비밀번호 등록'}
          </h2>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <Input 
            label="사이트명 ★" 
            value={formData.siteName} 
            onChange={(val: string) => handleChange('siteName', val)} 
            placeholder="예: 홈텍스, 무역인증"
          />

          <Input 
            label="홈페이지 주소 (URL)" 
            value={formData.homepageUrl} 
            onChange={(val: string) => handleChange('homepageUrl', val)} 
            placeholder="https://www.example.com"
          />

          <Input 
            label="로그인 ID ★" 
            value={formData.loginId} 
            onChange={(val: string) => handleChange('loginId', val)} 
            placeholder="아이디 또는 공인인증서 위치 등"
          />

          <Input 
            label="로그인 PW ★" 
            value={formData.loginPw} 
            onChange={(val: string) => handleChange('loginPw', val)} 
            placeholder="비밀번호"
            type="text" // 비밀번호 관리자에서는 관리 시 바로 입력 가능하도록 text 권장
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              비고 (인증서 필수 여부, 결제 비밀번호 등)
            </label>
            <textarea
              value={formData.remarks || ''}
              onChange={e => handleChange('remarks', e.target.value)}
              placeholder="예: 공인인증서 필요 / 결제 비밀번호: 010624..."
              style={{
                boxSizing: 'border-box',
                width: '100%',
                padding: '8px 10px',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#1e293b',
                outline: 'none',
                height: '80px',
                resize: 'vertical',
                fontFamily: 'inherit'
              }}
              onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
              onBlur={e => { e.target.style.borderColor = '#cbd5e1'; }}
            />
          </div>

        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid #cbd5e1',
          background: '#fafafa',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
          borderRadius: '0 0 4px 4px'
        }}>
          <button 
            onClick={onClose} 
            style={{
              padding: '0 18px',
              borderRadius: '4px',
              border: '1px solid #cbd5e1',
              background: '#f1f5f9',
              fontWeight: 700,
              color: '#475569',
              cursor: 'pointer',
              fontSize: '13px',
              transition: 'background 0.2s',
              height: '34px'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          >
            취소
          </button>
          <button 
            onClick={handleSave} 
            disabled={isSaving} 
            style={{
              padding: '0 18px',
              borderRadius: '4px',
              border: 'none',
              background: '#3b82f6',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '13px',
              transition: 'background 0.2s',
              height: '34px'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
          >
            {isSaving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
};

const Input = ({ label, value, onChange, type = 'text', placeholder = '' }: any) => {
  const isRequired = label?.includes('★');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
        {label?.replace(' ★', '')}
        {isRequired && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
      </label>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          boxSizing: 'border-box',
          width: '100%',
          padding: '0 10px',
          border: '1px solid #cbd5e1',
          borderRadius: '4px',
          fontSize: '13px',
          fontWeight: 600,
          color: '#1e293b',
          outline: 'none',
          height: '34px',
          transition: 'all 0.1s'
        }}
        onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
        onBlur={e => { e.target.style.borderColor = '#cbd5e1'; }}
      />
    </div>
  );
};
