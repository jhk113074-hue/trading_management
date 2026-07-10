import React, { useState, useEffect } from 'react';
import { collection, doc, getDocs, updateDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';

export interface MyCompany {
  id: string;
  nameKo: string;
  nameEn: string;
  bizNo: string;
  addressKo: string;
  addressEn: string;
  phone: string;
  fax: string;
  manager: string;
  bizLicenseUrl?: string;
  bizLicenseName?: string;
  bankKrwUrl?: string;
  bankKrwName?: string;
  bankForeignUrl?: string;
  bankForeignName?: string;
  bankKrwInfo?: string;
  bankForeignInfo?: string;
}

const renderFileThumbnail = (url: string, name: string) => {
  if (!url) return null;
  const lowerUrl = url.toLowerCase();
  
  // PDF 판별 (확장자 혹은 contentType)
  const isPdf = lowerUrl.includes('.pdf') || lowerUrl.includes('pdf');
  
  if (isPdf) {
    return (
      <iframe 
        src={`${url}#toolbar=0&navpanes=0&scrollbar=0`} 
        title={name} 
        style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none', backgroundColor: '#ffffff' }} 
      />
    );
  }
  
  // 디폴트로 이미지 렌더링 시도
  return (
    <img 
      src={url} 
      alt={name} 
      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
      onError={(e) => {
        // 이미지 로딩 실패 시 파일 아이콘과 텍스트로 보조 출력
        const target = e.target as HTMLElement;
        const parent = target.parentElement;
        if (parent) {
          parent.innerHTML = `<div style="padding: 10px; text-align: center; font-size: 0.75rem; color: var(--text-secondary); font-weight: 600;">📄 ${name || '첨부파일'}</div>`;
        }
      }}
    />
  );
};

interface ModelessWindowProps {
  name: string;
  url: string;
  onClose: () => void;
}

const ModelessWindow: React.FC<ModelessWindowProps> = ({ name, url, onClose }) => {
  const [position, setPosition] = useState({ x: window.innerWidth - 550, y: 150 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
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

  const lowerUrl = url.toLowerCase();
  const isPdf = lowerUrl.includes('.pdf') || lowerUrl.includes('pdf');

  const handleDownload = () => {
    const downloadUrl = url.includes('?') 
      ? `${url}&response-content-disposition=attachment` 
      : `${url}?response-content-disposition=attachment`;
    
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    link.setAttribute('download', name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: '500px',
        height: '600px',
        backgroundColor: '#ffffff',
        border: '1px solid var(--border-default)',
        borderRadius: '12px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <div
        onMouseDown={handleMouseDown}
        style={{
          padding: '12px 16px',
          background: '#f8fafc',
          borderBottom: '1px solid var(--border-color)',
          cursor: 'move',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none'
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
          📄 {name} 미리보기
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleDownload}
            style={{
              background: '#0ea5e9',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            💾 저장
          </button>
          <button
            onClick={onClose}
            style={{
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            닫기
          </button>
        </div>
      </div>

      <div style={{ flex: 1, backgroundColor: '#f1f5f9', padding: '8px' }}>
        {isPdf ? (
          <iframe
            src={url}
            title={name}
            style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#ffffff' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
            <img src={url} alt={name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
        )}
      </div>
    </div>
  );
};

export const MyCompanySettings: React.FC = () => {
  const [companies, setCompanies] = useState<MyCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MyCompany | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [modelessFile, setModelessFile] = useState<{ name: string; url: string } | null>(null);

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(doc(db, "companies", "YSACC"), "my_companies"));
      const data: MyCompany[] = [];
      snapshot.forEach(docSnap => {
        data.push({ id: docSnap.id, ...docSnap.data() } as MyCompany);
      });
      data.sort((a, b) => a.id.localeCompare(b.id));
      setCompanies(data);
    } catch (err) {
      console.error(err);
      alert("데이터를 불러오는데 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleEdit = (comp: MyCompany) => {
    setEditingId(comp.id);
    setEditForm({ ...comp });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editForm) return;
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  const [uploadingField, setUploadingField] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldKey: 'bizLicense' | 'bankKrw' | 'bankForeign') => {
    if (!e.target.files || !e.target.files[0] || !editForm) return;
    const file = e.target.files[0];
    const storageRef = ref(storage, `companies/YSACC/my_companies_files/${editForm.id}/${fieldKey}_${Date.now()}_${file.name}`);
    setUploadingField(fieldKey);
    try {
      const uploadTask = uploadBytesResumable(storageRef, file);
      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed', null, reject, resolve);
      });
      const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
      setEditForm(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          [`${fieldKey}Url`]: downloadURL,
          [`${fieldKey}Name`]: file.name
        };
      });
    } catch (err) {
      console.error(err);
      alert('파일 업로드에 실패했습니다.');
    } finally {
      setUploadingField(null);
      e.target.value = ''; // clear input
    }
  };

  const handleFileDelete = async (fieldKey: 'bizLicense' | 'bankKrw' | 'bankForeign') => {
    if (!editForm) return;
    if (!window.confirm('기존 첨부파일을 삭제하시겠습니까?')) return;
    
    // We don't necessarily delete from storage immediately to prevent orphaned refs if they cancel the save, 
    // but for simplicity we will just clear the URL in the form state. They need to save to persist.
    setEditForm(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [`${fieldKey}Url`]: '',
        [`${fieldKey}Name`]: ''
      };
    });
  };

  const handleSave = async () => {
    if (!editForm) return;
    setSaveLoading(true);
    try {
      await updateDoc(doc(db, "companies", "YSACC", "my_companies", editForm.id), {
        nameKo: editForm.nameKo || '',
        nameEn: editForm.nameEn || '',
        bizNo: editForm.bizNo || '',
        addressKo: editForm.addressKo || '',
        addressEn: editForm.addressEn || '',
        phone: editForm.phone || '',
        fax: editForm.fax || '',
        manager: editForm.manager || '',
        bizLicenseUrl: editForm.bizLicenseUrl || '',
        bizLicenseName: editForm.bizLicenseName || '',
        bankKrwUrl: editForm.bankKrwUrl || '',
        bankKrwName: editForm.bankKrwName || '',
        bankForeignUrl: editForm.bankForeignUrl || '',
        bankForeignName: editForm.bankForeignName || '',
        bankKrwInfo: editForm.bankKrwInfo || '',
        bankForeignInfo: editForm.bankForeignInfo || ''
      });
      alert("저장되었습니다.");
      setEditingId(null);
      setEditForm(null);
      fetchCompanies();
    } catch (err) {
      console.error(err);
      alert("저장에 실패했습니다.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleInitData = async () => {
    setLoading(true);
    try {
      const ysData = {
        nameKo: '영성ACC(YS ACC)',
        nameEn: 'YS ACC',
        bizNo: '730-17-00185',
        addressKo: '청주시 흥덕구 월명로 76, 111-201',
        addressEn: '111-201, 76, Wolmyeong-ro, Heungdeok-gu, Cheongju-si, Chungcheongbuk-do, Republic of Korea',
        phone: '',
        fax: '',
        manager: ''
      };
      const ysaccData = {
        nameKo: '(주)와이에스에이씨씨(YSACC CO.,LTD)',
        nameEn: 'YSACC CO., LTD.',
        bizNo: '217-87-00385',
        addressKo: '청주시 흥덕구 가로수로 1251, 201-1',
        addressEn: '201-1, 1251, Garosu-ro, Heungdeok-gu, Cheongju-si, Chungcheongbuk-do, Republic of Korea',
        phone: '+82-70-4141-2927',
        fax: '+82-303-3444-1130',
        manager: ''
      };

      await setDoc(doc(db, "companies", "YSACC", "my_companies", "YS"), ysData);
      await setDoc(doc(db, "companies", "YSACC", "my_companies", "YSACC"), ysaccData);
      
      alert("초기 데이터가 생성되었습니다.");
      fetchCompanies();
    } catch (err) {
      console.error(err);
      alert("초기화 실패");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>데이터를 불러오는 중...</div>;
  }

  return (
    <div style={{ padding: '24px 30px', maxWidth: '900px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '20px', color: '#1e293b', marginBottom: '6px', fontWeight: 800 }}>🏢 자사 정보 관리</h1>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>견적서(PI), 발주서(PO) 등 수출 서류에 기본으로 표기되는 회사 정보를 관리합니다.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {companies.map(comp => (
          <div key={comp.id} style={{ background: '#fff', borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', padding: '12px 20px', borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '54px', boxSizing: 'border-box' }}>
              <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#1e293b' }}>
                {comp.id === 'YS' ? '영성ACC (YS ACC)' : '(주)와이에스에이씨씨 (YSACC CO.,LTD)'}
              </div>
              <div style={{ height: '34px' }}>
                {editingId === comp.id ? (
                  <div style={{ display: 'flex', gap: '8px', height: '100%' }}>
                    <button 
                      onClick={handleCancel} 
                      disabled={saveLoading} 
                      style={{ padding: '0 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, transition: 'background 0.2s', height: '100%', boxSizing: 'border-box' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                    >취소</button>
                    <button 
                      onClick={handleSave} 
                      disabled={saveLoading} 
                      style={{ padding: '0 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, transition: 'background 0.2s', height: '100%', boxSizing: 'border-box' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#2563eb'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#3b82f6'}
                    >저장</button>
                  </div>
                ) : (
                  <button 
                    onClick={() => handleEdit(comp)} 
                    style={{ padding: '0 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', borderRadius: '4px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s', height: '100%', boxSizing: 'border-box' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                  >
                    ✏️ 수정
                  </button>
                )}
              </div>
            </div>
            
            <div style={{ padding: '24px' }}>
              {editingId === comp.id && editForm ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '6px' }}>상호명 (국문)</label>
                    <input name="nameKo" value={editForm.nameKo || ''} onChange={handleChange} style={{ width: '100%', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', height: '34px', fontSize: '13px', color: '#1e293b', boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '6px' }}>상호명 (영문)</label>
                    <input name="nameEn" value={editForm.nameEn || ''} onChange={handleChange} style={{ width: '100%', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', height: '34px', fontSize: '13px', color: '#1e293b', boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '6px' }}>사업자등록번호</label>
                    <input name="bizNo" value={editForm.bizNo || ''} onChange={handleChange} style={{ width: '100%', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', height: '34px', fontSize: '13px', color: '#1e293b', boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '6px' }}>주소 (국문)</label>
                    <input name="addressKo" value={editForm.addressKo || ''} onChange={handleChange} style={{ width: '100%', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', height: '34px', fontSize: '13px', color: '#1e293b', boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '6px' }}>주소 (영문)</label>
                    <input name="addressEn" value={editForm.addressEn || ''} onChange={handleChange} style={{ width: '100%', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', height: '34px', fontSize: '13px', color: '#1e293b', boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '6px' }}>전화번호 (TEL)</label>
                    <input name="phone" value={editForm.phone || ''} onChange={handleChange} style={{ width: '100%', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', height: '34px', fontSize: '13px', color: '#1e293b', boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '6px' }}>팩스번호 (FAX)</label>
                    <input name="fax" value={editForm.fax || ''} onChange={handleChange} style={{ width: '100%', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', height: '34px', fontSize: '13px', color: '#1e293b', boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '6px' }}>담당자</label>
                    <input name="manager" value={editForm.manager || ''} onChange={handleChange} style={{ width: '100%', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: '4px', height: '34px', fontSize: '13px', color: '#1e293b', boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #cbd5e1', paddingTop: '16px', marginTop: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: '12px' }}>첨부 파일 관리 (파일 선택 또는 업로드)</div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      {/* 사업자등록증 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '180px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>사업자등록증</span>
                          {editForm.bizLicenseUrl && (
                            <button onClick={() => handleFileDelete('bizLicense')} title="삭제" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>🗑️</button>
                          )}
                        </div>
                        {editForm.bizLicenseUrl ? (
                          <div onClick={() => setModelessFile({ name: editForm.bizLicenseName || '사업자등록증', url: editForm.bizLicenseUrl! })} style={{ width: '180px', height: '130px', border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            {renderFileThumbnail(editForm.bizLicenseUrl, editForm.bizLicenseName || '사업자등록증')}
                          </div>
                        ) : (
                          <div>
                            <input type="file" id={`bizLicense_${comp.id}`} style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'bizLicense')} />
                            <label htmlFor={`bizLicense_${comp.id}`} style={{ display: 'flex', width: '180px', height: '130px', border: '1px dashed var(--border-default)', borderRadius: '8px', background: '#f8fafc', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', flexDirection: 'column', gap: '4px' }}>
                              <span>📁</span>
                              <span>{uploadingField === 'bizLicense' ? '업로드 중...' : '파일 선택'}</span>
                            </label>
                          </div>
                        )}
                      </div>

                      {/* 통장사본 (원화) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '180px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>통장사본 (원화)</span>
                          {editForm.bankKrwUrl && (
                            <button onClick={() => handleFileDelete('bankKrw')} title="삭제" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>🗑️</button>
                          )}
                        </div>
                        {editForm.bankKrwUrl ? (
                          <div onClick={() => setModelessFile({ name: editForm.bankKrwName || '통장사본(원화)', url: editForm.bankKrwUrl! })} style={{ width: '180px', height: '130px', border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            {renderFileThumbnail(editForm.bankKrwUrl, editForm.bankKrwName || '통장사본(원화)')}
                          </div>
                        ) : (
                          <div>
                            <input type="file" id={`bankKrw_${comp.id}`} style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'bankKrw')} />
                            <label htmlFor={`bankKrw_${comp.id}`} style={{ display: 'flex', width: '180px', height: '130px', border: '1px dashed var(--border-default)', borderRadius: '8px', background: '#f8fafc', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', flexDirection: 'column', gap: '4px' }}>
                              <span>📁</span>
                              <span>{uploadingField === 'bankKrw' ? '업로드 중...' : '파일 선택'}</span>
                            </label>
                          </div>
                        )}
                        <input
                          type="text"
                          placeholder="은행명, 계좌번호, 예금주"
                          name="bankKrwInfo"
                          value={editForm.bankKrwInfo || ''}
                          onChange={handleChange}
                          style={{ width: '180px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', height: '34px', fontSize: '12px', color: '#1e293b', boxSizing: 'border-box', outline: 'none', marginTop: '4px' }}
                        />
                      </div>

                      {/* 통장사본 (외화) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '180px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>통장사본 (외화)</span>
                          {editForm.bankForeignUrl && (
                            <button onClick={() => handleFileDelete('bankForeign')} title="삭제" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>🗑️</button>
                          )}
                        </div>
                        {editForm.bankForeignUrl ? (
                          <div onClick={() => setModelessFile({ name: editForm.bankForeignName || '통장사본(외화)', url: editForm.bankForeignUrl! })} style={{ width: '180px', height: '130px', border: '1px solid var(--border-default)', borderRadius: '8px', overflow: 'hidden', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            {renderFileThumbnail(editForm.bankForeignUrl, editForm.bankForeignName || '통장사본(외화)')}
                          </div>
                        ) : (
                          <div>
                            <input type="file" id={`bankForeign_${comp.id}`} style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'bankForeign')} />
                            <label htmlFor={`bankForeign_${comp.id}`} style={{ display: 'flex', width: '180px', height: '130px', border: '1px dashed var(--border-default)', borderRadius: '8px', background: '#f8fafc', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', flexDirection: 'column', gap: '4px' }}>
                              <span>📁</span>
                              <span>{uploadingField === 'bankForeign' ? '업로드 중...' : '파일 선택'}</span>
                            </label>
                          </div>
                        )}
                        <input
                          type="text"
                          placeholder="은행명, 계좌번호, 예금주"
                          name="bankForeignInfo"
                          value={editForm.bankForeignInfo || ''}
                          onChange={handleChange}
                          style={{ width: '180px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px', height: '34px', fontSize: '12px', color: '#1e293b', boxSizing: 'border-box', outline: 'none', marginTop: '4px' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '4px' }}>상호명 (국문)</div>
                    <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '13.5px' }}>{comp.nameKo}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '4px' }}>상호명 (영문)</div>
                    <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '13.5px' }}>{comp.nameEn}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '4px' }}>사업자등록번호</div>
                    <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '13.5px' }}>{comp.bizNo}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '4px' }}>주소 (국문)</div>
                    <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '13.5px' }}>{comp.addressKo}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '4px' }}>주소 (영문)</div>
                    <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '13.5px' }}>{comp.addressEn}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '4px' }}>전화번호 (TEL)</div>
                    <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '13.5px' }}>{comp.phone || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '4px' }}>팩스번호 (FAX)</div>
                    <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '13.5px' }}>{comp.fax || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase', marginBottom: '4px' }}>담당자</div>
                    <div style={{ color: '#1e293b', fontWeight: 600, fontSize: '13.5px' }}>{comp.manager || '-'}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #cbd5e1', paddingTop: '16px', marginTop: '8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: '12px' }}>첨부 파일 미리보기 (클릭 시 화면에서 바로 볼 수 있는 창 띄우기)</div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      {/* 사업자등록증 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>사업자등록증</div>
                        {comp.bizLicenseUrl ? (
                          <a href={comp.bizLicenseUrl} onClick={e => { e.preventDefault(); setModelessFile({ name: comp.bizLicenseName || '사업자등록증', url: comp.bizLicenseUrl! }); }} style={{ textDecoration: 'none', cursor: 'pointer' }}>
                            <div style={{ width: '180px', height: '130px', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {renderFileThumbnail(comp.bizLicenseUrl, comp.bizLicenseName || '사업자등록증')}
                            </div>
                          </a>
                        ) : (
                          <div style={{ width: '180px', height: '130px', border: '1px dashed #cbd5e1', borderRadius: '4px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#94a3b8' }}>
                            등록 안됨
                          </div>
                        )}
                      </div>

                      {/* 통장사본 (원화) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>통장사본 (원화)</div>
                        {comp.bankKrwUrl ? (
                          <a href={comp.bankKrwUrl} onClick={e => { e.preventDefault(); setModelessFile({ name: comp.bankKrwName || '통장사본(원화)', url: comp.bankKrwUrl! }); }} style={{ textDecoration: 'none', cursor: 'pointer' }}>
                            <div style={{ width: '180px', height: '130px', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {renderFileThumbnail(comp.bankKrwUrl, comp.bankKrwName || '통장사본(원화)')}
                            </div>
                          </a>
                        ) : (
                          <div style={{ width: '180px', height: '130px', border: '1px dashed #cbd5e1', borderRadius: '4px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#94a3b8' }}>
                            등록 안됨
                          </div>
                        )}
                        {comp.bankKrwInfo && (
                          <div style={{ width: '180px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px', fontSize: '12px', color: '#1e293b', fontWeight: 700, boxSizing: 'border-box', wordBreak: 'break-all', textAlign: 'center' }}>
                            {comp.bankKrwInfo}
                          </div>
                        )}
                      </div>

                      {/* 통장사본 (외화) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 750, color: '#475569', letterSpacing: '0.02em', textTransform: 'uppercase' }}>통장사본 (외화)</div>
                        {comp.bankForeignUrl ? (
                          <a href={comp.bankForeignUrl} onClick={e => { e.preventDefault(); setModelessFile({ name: comp.bankForeignName || '통장사본(외화)', url: comp.bankForeignUrl! }); }} style={{ textDecoration: 'none', cursor: 'pointer' }}>
                            <div style={{ width: '180px', height: '130px', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {renderFileThumbnail(comp.bankForeignUrl, comp.bankForeignName || '통장사본(외화)')}
                            </div>
                          </a>
                        ) : (
                          <div style={{ width: '180px', height: '130px', border: '1px dashed #cbd5e1', borderRadius: '4px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#94a3b8' }}>
                            등록 안됨
                          </div>
                        )}
                        {comp.bankForeignInfo && (
                          <div style={{ width: '180px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '6px 8px', fontSize: '12px', color: '#1e293b', fontWeight: 700, boxSizing: 'border-box', wordBreak: 'break-all', textAlign: 'center' }}>
                            {comp.bankForeignInfo}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {companies.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed var(--border-default)', color: 'var(--text-secondary)' }}>
            <p>등록된 자사 정보가 없습니다.</p>
            <button onClick={handleInitData} style={{ marginTop: '16px', padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>초기 데이터 생성하기</button>
          </div>
        )}
      </div>

      {/* 모달리스 드래그 미리보기 창 */}
      {modelessFile && (
        <ModelessWindow
          name={modelessFile.name}
          url={modelessFile.url}
          onClose={() => setModelessFile(null)}
        />
      )}
    </div>
  );
};
