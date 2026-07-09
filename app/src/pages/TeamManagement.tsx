import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { db, firebaseConfig } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export const TeamManagement: React.FC = () => {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({ name: '', email: '', role: '팀원', department: '', position: '', joinDate: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalMessage, setModalMessage] = useState({ text: '', type: '' });
  
  const { userProfile } = useAuth();

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'users'));
      const querySnapshot = await getDocs(q);
      const membersData: any[] = [];
      querySnapshot.forEach((d) => {
        membersData.push({ id: d.id, ...d.data() });
      });
      // Client-side sort to ensure users without createdAt are still included
      membersData.sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA; // descending
      });
      setMembers(membersData);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setNewMember({ name: '', email: '', role: '팀원', department: '', position: '', joinDate: new Date().toISOString().split('T')[0] });
    setModalMessage({ text: '', type: '' });
    setShowModal(true);
  };

  const handleOpenEdit = (member: any) => {
    setEditingId(member.id);
    setNewMember({
      name: member.name,
      email: member.email,
      role: member.role,
      department: member.department || '',
      position: member.position || '',
      joinDate: member.joinDate || member.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0]
    });
    setModalMessage({ text: '', type: '' });
    setShowModal(true);
  };

  const handleSaveMember = async () => {
    if (!newMember.name || !newMember.email) return;
    setIsSubmitting(true);
    setModalMessage({ text: '', type: '' });
    try {
      if (editingId) {
        // 수정 로직
        await updateDoc(doc(db, 'users', editingId), {
          name: newMember.name,
          role: newMember.role,
          department: newMember.department,
          position: newMember.position,
          joinDate: newMember.joinDate
        });
        setShowModal(false);
        fetchMembers();
      } else {
        // 생성 로직
        const apps = getApps();
        let secondaryApp = apps.find(app => app.name === 'SecondaryApp');
        if (!secondaryApp) {
          secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
        }
        
        const secondaryAuth = getAuth(secondaryApp);
        const defaultPassword = 'ysacc1234!';
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newMember.email, defaultPassword);
        
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          name: newMember.name,
          email: newMember.email,
          role: newMember.role,
          department: newMember.department,
          position: newMember.position,
          joinDate: newMember.joinDate,
          createdAt: new Date().toISOString(),
          status: '활성'
        });

        await secondaryAuth.signOut();

        setShowModal(false);
        setNewMember({ name: '', email: '', role: '팀원', department: '', position: '', joinDate: '' });
        fetchMembers();
        window.alert(`성공적으로 생성되었습니다.\n기본 비밀번호: ${defaultPassword}`); // Try to use alert for success, but it's okay if blocked because modal closes
      }
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/email-already-in-use') {
        setModalMessage({ text: "이미 등록된 이메일입니다. 다른 이메일을 사용해주세요.", type: "error" });
      } else {
        setModalMessage({ text: "처리 실패: " + error.message, type: "error" });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (email: string) => {
    if (!window.confirm(`${email} 계정으로 비밀번호 재설정 이메일을 발송하시겠습니까?`)) return;
    try {
      const auth = getAuth();
      await sendPasswordResetEmail(auth, email);
      window.alert("비밀번호 재설정 이메일이 발송되었습니다.\n해당 직원이 메일함에서 링크를 클릭하여 비번을 초기화할 수 있습니다.");
    } catch (error: any) {
      console.error(error);
      window.alert("이메일 발송 실패: " + error.message);
    }
  };

  const handleDeleteMember = async (id: string) => {
    if (!window.confirm("정말 삭제하시겠습니까? (목록에서만 제거되며, 완전한 접속 차단은 Firebase 콘솔에서 진행해야 합니다)")) return;
    try {
      await deleteDoc(doc(db, 'users', id));
      fetchMembers();
    } catch (error) {
      alert("삭제 실패");
    }
  };

  if (userProfile?.role !== '관리자') {
    return <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>관리자만 접근할 수 있는 페이지입니다.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', color: 'var(--primary-color)', margin: 0, fontWeight: 'bold' }}>👥 팀원 관리</h2>
        <button className="btn btn-primary" onClick={handleOpenAdd}>+ 신규 팀원 등록</button>
      </div>

      <div className="bottom-panel" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <p style={{ padding: '20px' }}>데이터 로딩 중...</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
              <thead>
              <tr style={{ borderBottom: '1px solid #f1f5f9', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 'bold' }}>이름</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 'bold' }}>이메일</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 'bold' }}>부서</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 'bold' }}>직위</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 'bold' }}>입사일</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 'bold' }}>권한</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontWeight: 'bold' }}>가입일</th>
                <th style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 'bold' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>등록된 팀원이 없습니다.</td></tr>
              ) : members.map(member => (
                <tr key={member.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.2s' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <td style={{ padding: '16px 24px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{member.name}</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>{member.email}</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>{member.department || '-'}</td>
                  <td style={{ padding: '16px 24px', color: 'var(--text-secondary)' }}>{member.position || '-'}</td>
                  <td style={{ padding: '16px 24px', color: '#0f172a', fontWeight: 600 }}>{member.joinDate || member.createdAt?.split('T')[0] || '-'}</td>
                  <td style={{ padding: '16px 24px' }}>
                    <span className={`q-badge ${member.role === '관리자' ? 'q1' : 'q2'}`}>
                      {member.role}
                    </span>
                  </td>
                  <td style={{ padding: '16px 24px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : '-'}
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                    <button onClick={() => handleResetPassword(member.email)} className="btn" style={{ color: '#059669', border: 'none', padding: '4px 8px', marginRight: '8px', cursor: 'pointer' }}>비번 리셋</button>
                    <button onClick={() => handleOpenEdit(member)} className="btn" style={{ color: 'var(--focus-ring)', border: 'none', padding: '4px 8px', marginRight: '8px', cursor: 'pointer' }}>수정</button>
                    <button onClick={() => handleDeleteMember(member.id)} title="삭제" style={{ color: '#ef4444', border: 'none', padding: '4px 6px', background: 'none', fontSize: '14px', cursor: 'pointer' }}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h3 style={{ marginBottom: '20px' }}>{editingId ? '팀원 정보 수정' : '신규 팀원 추가'}</h3>
            
            {modalMessage.text && (
              <div style={{ padding: '12px', marginBottom: '16px', borderRadius: '6px', backgroundColor: modalMessage.type === 'error' ? '#fee2e2' : '#d1fae5', color: modalMessage.type === 'error' ? '#ef4444' : '#10b981', fontSize: '0.9rem', fontWeight: 'bold' }}>
                {modalMessage.text}
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>이름</label>
                <input style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '14px', outline: 'none' }} placeholder="성명을 입력하세요" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>이메일</label>
                <input type="email" style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '14px', outline: 'none', backgroundColor: editingId ? '#f1f5f9' : 'white', color: editingId ? 'var(--text-muted)' : 'inherit' }} placeholder="이메일 주소" value={newMember.email} onChange={e => setNewMember({...newMember, email: e.target.value})} disabled={!!editingId} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>부서</label>
                <input style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '14px', outline: 'none' }} placeholder="예: 경영지원, 설계팀, 생산관리 등" value={newMember.department} onChange={e => setNewMember({...newMember, department: e.target.value})} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>직급 / 직위</label>
                <input style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '14px', outline: 'none' }} placeholder="예: 대표이사, 부장, 사원 등" value={newMember.position} onChange={e => setNewMember({...newMember, position: e.target.value})} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>입사일</label>
                <input type="date" style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '14px', outline: 'none', backgroundColor: 'white' }} value={newMember.joinDate} onChange={e => setNewMember({...newMember, joinDate: e.target.value})} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>권한 설정</label>
                <select style={{ padding: '10px 12px', border: '1px solid var(--border-default)', borderRadius: '6px', fontSize: '14px', outline: 'none', backgroundColor: 'white' }} value={newMember.role} onChange={e => setNewMember({...newMember, role: e.target.value})}>
                  <option>팀원</option>
                  <option>매니저</option>
                  <option>관리자</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1 }} 
                onClick={handleSaveMember}
                disabled={isSubmitting}
              >
                {isSubmitting ? '저장 중...' : (editingId ? '수정하기' : '등록하기')}
              </button>
              <button className="btn" style={{ flex: 1 }} onClick={() => setShowModal(false)} disabled={isSubmitting}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
