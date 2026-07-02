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
}

export const MyCompanySettings: React.FC = () => {
  const [companies, setCompanies] = useState<MyCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MyCompany | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);

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
        bankForeignName: editForm.bankForeignName || ''
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
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '26px', color: '#0f172a', marginBottom: '8px', fontWeight: 800, letterSpacing: '-0.025em' }}>🏢 자사 정보 관리</h1>
        <p style={{ color: '#64748b' }}>견적서(PI), 발주서(PO) 등 수출 서류에 기본으로 표기되는 회사 정보를 관리합니다.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {companies.map(comp => (
          <div key={comp.id} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', overflow: 'hidden' }}>
            <div style={{ background: '#f8fafc', padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#0f172a' }}>
                {comp.id === 'YS' ? '영성ACC (YS ACC)' : '(주)와이에스에이씨씨 (YSACC CO.,LTD)'}
              </div>
              <div>
                {editingId === comp.id ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleCancel} disabled={saveLoading} style={{ padding: '6px 12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>취소</button>
                    <button onClick={handleSave} disabled={saveLoading} style={{ padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>저장</button>
                  </div>
                ) : (
                  <button onClick={() => handleEdit(comp)} style={{ padding: '6px 12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ✏️ 수정
                  </button>
                )}
              </div>
            </div>
            
            <div style={{ padding: '24px' }}>
              {editingId === comp.id && editForm ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>상호명 (국문)</label>
                    <input name="nameKo" value={editForm.nameKo || ''} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>상호명 (영문)</label>
                    <input name="nameEn" value={editForm.nameEn || ''} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>사업자등록번호</label>
                    <input name="bizNo" value={editForm.bizNo || ''} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>주소 (국문)</label>
                    <input name="addressKo" value={editForm.addressKo || ''} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>주소 (영문)</label>
                    <input name="addressEn" value={editForm.addressEn || ''} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>전화번호 (TEL)</label>
                    <input name="phone" value={editForm.phone || ''} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>팩스번호 (FAX)</label>
                    <input name="fax" value={editForm.fax || ''} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>담당자</label>
                    <input name="manager" value={editForm.manager || ''} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b', marginBottom: '12px' }}>첨부 파일 관리 (파일 선택 또는 업로드)</div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      {/* 사업자등록증 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '180px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>사업자등록증</span>
                          {editForm.bizLicenseUrl && (
                            <button onClick={() => handleFileDelete('bizLicense')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>삭제</button>
                          )}
                        </div>
                        {editForm.bizLicenseUrl ? (
                          <div style={{ width: '180px', height: '130px', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src={editForm.bizLicenseUrl} alt="사업자등록증 미리보기" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                          </div>
                        ) : (
                          <div>
                            <input type="file" id={`bizLicense_${comp.id}`} style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'bizLicense')} />
                            <label htmlFor={`bizLicense_${comp.id}`} style={{ display: 'flex', width: '180px', height: '130px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#f8fafc', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#64748b', cursor: 'pointer', flexDirection: 'column', gap: '4px' }}>
                              <span>📁</span>
                              <span>{uploadingField === 'bizLicense' ? '업로드 중...' : '파일 선택'}</span>
                            </label>
                          </div>
                        )}
                      </div>

                      {/* 통장사본 (원화) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '180px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>통장사본 (원화)</span>
                          {editForm.bankKrwUrl && (
                            <button onClick={() => handleFileDelete('bankKrw')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>삭제</button>
                          )}
                        </div>
                        {editForm.bankKrwUrl ? (
                          <div style={{ width: '180px', height: '130px', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src={editForm.bankKrwUrl} alt="통장사본(원화) 미리보기" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                          </div>
                        ) : (
                          <div>
                            <input type="file" id={`bankKrw_${comp.id}`} style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'bankKrw')} />
                            <label htmlFor={`bankKrw_${comp.id}`} style={{ display: 'flex', width: '180px', height: '130px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#f8fafc', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#64748b', cursor: 'pointer', flexDirection: 'column', gap: '4px' }}>
                              <span>📁</span>
                              <span>{uploadingField === 'bankKrw' ? '업로드 중...' : '파일 선택'}</span>
                            </label>
                          </div>
                        )}
                      </div>

                      {/* 통장사본 (외화) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '180px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>통장사본 (외화)</span>
                          {editForm.bankForeignUrl && (
                            <button onClick={() => handleFileDelete('bankForeign')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}>삭제</button>
                          )}
                        </div>
                        {editForm.bankForeignUrl ? (
                          <div style={{ width: '180px', height: '130px', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src={editForm.bankForeignUrl} alt="통장사본(외화) 미리보기" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                          </div>
                        ) : (
                          <div>
                            <input type="file" id={`bankForeign_${comp.id}`} style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'bankForeign')} />
                            <label htmlFor={`bankForeign_${comp.id}`} style={{ display: 'flex', width: '180px', height: '130px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#f8fafc', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#64748b', cursor: 'pointer', flexDirection: 'column', gap: '4px' }}>
                              <span>📁</span>
                              <span>{uploadingField === 'bankForeign' ? '업로드 중...' : '파일 선택'}</span>
                            </label>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>상호명 (국문)</div>
                    <div style={{ color: '#0f172a', fontWeight: 500 }}>{comp.nameKo}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>상호명 (영문)</div>
                    <div style={{ color: '#0f172a', fontWeight: 500 }}>{comp.nameEn}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>사업자등록번호</div>
                    <div style={{ color: '#0f172a', fontWeight: 500 }}>{comp.bizNo}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>주소 (국문)</div>
                    <div style={{ color: '#0f172a', fontWeight: 500 }}>{comp.addressKo}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>주소 (영문)</div>
                    <div style={{ color: '#0f172a', fontWeight: 500 }}>{comp.addressEn}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>전화번호 (TEL)</div>
                    <div style={{ color: '#0f172a', fontWeight: 500 }}>{comp.phone || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>팩스번호 (FAX)</div>
                    <div style={{ color: '#0f172a', fontWeight: 500 }}>{comp.fax || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>담당자</div>
                    <div style={{ color: '#0f172a', fontWeight: 500 }}>{comp.manager || '-'}</div>
                  </div>
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b', marginBottom: '12px' }}>첨부 파일 미리보기 (클릭 시 새 탭에서 원본 보기)</div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      {/* 사업자등록증 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>사업자등록증</div>
                        {comp.bizLicenseUrl ? (
                          <a href={comp.bizLicenseUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                            <div style={{ width: '180px', height: '130px', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img src={comp.bizLicenseUrl} alt="사업자등록증 미리보기" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            </div>
                          </a>
                        ) : (
                          <div style={{ width: '180px', height: '130px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
                            등록 안됨
                          </div>
                        )}
                      </div>

                      {/* 통장사본 (원화) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>통장사본 (원화)</div>
                        {comp.bankKrwUrl ? (
                          <a href={comp.bankKrwUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                            <div style={{ width: '180px', height: '130px', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img src={comp.bankKrwUrl} alt="통장사본(원화) 미리보기" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            </div>
                          </a>
                        ) : (
                          <div style={{ width: '180px', height: '130px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
                            등록 안됨
                          </div>
                        )}
                      </div>

                      {/* 통장사본 (외화) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>통장사본 (외화)</div>
                        {comp.bankForeignUrl ? (
                          <a href={comp.bankForeignUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                            <div style={{ width: '180px', height: '130px', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <img src={comp.bankForeignUrl} alt="통장사본(외화) 미리보기" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            </div>
                          </a>
                        ) : (
                          <div style={{ width: '180px', height: '130px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
                            등록 안됨
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
          <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
            <p>등록된 자사 정보가 없습니다.</p>
            <button onClick={handleInitData} style={{ marginTop: '16px', padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>초기 데이터 생성하기</button>
          </div>
        )}
      </div>
    </div>
  );
};
