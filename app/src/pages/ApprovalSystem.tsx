import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import type { User } from '../types';

interface ApprovalDoc {
  id: string;
  title: string;
  docType: 'DRAFT' | 'EXPENSE' | 'LEAVE';
  content: string;
  amount?: number;
  requesterId: string;
  requesterName: string;
  approverId: string;
  approverName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectReason?: string;
  createdAt: string;
  approvedBy?: string;
}

export const ApprovalSystem: React.FC = () => {
  const { userProfile } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [documents, setDocuments] = useState<ApprovalDoc[]>([]);
  const [activeTab, setActiveTab] = useState<'pending' | 'submitted' | 'archive'>('pending');
  const [loading, setLoading] = useState(true);

  // Draft Form State
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [docType, setDocType] = useState<'DRAFT' | 'EXPENSE'>('DRAFT');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [selectedApproverId, setSelectedApproverId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // View Document Modal
  const [selectedDoc, setSelectedDoc] = useState<ApprovalDoc | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const fetchApprovalData = async () => {
    setLoading(true);
    try {
      // 1. Fetch users to choose approver
      const usersSnap = await getDocs(collection(db, 'users'));
      const usersList: User[] = [];
      usersSnap.forEach(d => {
        usersList.push({ id: d.id, ...d.data() } as User);
      });
      setUsers(usersList);

      // 2. Fetch approvals
      const docSnap = await getDocs(collection(db, 'approvals'));
      const docList: ApprovalDoc[] = [];
      docSnap.forEach(d => {
        docList.push({ id: d.id, ...d.data() } as ApprovalDoc);
      });
      // Sort by newest
      docList.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setDocuments(docList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovalData();
  }, []);

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    if (!selectedApproverId) {
      alert("결재권자를 지정해 주세요.");
      return;
    }

    const targetApprover = users.find(u => u.id === selectedApproverId);
    if (!targetApprover) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'approvals'), {
        title,
        docType,
        content,
        amount: docType === 'EXPENSE' ? Number(amount) : null,
        requesterId: userProfile.id,
        requesterName: userProfile.name,
        approverId: selectedApproverId,
        approverName: targetApprover.name,
      });

      await addDoc(collection(db, 'mails'), {
        senderId: userProfile.id,
        senderName: userProfile.name,
        receiverId: selectedApproverId,
        receiverName: targetApprover.name,
        title: `[알림] 결재 기안서가 상신되었습니다: ${title}`,
        content: `${userProfile.name}님이 결재 기안서 "${title}"를 상신했습니다.\n\n구분: ${docType === 'EXPENSE' ? '지출결의서' : '일반기안서'}\n\n전자결재 메뉴에서 결재해 주시기 바랍니다.`,
        isRead: false,
        createdAt: new Date().toISOString()
      });

      setTitle('');
      setContent('');
      setAmount('');
      setSelectedApproverId('');
      setShowDraftModal(false);
      fetchApprovalData();
      alert("기안이 완료되었습니다.");
    } catch (err) {
      console.error(err);
      alert("기안 상신에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (docId: string) => {
    if (!userProfile) return;
    if (!window.confirm("이 기안을 승인하시겠습니까?")) return;

    try {
      const targetDoc = documents.find(d => d.id === docId);
      await updateDoc(doc(db, 'approvals', docId), {
        status: 'APPROVED',
        approvedBy: userProfile.name
      });

      if (targetDoc) {
        await addDoc(collection(db, 'mails'), {
          senderId: 'SYSTEM',
          senderName: '시스템 알림',
          receiverId: targetDoc.requesterId,
          receiverName: targetDoc.requesterName,
          title: `[알림] 기안 결재 승인: ${targetDoc.title}`,
          content: `${userProfile.name}님이 기안서 "${targetDoc.title}"를 승인하였습니다.`,
          isRead: false,
          createdAt: new Date().toISOString()
        });
      }

      setSelectedDoc(null);
      fetchApprovalData();
      alert("기안이 최종 승인되었습니다.");
    } catch (err) {
      console.error(err);
      alert("승인 처리에 실패했습니다.");
    }
  };

  const handleReject = async (docId: string) => {
    if (!userProfile) return;
    if (!rejectReason) {
      alert("반려 사유를 입력해 주세요.");
      return;
    }

    try {
      const targetDoc = documents.find(d => d.id === docId);
      await updateDoc(doc(db, 'approvals', docId), {
        status: 'REJECTED',
        rejectReason,
        approvedBy: userProfile.name
      });

      if (targetDoc) {
        await addDoc(collection(db, 'mails'), {
          senderId: 'SYSTEM',
          senderName: '시스템 알림',
          receiverId: targetDoc.requesterId,
          receiverName: targetDoc.requesterName,
          title: `[알림] 기안 결재 반려: ${targetDoc.title}`,
          content: `${userProfile.name}님이 기안서 "${targetDoc.title}"를 반려하였습니다.\n\n반려 사유: "${rejectReason}"`,
          isRead: false,
          createdAt: new Date().toISOString()
        });
      }

      setSelectedDoc(null);
      setRejectReason('');
      setShowRejectInput(false);
      fetchApprovalData();
      alert("기안이 반려 처리되었습니다.");
    } catch (err) {
      console.error(err);
      alert("반려 처리에 실패했습니다.");
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>데이터를 불러오는 중...</div>;
  }

  // Filter lists based on roles and tabs
  const pendingDocs = documents.filter(d => d.approverId === userProfile?.id && d.status === 'PENDING');
  const submittedDocs = documents.filter(d => d.requesterId === userProfile?.id);
  const archiveDocs = documents.filter(d => d.status !== 'PENDING' && (d.requesterId === userProfile?.id || d.approverId === userProfile?.id || userProfile?.role === '관리자'));

  const activeList = activeTab === 'pending' ? pendingDocs : activeTab === 'submitted' ? submittedDocs : archiveDocs;

  // Potential approvers list (managers, admins, or other users)
  const potentialApprovers = users.filter(u => u.id !== userProfile?.id && (u.role === '관리자' || u.role === '매니저'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 850, color: 'var(--primary-color)', margin: 0 }}>✍️ 전자결재 시스템</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>온라인 기안 상신, 결재선 지정, 실시간 품의서 결재 및 반려 보관 시스템입니다.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowDraftModal(true)}>
          📝 새 결재 기안서 작성
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', gap: '8px' }}>
        <button
          onClick={() => setActiveTab('pending')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            color: activeTab === 'pending' ? '#4f46e5' : '#64748b',
            borderBottom: activeTab === 'pending' ? '2.5px solid #4f46e5' : 'none'
          }}
        >
          📥 결재 대기 문서 ({pendingDocs.length})
        </button>
        <button
          onClick={() => setActiveTab('submitted')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            color: activeTab === 'submitted' ? '#4f46e5' : '#64748b',
            borderBottom: activeTab === 'submitted' ? '2.5px solid #4f46e5' : 'none'
          }}
        >
          📤 나의 상신 문서 ({submittedDocs.length})
        </button>
        <button
          onClick={() => setActiveTab('archive')}
          style={{
            padding: '10px 16px',
            border: 'none',
            background: 'none',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            color: activeTab === 'archive' ? '#4f46e5' : '#64748b',
            borderBottom: activeTab === 'archive' ? '2.5px solid #4f46e5' : 'none'
          }}
        >
          📁 결재 완료 보관함 ({archiveDocs.length})
        </button>
      </div>

      {/* List Container */}
      <div style={{ background: '#fff', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left', fontWeight: 'bold' }}>
                <th style={{ padding: '12px' }}>문서 종류</th>
                <th style={{ padding: '12px' }}>기안 제목</th>
                <th style={{ padding: '12px' }}>기안자</th>
                <th style={{ padding: '12px' }}>결재선 (결재권자)</th>
                <th style={{ padding: '12px' }}>기안일시</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>결재 상태</th>
              </tr>
            </thead>
            <tbody>
              {activeList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    보관함에 보관된 문서가 존재하지 않습니다.
                  </td>
                </tr>
              ) : (
                activeList.map(doc => (
                  <tr
                    key={doc.id}
                    onClick={() => {
                      setSelectedDoc(doc);
                      setShowRejectInput(false);
                    }}
                    style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: doc.docType === 'EXPENSE' ? '#fef3c7' : '#eff6ff',
                        color: doc.docType === 'EXPENSE' ? '#b45309' : '#1e40af'
                      }}>
                        {doc.docType === 'EXPENSE' ? '지출결의서' : '일반기안서'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontWeight: 800, color: '#0f172a' }}>
                      {doc.title} {doc.docType === 'EXPENSE' && `($${doc.amount?.toLocaleString()})`}
                    </td>
                    <td style={{ padding: '12px', color: '#475569' }}>{doc.requesterName}</td>
                    <td style={{ padding: '12px', color: '#64748b' }}>👤 {doc.approverName}</td>
                    <td style={{ padding: '12px', color: '#94a3b8', fontSize: '11.5px' }}>{new Date(doc.createdAt).toLocaleString()}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '11.5px',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '20px',
                        background: doc.status === 'APPROVED' ? '#d1fae5' : doc.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                        color: doc.status === 'APPROVED' ? '#065f46' : doc.status === 'REJECTED' ? '#991b1b' : '#92400e'
                      }}>
                        {doc.status === 'APPROVED' ? '승인완료' : doc.status === 'REJECTED' ? '반려됨' : '결재대기'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Draft Creation Modal */}
      {showDraftModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '520px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', background: '#4f46e5', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 800 }}>📝 새 결재 문서 기안 상신</span>
              <button onClick={() => setShowDraftModal(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>
            
            <form onSubmit={handleCreateDraft} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '80vh', overflowY: 'auto' }}>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>결재 양식</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setDocType('DRAFT')}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: '6px',
                      border: docType === 'DRAFT' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                      background: docType === 'DRAFT' ? '#eff6ff' : '#fff',
                      color: docType === 'DRAFT' ? '#4f46e5' : '#475569',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    일반 기안서
                  </button>
                  <button
                    type="button"
                    onClick={() => setDocType('EXPENSE')}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      borderRadius: '6px',
                      border: docType === 'EXPENSE' ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                      background: docType === 'EXPENSE' ? '#eff6ff' : '#fff',
                      color: docType === 'EXPENSE' ? '#4f46e5' : '#475569',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    지출 결의서
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>기안 제목 ★</label>
                <input
                  type="text"
                  required
                  placeholder="예: [설계부] 서버 구매 품의서 건"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                />
              </div>

              {docType === 'EXPENSE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>결의 금액 ($) ★</label>
                  <input
                    type="number"
                    required
                    placeholder="결의 총 금액을 입력하세요"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>기안 내용 ★</label>
                <textarea
                  rows={6}
                  required
                  placeholder="상세 내용을 적어주세요. 사유, 품목 및 예산 등을 세부 기술하십시오."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>결재선 지정 (결재권자) ★</label>
                <select
                  required
                  value={selectedApproverId}
                  onChange={e => setSelectedApproverId(e.target.value)}
                  style={{ padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', outline: 'none', backgroundColor: 'white' }}
                >
                  <option value="">결재권자를 선택해 주세요</option>
                  {potentialApprovers.map(approver => (
                    <option key={approver.id} value={approver.id}>
                      {approver.name} ({approver.department || '인사'} / {approver.position || '관리자'})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px 0', fontWeight: 800 }}
                >
                  {isSubmitting ? '기안서 전송 중...' : '기안 상신'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDraftModal(false)}
                  style={{ flex: 1, padding: '12px 0', background: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700 }}
                >
                  취소
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Document View Details Modal */}
      {selectedDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '640px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', background: '#1e293b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '15px', fontWeight: 800 }}>📄 품의/결재 문서 상세보기</span>
              <button onClick={() => setSelectedDoc(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Document Body (Traditional Corporate Stamp Look) */}
            <div style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              
              {/* Document Stamp Box Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #0f172a', paddingBottom: '16px' }}>
                <div>
                  <h1 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>
                    {selectedDoc.docType === 'EXPENSE' ? '지 출 결 의 서' : '기 안 품 의 서'}
                  </h1>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>등록번호: {selectedDoc.id.substring(0, 8).toUpperCase()}</span>
                </div>
                
                {/* Visual Approval Box Table */}
                <table style={{ border: '1px solid #cbd5e1', borderCollapse: 'collapse', textAlign: 'center', fontSize: '11px' }}>
                  <tbody>
                    <tr>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', background: '#f8fafc', color: '#475569', fontWeight: 'bold' }}>기안자</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px 8px', background: '#f8fafc', color: '#475569', fontWeight: 'bold' }}>결재권자</td>
                    </tr>
                    <tr style={{ height: '48px' }}>
                      <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 800, color: '#334155' }}>{selectedDoc.requesterName}</div>
                        <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>상신</div>
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '8px 12px', verticalAlign: 'middle', minWidth: '70px' }}>
                        {selectedDoc.status === 'APPROVED' ? (
                          <>
                            <div style={{ fontWeight: 900, color: '#059669', fontSize: '12px' }}>✓ 승인</div>
                            <div style={{ fontSize: '9px', color: '#94a3b8' }}>{selectedDoc.approvedBy}</div>
                          </>
                        ) : selectedDoc.status === 'REJECTED' ? (
                          <>
                            <div style={{ fontWeight: 900, color: '#dc2626', fontSize: '12px' }}>✕ 반려</div>
                            <div style={{ fontSize: '9px', color: '#94a3b8' }}>{selectedDoc.approvedBy}</div>
                          </>
                        ) : (
                          <div style={{ color: '#d97706', fontStyle: 'italic' }}>대기중</div>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Meta details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div><strong>상신 일시:</strong> {new Date(selectedDoc.createdAt).toLocaleString()}</div>
                <div><strong>결재 권한:</strong> {selectedDoc.approverName}</div>
                {selectedDoc.docType === 'EXPENSE' && (
                  <div style={{ gridColumn: '1 / span 2', color: '#b45309', fontWeight: 'bold', fontSize: '13.5px', marginTop: '4px' }}>
                    지출 결의 총액: ${selectedDoc.amount?.toLocaleString()}
                  </div>
                )}
              </div>

              {/* Draft Description Content */}
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '20px', minHeight: '120px', background: '#fff', fontSize: '13.5px', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#334155' }}>
                {selectedDoc.content}
              </div>

              {/* Rejection comments */}
              {selectedDoc.status === 'REJECTED' && selectedDoc.rejectReason && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '14px 18px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#991b1b' }}>반려 피드백/의견:</div>
                  <div style={{ fontSize: '13px', color: '#b91c1c', marginTop: '4px', fontStyle: 'italic' }}>"{selectedDoc.rejectReason}"</div>
                </div>
              )}

              {/* Reject Input Field */}
              {showRejectInput && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#fffbeb', border: '1px dashed #ca8a04', padding: '12px', borderRadius: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#854d0e' }}>반려 사유 작성 ★</label>
                  <input
                    type="text"
                    required
                    placeholder="예: 예산 검토 필요 또는 품목 재선정 바람"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '4px' }}>
                    <button
                      onClick={() => handleReject(selectedDoc.id)}
                      style={{ padding: '5px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      반려 최종완료
                    </button>
                    <button
                      onClick={() => setShowRejectInput(false)}
                      style={{ padding: '5px 12px', background: '#e2e8f0', border: 'none', borderRadius: '4px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Approval Action Footer Buttons (Only for the designated approver when pending) */}
            <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              {selectedDoc.status === 'PENDING' && selectedDoc.approverId === userProfile?.id && !showRejectInput && (
                <>
                  <button
                    onClick={() => handleApprove(selectedDoc.id)}
                    style={{ padding: '8px 18px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ✓ 기안 승인
                  </button>
                  <button
                    onClick={() => setShowRejectInput(true)}
                    style={{ padding: '8px 18px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ✕ 기안 반려
                  </button>
                </>
              )}
              <button
                onClick={() => setSelectedDoc(null)}
                style={{ padding: '8px 18px', background: '#e2e8f0', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                닫기
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
